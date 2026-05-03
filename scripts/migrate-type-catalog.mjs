#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_TARGET = "data/process-flows";
const SAMPLE_TARGET = "examples/retail/actions";
const TARGET_FILE_RE = /^cccccccc-000[5-8]-.*\.json$/;

function parseArgs(argv) {
  const options = { apply: false, target: DEFAULT_TARGET };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--target") {
      const value = argv[++i];
      if (!value) throw new Error("--target requires a directory");
      options.target = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function sameStringArray(left, right) {
  const a = Array.isArray(left) ? [...left].sort() : [];
  const b = Array.isArray(right) ? [...right].sort() : [];
  return stableJson(a) === stableJson(b);
}

function mergeCompatibleEntry(existing, incoming) {
  if (stableJson(existing) === stableJson(incoming)) return existing;
  const existingSchema = existing && existing.schema;
  const incomingSchema = incoming && incoming.schema;
  if (
    existingSchema &&
    incomingSchema &&
    existingSchema.type === "object" &&
    incomingSchema.type === "object" &&
    sameStringArray(existingSchema.required, incomingSchema.required)
  ) {
    return {
      ...existing,
      description: existing.description ?? incoming.description,
      schema: {
        ...existingSchema,
        properties: {
          ...(existingSchema.properties ?? {}),
          ...(incomingSchema.properties ?? {}),
        },
      },
    };
  }
  return null;
}

function responseTypesPathFor(targetDir) {
  const normalized = path.normalize(targetDir);
  if (normalized.endsWith(path.normalize(SAMPLE_TARGET))) {
    return path.join(path.dirname(normalized), "extensions", "response-types.json");
  }
  const parent = path.dirname(normalized);
  return path.join(parent, "extensions", "response-types.json");
}

function findJsonValueEnd(raw, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("Could not find end of JSON value");
}

function removeTopLevelTypeCatalog(raw) {
  const propMatch = /(^|\n)([ \t]*)"typeCatalog"[ \t]*:/m.exec(raw);
  if (!propMatch || propMatch.index === undefined) return raw;
  const lineStart = propMatch.index + propMatch[1].length;
  const colonIndex = raw.indexOf(":", propMatch.index);
  let valueStart = colonIndex + 1;
  while (/\s/.test(raw[valueStart])) valueStart++;
  const valueEnd = findJsonValueEnd(raw, valueStart);
  let removeEnd = valueEnd;
  while (/\s/.test(raw[removeEnd])) removeEnd++;
  if (raw[removeEnd] === ",") {
    removeEnd++;
    if (raw[removeEnd] === "\r" && raw[removeEnd + 1] === "\n") removeEnd += 2;
    else if (raw[removeEnd] === "\n") removeEnd++;
    return raw.slice(0, lineStart) + raw.slice(removeEnd);
  }
  let removeStart = lineStart;
  let before = lineStart - 1;
  while (before >= 0 && /[ \t]/.test(raw[before])) before--;
  if (raw[before] === ",") removeStart = before;
  return raw.slice(0, removeStart) + raw.slice(valueEnd);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(options.target);

  if (!(await exists(targetDir))) {
    throw new Error(`target directory not found: ${targetDir}`);
  }

  const files = (await fs.readdir(targetDir))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => path.normalize(options.target).endsWith(path.normalize(SAMPLE_TARGET)) ? TARGET_FILE_RE.test(file) : true)
    .sort();

  const responseTypesFile = responseTypesPathFor(options.target);
  const responseTypesDoc = await readJson(responseTypesFile, { namespace: "", responseTypes: {} });
  if (!responseTypesDoc || typeof responseTypesDoc !== "object") {
    throw new Error(`${responseTypesFile} must be an object`);
  }
  if (typeof responseTypesDoc.namespace !== "string") responseTypesDoc.namespace = "";
  if (!responseTypesDoc.responseTypes || typeof responseTypesDoc.responseTypes !== "object" || Array.isArray(responseTypesDoc.responseTypes)) {
    responseTypesDoc.responseTypes = {};
  }

  const migrations = [];
  const collisions = [];

  for (const file of files) {
    const filePath = path.join(targetDir, file);
    const raw = await fs.readFile(filePath, "utf8");
    const flow = JSON.parse(raw);
    const typeCatalog = flow && typeof flow === "object" ? flow.typeCatalog : undefined;
    if (!typeCatalog || typeof typeCatalog !== "object" || Array.isArray(typeCatalog)) continue;

    for (const [key, entry] of Object.entries(typeCatalog)) {
      const existing = responseTypesDoc.responseTypes[key];
      if (existing) {
        const merged = mergeCompatibleEntry(existing, entry);
        if (!merged) {
          collisions.push({ key, file });
          continue;
        }
        responseTypesDoc.responseTypes[key] = merged;
      } else {
        responseTypesDoc.responseTypes[key] = entry;
      }
    }
    migrations.push({ file, count: Object.keys(typeCatalog).length, raw });
  }

  if (collisions.length > 0) {
    console.error("typeCatalog migration aborted: conflicting response type definitions");
    for (const collision of collisions) {
      console.error(`- ${collision.key}: ${collision.file}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`${options.apply ? "apply" : "dry-run"}: ${migrations.length} files, ${migrations.reduce((sum, m) => sum + m.count, 0)} response types`);
  for (const migration of migrations) {
    console.log(`- ${migration.file}: ${migration.count}`);
  }
  console.log(`response-types: ${path.relative(process.cwd(), responseTypesFile)}`);

  if (!options.apply) return;

  await fs.mkdir(path.dirname(responseTypesFile), { recursive: true });
  await fs.writeFile(responseTypesFile, `${JSON.stringify(responseTypesDoc, null, 2)}\n`, "utf8");

  for (const migration of migrations) {
    await fs.writeFile(path.join(targetDir, migration.file), removeTopLevelTypeCatalog(migration.raw), "utf8");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
