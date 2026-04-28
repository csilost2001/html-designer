#!/usr/bin/env node
/**
 * Phase 4-beta: data/screen-items/<id>.json abolition.
 *
 * Usage:
 *   node scripts/migrate-screen-items-inline.mjs
 *   node scripts/migrate-screen-items-inline.mjs --apply
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DESIGNER_DATA_DIR ?? path.join(ROOT, "data");
const SCREENS_DIR = path.join(DATA_DIR, "screens");
const SCREEN_ITEMS_DIR = path.join(DATA_DIR, "screen-items");
const PROJECT_FILE = path.join(DATA_DIR, "project.json");
const SCREEN_SCHEMA_REF = "../schemas/v3/screen.v3.schema.json";
const APPLY = process.argv.includes("--apply");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyGrapesScreen(value) {
  return isRecord(value) && (Array.isArray(value.pages) || "frames" in value || "component" in value || "styles" in value);
}

function isScreenEntity(value) {
  return isRecord(value) && (
    value.$schema === SCREEN_SCHEMA_REF ||
    (typeof value.kind === "string" && typeof value.path === "string" && ("items" in value || "design" in value || "id" in value))
  );
}

function screenEntry(project, screenId) {
  const v3 = project?.entities?.screens;
  const legacy = project?.screens;
  const screens = Array.isArray(v3) ? v3 : Array.isArray(legacy) ? legacy : [];
  return screens.find((s) => s?.id === screenId) ?? null;
}

function itemsOf(file) {
  return Array.isArray(file?.items) ? file.items : [];
}

function buildEntity(screenId, entry, items) {
  const ts = new Date().toISOString();
  const updatedAt = typeof entry?.updatedAt === "string" ? entry.updatedAt : ts;
  return {
    $schema: SCREEN_SCHEMA_REF,
    id: screenId,
    name: typeof entry?.name === "string" && entry.name ? entry.name : screenId,
    ...(typeof entry?.description === "string" && entry.description ? { description: entry.description } : {}),
    ...(typeof entry?.maturity === "string" ? { maturity: entry.maturity } : {}),
    createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : updatedAt,
    updatedAt,
    kind: typeof entry?.kind === "string" && entry.kind ? entry.kind : "other",
    path: typeof entry?.path === "string" ? entry.path : "",
    ...(typeof entry?.groupId === "string" ? { groupId: entry.groupId } : {}),
    items,
    design: { designFileRef: `${screenId}.design.json` },
  };
}

async function existingScreenIds(project) {
  const ids = new Set();
  try {
    for (const file of await fs.readdir(SCREENS_DIR)) {
      if (file.endsWith(".json") && !file.endsWith(".design.json")) {
        ids.add(file.slice(0, -".json".length));
      }
    }
  } catch {
    // no screens directory
  }
  const entries = Array.isArray(project?.entities?.screens)
    ? project.entities.screens
    : Array.isArray(project?.screens)
      ? project.screens
      : [];
  for (const entry of entries) {
    if (typeof entry?.id === "string") ids.add(entry.id);
  }
  return [...ids].sort();
}

async function migrateOne(screenId, project) {
  const entityPath = path.join(SCREENS_DIR, `${screenId}.json`);
  const designPath = path.join(SCREENS_DIR, `${screenId}.design.json`);
  const itemsPath = path.join(SCREEN_ITEMS_DIR, `${screenId}.json`);
  const current = await readJson(entityPath);
  const legacyItems = await readJson(itemsPath);
  const actions = [];

  if (isLegacyGrapesScreen(current)) {
    actions.push(`move screens/${screenId}.json -> screens/${screenId}.design.json`);
    actions.push(`write screens/${screenId}.json as Screen v3 entity`);
    if (legacyItems) actions.push(`inline screen-items/${screenId}.json (${itemsOf(legacyItems).length} items)`);
    if (APPLY) {
      await fs.mkdir(SCREENS_DIR, { recursive: true });
      try {
        await fs.rename(entityPath, designPath);
      } catch {
        await writeJson(designPath, current);
      }
      await writeJson(entityPath, buildEntity(screenId, screenEntry(project, screenId), itemsOf(legacyItems)));
      if (legacyItems) await fs.unlink(itemsPath).catch(() => {});
    }
  } else if (isScreenEntity(current)) {
    const hasLegacyItems = !!legacyItems;
    const needsDesignRef = current.design?.designFileRef !== `${screenId}.design.json`;
    if (hasLegacyItems) actions.push(`inline screen-items/${screenId}.json (${itemsOf(legacyItems).length} items)`);
    if (needsDesignRef) actions.push(`normalize design.designFileRef`);
    if (APPLY && (hasLegacyItems || needsDesignRef)) {
      await writeJson(entityPath, {
        ...current,
        $schema: SCREEN_SCHEMA_REF,
        items: hasLegacyItems ? itemsOf(legacyItems) : (Array.isArray(current.items) ? current.items : []),
        updatedAt: new Date().toISOString(),
        design: { ...(isRecord(current.design) ? current.design : {}), designFileRef: `${screenId}.design.json` },
      });
      if (hasLegacyItems) await fs.unlink(itemsPath).catch(() => {});
    }
  } else if (legacyItems || await readJson(designPath)) {
    actions.push(`write screens/${screenId}.json as Screen v3 entity`);
    if (legacyItems) actions.push(`inline screen-items/${screenId}.json (${itemsOf(legacyItems).length} items)`);
    if (APPLY) {
      await writeJson(entityPath, buildEntity(screenId, screenEntry(project, screenId), itemsOf(legacyItems)));
      if (legacyItems) await fs.unlink(itemsPath).catch(() => {});
    }
  }

  return { screenId, actions };
}

const project = await readJson(PROJECT_FILE);
const ids = await existingScreenIds(project);
const results = [];
for (const id of ids) {
  const result = await migrateOne(id, project);
  if (result.actions.length > 0) results.push(result);
}

console.log(APPLY ? "apply mode" : "dry-run mode");
if (results.length === 0) {
  console.log("migration target: 0");
} else {
  for (const result of results) {
    console.log(`\n${result.screenId}`);
    for (const action of result.actions) console.log(`  - ${action}`);
  }
  console.log(`\nmigration target: ${results.length}`);
}
