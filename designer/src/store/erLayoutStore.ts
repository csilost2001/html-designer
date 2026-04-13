/**
 * erLayoutStore.ts
 * ER図レイアウトの永続化ストア
 */
import type { ErLayout } from "../types/table";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface ErLayoutStorageBackend {
  loadErLayout(): Promise<unknown>;
  saveErLayout(data: unknown): Promise<void>;
}

let _backend: ErLayoutStorageBackend | null = null;

export function setErLayoutStorageBackend(b: ErLayoutStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const ER_LAYOUT_KEY = "er-layout";

function now(): string {
  return new Date().toISOString();
}

function createEmptyLayout(): ErLayout {
  return { positions: {}, logicalRelations: [], updatedAt: now() };
}

// ─── 公開 API ────────────────────────────────────────────────────────────

export async function loadErLayout(): Promise<ErLayout> {
  if (_backend) {
    const data = await _backend.loadErLayout();
    if (data) return data as ErLayout;
    return createEmptyLayout();
  }
  const raw = localStorage.getItem(ER_LAYOUT_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as ErLayout;
    } catch { /* ignore */ }
  }
  return createEmptyLayout();
}

export async function saveErLayout(layout: ErLayout): Promise<void> {
  layout.updatedAt = now();
  if (_backend) {
    await _backend.saveErLayout(layout);
    return;
  }
  localStorage.setItem(ER_LAYOUT_KEY, JSON.stringify(layout));
}
