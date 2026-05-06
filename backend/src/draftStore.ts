/**
 * draftStore.ts (#685)
 *
 * data/.drafts/<resourceType>/<id>.json を edit-session の working copy として管理する。
 * atomic write: tmp ファイルへ書き込み → fs.rename でアトミックに置換。
 * commitDraft: draft を本体ファイルへ atomic に昇格し draft を削除する。
 *
 * #880 Phase 3: in-memory shadow store + opaque broadcast
 * - updateDraft は shadow に書く + draft-update broadcast、FS write は 30s throttle
 * - flushDraft / flushAllDirty / readDraftLatest を新規追加
 * - commitDraft は flush 後に既存 commit 処理を実行
 * - discardDraft は shadow を消す + flushTimer cancel
 */
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "node:crypto";
import { resolveRoot, resolveDataRoot } from "./projectStorage.js";
import {
  writeScreen,
  writePuckData,
  writeTable,
  writeProcessFlow,
  writeView,
  writeViewDefinition,
  writeScreenItems,
  writeSequence,
  writeProject,
} from "./projectStorage.js";

export type DraftResourceType =
  | "screen"
  | "puck-data"  // #806: Puck 画面データ (screens/<id>/puck-data.json)
  | "table"
  | "process-flow"
  | "view"
  | "view-definition"
  | "screen-item"
  | "sequence"
  | "extension"
  | "convention"
  | "flow";  // #690 PR-7: 画面遷移図用

const DRAFTS_SUBDIR = ".drafts";

// ── #880 Phase 3: in-memory shadow store ──────────────────────────────────

/** draft-update broadcast の payload 型 (opaque envelope) */
export interface DraftUpdateBroadcastData {
  resourceType: DraftResourceType;
  resourceId: string;
  sequence: number;        // monotonic per (clientId, resourceType, resourceId)
  payload: unknown;        // opaque (server は中身を解釈しない)
  senderSessionId: string; // editor の clientId
}

/** broadcast 注入関数型 (circular dep 回避) */
type BroadcastFn = (opts: {
  wsId: string | null;
  event: string;
  data: unknown;
  excludeClientId?: string;
}) => void;

/** wsBridge から注入される broadcast 関数 (null = テスト環境 / 初期化前) */
let _broadcast: BroadcastFn | null = null;

/**
 * broadcast 関数を注入する。wsBridge 初期化後に呼ぶ (#880 Phase 3)。
 * circular import 回避のための dependency injection。
 */
export function initDraftStoreBroadcast(fn: BroadcastFn): void {
  _broadcast = fn;
}

/** flush 間隔 (ms): 30 秒 */
const FLUSH_INTERVAL_MS = 30_000;

interface ShadowEntry {
  payload: unknown;
  sequence: number;
  dirty: boolean;
  lastFlushAt: number;       // Date.now()
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** shadow を FS に書くのに必要な clientId / type / id */
  clientId: string;
  type: DraftResourceType;
  id: string;
  /** wsId (broadcast 用) */
  wsId: string | null;
}

/** key = `${clientId}:${type}:${id}` */
const shadow = new Map<string, ShadowEntry>();

function shadowKey(clientId: string, type: DraftResourceType, id: string): string {
  return `${clientId}:${type}:${id}`;
}

/** shadow → FS atomic write。dirty=false に、draft.changed op:"updated" を broadcast */
export async function flushDraft(clientId: string, type: DraftResourceType, id: string): Promise<void> {
  const key = shadowKey(clientId, type, id);
  const entry = shadow.get(key);
  if (!entry || !entry.dirty) return;

  // flush timer をキャンセル (flush 中に二重起動しない)
  if (entry.flushTimer !== null) {
    clearTimeout(entry.flushTimer);
    entry.flushTimer = null;
  }

  const root = resolveRoot(clientId);
  await ensureDraftDir(root, type);
  await atomicWrite(draftPath(root, type, id), entry.payload);

  entry.dirty = false;
  entry.lastFlushAt = Date.now();

  // flush 完了時にのみ draft.changed op:"updated" を broadcast (中間状態とは分離)
  if (_broadcast) {
    _broadcast({
      wsId: entry.wsId,
      event: "draft.changed",
      data: { type, id, op: "updated" },
      excludeClientId: clientId,
    });
  }
}

