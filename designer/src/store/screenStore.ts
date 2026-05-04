import type {
  Screen,
  ScreenId,
  ScreenKind,
  Timestamp,
} from "../types/v3";
import { loadProject } from "./flowStore";
import { validatePuckScreen } from "../utils/puckScreenValidation";
import type { PuckScreenValidationError } from "../utils/puckScreenValidation";

export interface ScreenStorageBackend {
  loadScreenEntity(screenId: string): Promise<unknown>;
  saveScreenEntity(screenId: string, data: unknown): Promise<void>;
}

let _backend: ScreenStorageBackend | null = null;

export function setScreenStorageBackend(b: ScreenStorageBackend | null): void {
  _backend = b;
}

const SCREEN_PREFIX = "v3-screen-";
const SCREEN_SCHEMA_REF = "../schemas/v3/screen.v3.schema.json";

function nowTs(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function buildDefaultScreen(screenId: string): Promise<Screen> {
  const ts = nowTs();
  const project = await loadProject();
  const meta = project.screens.find((s) => s.id === screenId);
  return {
    $schema: SCREEN_SCHEMA_REF,
    id: screenId as ScreenId,
    name: meta?.name ?? screenId,
    createdAt: (meta?.createdAt ?? meta?.updatedAt ?? ts) as Timestamp,
    updatedAt: (meta?.updatedAt ?? ts) as Timestamp,
    kind: (meta?.kind ?? "other") as ScreenKind,
    path: meta?.path ?? "",
    groupId: meta?.groupId,
    items: [],
    design: { designFileRef: `${screenId}.design.json` },
  };
}

export async function loadScreenEntity(screenId: string): Promise<Screen> {
  const raw = await (async () => {
    if (_backend) return _backend.loadScreenEntity(screenId);
    const s = localStorage.getItem(`${SCREEN_PREFIX}${screenId}`);
    if (!s) return null;
    try { return JSON.parse(s) as unknown; } catch { return null; }
  })();
  if (isRecord(raw)) {
    return {
      ...(await buildDefaultScreen(screenId)),
      ...(raw as Partial<Screen>),
      $schema: SCREEN_SCHEMA_REF,
      id: (typeof raw.id === "string" ? raw.id : screenId) as ScreenId,
      kind: (typeof raw.kind === "string" ? raw.kind : "other") as ScreenKind,
      path: typeof raw.path === "string" ? raw.path : "",
      items: Array.isArray(raw.items) ? raw.items as Screen["items"] : [],
      design: {
        ...(isRecord(raw.design) ? raw.design : {}),
        designFileRef: `${screenId}.design.json`,
      },
    };
  }
  return buildDefaultScreen(screenId);
}

/**
 * 全 Puck 画面の validation エラーマップを返す。
 * loadTableValidationMap / loadViewValidationMap と同パターン (#806 S-1 / 仕様 §8)。
 * editorKind=puck の画面のみを対象とし、puckDataPayload は省略 (ファイル load 省略)。
 */
export async function loadPuckScreenValidationMap(): Promise<Map<ScreenId, PuckScreenValidationError[]>> {
  const project = await loadProject();
  const validationMap = new Map<ScreenId, PuckScreenValidationError[]>();

  // 全画面エンティティを bulk fetch してから editorKind=puck を filter
  const allEntities = await Promise.all(
    project.screens.map((entry) => loadScreenEntity(entry.id)),
  );
  const puckEntities = allEntities.filter(
    (entity) => entity.design?.editorKind === "puck",
  );

  for (const entity of puckEntities) {
    validationMap.set(
      entity.id as ScreenId,
      validatePuckScreen(entity, puckEntities, /* customComponents */ []),
    );
  }

  return validationMap;
}

export async function saveScreenEntity(screen: Screen): Promise<void> {
  const toSave: Screen = {
    ...screen,
    $schema: SCREEN_SCHEMA_REF,
    updatedAt: nowTs(),
    design: {
      ...(screen.design ?? {}),
      designFileRef: `${screen.id}.design.json`,
    },
  };
  if (_backend) {
    await _backend.saveScreenEntity(toSave.id, toSave);
  } else {
    localStorage.setItem(`${SCREEN_PREFIX}${toSave.id}`, JSON.stringify(toSave));
  }
}
