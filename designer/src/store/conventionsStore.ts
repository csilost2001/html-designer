/**
 * conventionsStore.ts
 * 横断規約カタログ (validation-rules / product-scope) の永続化ストア (#317)。
 *
 * 正本は `data/conventions/catalog.json`。wsBridge 経由で読み書きし、
 * ws 未接続時は localStorage にフォールバック。形状は
 * `schemas/conventions.schema.json` 準拠。
 */
import type { ConventionsCatalog } from "../schemas/conventionsValidator";

export interface ConventionsStorageBackend {
  loadConventions(): Promise<unknown>;
  saveConventions(catalog: unknown): Promise<void>;
}

let _backend: ConventionsStorageBackend | null = null;

export function setConventionsStorageBackend(b: ConventionsStorageBackend | null): void {
  _backend = b;
}

const LS_KEY = "conventions-catalog";

function now(): string {
  return new Date().toISOString();
}

/** 初期カタログ (空) */
export function createEmptyCatalog(): ConventionsCatalog {
  return {
    version: "1.0.0",
    description: "",
    updatedAt: now(),
    msg: {},
    regex: {},
    limit: {},
  } as ConventionsCatalog;
}

export async function loadConventions(): Promise<ConventionsCatalog | null> {
  // 1. wsBridge backend (data/conventions/catalog.json) が優先
  if (_backend) {
    const data = await _backend.loadConventions();
    if (data) return data as ConventionsCatalog;
  } else {
    // 2. ws 未接続なら localStorage フォールバック (テスト時の seed にも使う)
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as ConventionsCatalog;
      } catch { /* ignore */ }
    }
  }
  // 3. 最終フォールバック: public/ 配下の静的ファイル (#317 以前の経路、互換用)
  //    初回起動で data/conventions/catalog.json 未生成の場合にもデフォルト規約を返す
  try {
    const r = await fetch("/conventions-catalog.json");
    if (r.ok) return await r.json() as ConventionsCatalog;
  } catch { /* ignore */ }
  return null;
}

export async function saveConventions(catalog: ConventionsCatalog): Promise<void> {
  catalog.updatedAt = now();
  if (_backend) {
    await _backend.saveConventions(catalog);
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(catalog));
}