/** shutdown 時に全 dirty を flush する */
export async function flushAllDirty(): Promise<void> {
  const entries = Array.from(shadow.values()).filter((e) => e.dirty);
  await Promise.allSettled(entries.map((e) => flushDraft(e.clientId, e.type, e.id)));
}

/**
 * shadow にあればそれを返す、無ければ FS から読む (#880 Phase 3)。
 * viewer が最新状態を取得するために使う。
 */
export async function readDraftLatest(
  clientId: string,
  type: DraftResourceType,
  id: string,
): Promise<unknown | null> {
  const key = shadowKey(clientId, type, id);
  const entry = shadow.get(key);
  if (entry) return entry.payload;
  return readDraft(clientId, type, id);
}

function draftsRoot(activeRoot: string): string {
  return path.join(activeRoot, DRAFTS_SUBDIR);
}

function draftDir(activeRoot: string, type: DraftResourceType): string {
  return path.join(draftsRoot(activeRoot), type);
}

function draftPath(activeRoot: string, type: DraftResourceType, id: string): string {
  return path.join(draftDir(activeRoot, type), `${id}.json`);
}

async function ensureDraftDir(activeRoot: string, type: DraftResourceType): Promise<void> {
  await fs.mkdir(draftDir(activeRoot, type), { recursive: true });
}

async function atomicWrite(targetPath: string, data: unknown): Promise<void> {
  const rand = randomBytes(4).toString("hex");
  const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}-${rand}`;
  const json = JSON.stringify(data, null, 2);
  try {
    await fs.writeFile(tmp, json, "utf-8");
    await fs.rename(tmp, targetPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * draft の本体ファイルパスを解決する (#851 R-2)。
 * リソースデータは <root>/<dataDir>/ 配下に格納されるため、
 * harmony.json から dataDir を on-demand 解決して dataRoot を計算する。
 *
 * harmony.json が存在しない場合 (workspace 未初期化) は null を返す。
 */
async function canonicalBodyPath(activeRoot: string, type: DraftResourceType, id: string): Promise<string | null> {
  let dataRoot: string;
  try {
    dataRoot = await resolveDataRoot(activeRoot);
  } catch {
    // harmony.json 未存在 (workspace 未初期化) の場合は null を返す
    return null;
  }

  switch (type) {
    case "screen":
      return path.join(dataRoot, "screens", `${id}.design.json`);
    case "puck-data":
      // #806: Puck Data は screens/<id>/puck-data.json に専用パスで保存
      return path.join(dataRoot, "screens", id, "puck-data.json");
    case "table":
      return path.join(dataRoot, "tables", `${id}.json`);
    case "process-flow":
      return path.join(dataRoot, "actions", `${id}.json`);
    case "view":
      return path.join(dataRoot, "views", `${id}.json`);
    case "view-definition":
      return path.join(dataRoot, "view-definitions", `${id}.json`);
    case "screen-item":
      // screen-item は singleton draft で body path が payload.screenId に依存するため null を返す
      return null;
    case "sequence":
      return path.join(dataRoot, "sequences", `${id}.json`);
    case "extension":
      return path.join(dataRoot, "extensions", `${id}.json`);
    case "convention":
      return path.join(dataRoot, "conventions", "catalog.json");
    case "flow":
      // harmony.json は workspace root 直下 (dataDir 外) — D-7
      return path.join(activeRoot, "harmony.json");
    default:
      return null;
  }
}

/**
 * 編集開始: 本体ファイルが存在すればコピー、存在しなければ空 draft を作成する。
 * 既に draft が存在する場合は作成せず created: false を返す。
 */
export async function createDraft(
  clientId: string,
  type: DraftResourceType,
  id: string,
): Promise<{ created: boolean }> {
  const root = resolveRoot(clientId);
  const dp = draftPath(root, type, id);

  try {
    await fs.access(dp);
    return { created: false };
  } catch {
    // draft 未存在 → 作成する
  }

  await ensureDraftDir(root, type);

  const bodyPath = await canonicalBodyPath(root, type, id);
  let initialContent: unknown = {};
  if (bodyPath) {
    const existing = await readJSON<unknown>(bodyPath);
    if (existing !== null) {
      initialContent = existing;
    }
  }

  await atomicWrite(dp, initialContent);
  return { created: true };
}

/**
 * draft を読み込む。
 * #880 Phase 3: shadow に最新状態があればそれを返す、無ければ FS から読む。
 * これにより既存コード (readDraft 後に最新値を期待) が shadow store 導入後も動作する。
 */
export async function readDraft(
  clientId: string,
  type: DraftResourceType,
  id: string,
): Promise<unknown | null> {
  const key = shadowKey(clientId, type, id);
  const entry = shadow.get(key);
  if (entry) return entry.payload;
  const root = resolveRoot(clientId);
  return readJSON<unknown>(draftPath(root, type, id));
}

/**
 * draft を更新する (#880 Phase 3 変更):
 * - shadow に書く + draft-update broadcast (opaque envelope)
 * - FS write: 初回は即時書き込み (hasDraft / cross-session 互換)、以降は 30s throttle
 * - draft.changed op:"updated" は flush 完了時にのみ発火 (中間状態とは分離)
 *
 * @param wsId  broadcast 対象ワークスペース ID (broadcast 先を絞り込む)
 */
export async function updateDraft(
  clientId: string,
  type: DraftResourceType,
  id: string,
  payload: unknown,
  wsId: string | null = null,
): Promise<void> {
  const key = shadowKey(clientId, type, id);

  // shadow を update (sequence increment, dirty=true)
  const existing = shadow.get(key);
  const sequence = (existing?.sequence ?? 0) + 1;
  const isFirstUpdate = existing === undefined;

  // flush timer の管理: 既存あればスキップ、無ければ 30s 後 flush
  let flushTimer: ReturnType<typeof setTimeout> | null = existing?.flushTimer ?? null;
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushDraft(clientId, type, id).catch((e) => {
        console.error(`[draftStore] flushDraft error (${type}/${id}):`, e);
      });
    }, FLUSH_INTERVAL_MS);
  }

  shadow.set(key, {
    payload,
    sequence,
    dirty: true,
    lastFlushAt: existing?.lastFlushAt ?? 0,
    flushTimer,
    clientId,
    type,
    id,
    wsId,
  });

  // 初回 update は FS にも即時書き込み (hasDraft / cross-session 互換性を維持)
  // 2 回目以降は shadow のみで throttle flush を待つ
  if (isFirstUpdate) {
    const root = resolveRoot(clientId);
    await ensureDraftDir(root, type);
    await atomicWrite(draftPath(root, type, id), payload);
    // 初回は FS 書き込み済みなので dirty=false に
    const entry = shadow.get(key);
    if (entry) {
      entry.dirty = false;
      entry.lastFlushAt = Date.now();
    }
  }

  // draft-update broadcast (editor 自身は受信しない、opaque envelope)
  if (_broadcast) {
    const broadcastData: DraftUpdateBroadcastData = {
      resourceType: type,
      resourceId: id,
      sequence,
      payload,
      senderSessionId: clientId,
    };
    _broadcast({
      wsId,
      event: "draft-update",
      data: broadcastData,
      excludeClientId: clientId,
    });
  }
}

/**
 * draft を本体ファイルへ atomic に昇格し、draft を削除する。
 * draft が存在しない場合は committed: false を返す。
 *
 * #880 Phase 3: commit 前に shadow を flush して shadow の内容を確実に FS に書いてから
 * 既存 commit 処理 (本体ファイルへの atomic move) を実行する。
 */
export async function commitDraft(
  clientId: string,
  type: DraftResourceType,
  id: string,
): Promise<{ committed: boolean }> {
  // shadow がある場合は先に FS に書いておく
  const key = shadowKey(clientId, type, id);
  if (shadow.get(key)?.dirty) {
    await flushDraft(clientId, type, id);
  }

  const root = resolveRoot(clientId);
  const dp = draftPath(root, type, id);
  const payload = await readJSON<unknown>(dp);
  if (payload === null) {
    return { committed: false };
  }

  switch (type) {
    case "screen":
      await writeScreen(id, payload, root);
      break;
    case "puck-data":
      // #806: Puck Data を screens/<id>/puck-data.json に atomic write で昇格
      await writePuckData(id, payload, root);
      break;
    case "table":
      await writeTable(id, payload, root);
      break;
    case "process-flow":
      await writeProcessFlow(id, payload, root);
      break;
    case "view":
      await writeView(id, payload, root);
      break;
    case "view-definition":
      await writeViewDefinition(id, payload, root);
      break;
    case "screen-item": {
      const siPayload = payload as { screenId?: string } | null;
      if (!siPayload || typeof siPayload.screenId !== "string" || !siPayload.screenId) {
        throw new Error("screen-item draft payload に screenId がありません");
      }
      await writeScreenItems(siPayload.screenId, siPayload, root);
      break;
    }
    case "sequence":
      await writeSequence(id, payload, root);
      break;
    case "extension":
    case "convention": {
      const bodyPath = await canonicalBodyPath(root, type, id);
      if (!bodyPath) {
        throw new Error(`${type} の本体パス解決に失敗しました`);
      }
      await fs.mkdir(path.dirname(bodyPath), { recursive: true });
      await atomicWrite(bodyPath, payload);
      break;
    }
    case "flow":
      await writeProject(payload, root);
      break;
    default: {
      const _exhaustive: never = type;
      throw new Error(`未対応の resourceType: ${_exhaustive}`);
    }
  }

  try {
    await fs.unlink(dp);
  } catch {
    // draft 削除失敗は無視 (commit 自体は成功)
  }

  // commit 完了 → shadow を削除 (#880 Phase 3)
  {
    const commitKey = shadowKey(clientId, type, id);
    const commitEntry = shadow.get(commitKey);
    if (commitEntry?.flushTimer) clearTimeout(commitEntry.flushTimer);
    shadow.delete(commitKey);
  }

  return { committed: true };
}

/**
 * draft ファイルを削除する (本体には変更しない)。
 * #880 Phase 3: shadow を消す + flushTimer cancel。
 */
export async function discardDraft(
  clientId: string,
  type: DraftResourceType,
  id: string,
): Promise<{ discarded: boolean }> {
  // shadow を消す + flushTimer cancel (#880 Phase 3)
  const discardKey = shadowKey(clientId, type, id);
  const discardEntry = shadow.get(discardKey);
  if (discardEntry?.flushTimer) clearTimeout(discardEntry.flushTimer);
  shadow.delete(discardKey);

  const root = resolveRoot(clientId);
  const dp = draftPath(root, type, id);
  try {
    await fs.unlink(dp);
    return { discarded: true };
  } catch {
    return { discarded: false };
  }
}

/**
 * draft が存在するかを返す。
 * #880 Phase 3: shadow にあれば true、無ければ FS を確認する。
 */
export async function hasDraft(clientId: string, type: DraftResourceType, id: string): Promise<boolean> {
  // shadow にあれば即 true (FS 書き込み前でも存在として扱う)
  if (shadow.has(shadowKey(clientId, type, id))) return true;
  const root = resolveRoot(clientId);
  try {
    await fs.access(draftPath(root, type, id));
    return true;
  } catch {
    return false;
  }
}

/** 全 draft を列挙する。 */
export async function listDrafts(clientId: string): Promise<Array<{ type: DraftResourceType; id: string; mtimeMs: number }>> {
  const root = resolveRoot(clientId);
  const dr = draftsRoot(root);
  const result: Array<{ type: DraftResourceType; id: string; mtimeMs: number }> = [];

  let typeDirs: string[];
  try {
    typeDirs = await fs.readdir(dr);
  } catch {
    return result;
  }

  for (const typeDir of typeDirs) {
    const type = typeDir as DraftResourceType;
    const fullTypeDir = path.join(dr, typeDir);
    let files: string[];
    try {
      files = await fs.readdir(fullTypeDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -5);
      try {
        const stat = await fs.stat(path.join(fullTypeDir, file));
        result.push({ type, id, mtimeMs: stat.mtimeMs });
      } catch {
        // ファイルが消えた場合はスキップ
      }
    }
  }

  return result;
}
