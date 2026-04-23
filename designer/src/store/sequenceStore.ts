import type { SequenceDefinition, SequenceMeta } from "../types/sequence";
import { loadProject, saveProject } from "./flowStore";
import { renumber, nextNo } from "../utils/listOrder";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface SequenceStorageBackend {
  loadSequence(sequenceId: string): Promise<unknown>;
  saveSequence(sequenceId: string, data: unknown): Promise<void>;
  deleteSequence(sequenceId: string): Promise<void>;
}

let _backend: SequenceStorageBackend | null = null;

export function setSequenceStorageBackend(b: SequenceStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const SEQUENCE_PREFIX = "sequence-";

function now(): string {
  return new Date().toISOString();
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** シーケンス一覧を取得（project.json のメタ情報） */
export async function listSequences(): Promise<SequenceMeta[]> {
  const project = await loadProject();
  return project.sequences ?? [];
}

/** シーケンス定義を読み込み */
export async function loadSequence(sequenceId: string): Promise<SequenceDefinition | null> {
  const raw = await (async () => {
    if (_backend) return (await _backend.loadSequence(sequenceId)) as SequenceDefinition | null;
    const s = localStorage.getItem(`${SEQUENCE_PREFIX}${sequenceId}`);
    if (!s) return null;
    try { return JSON.parse(s) as SequenceDefinition; } catch { return null; }
  })();
  return raw;
}

/** シーケンス定義を保存（project.json のメタも同期） */
export async function saveSequence(sequence: SequenceDefinition): Promise<void> {
  sequence.updatedAt = now();

  if (_backend) {
    await _backend.saveSequence(sequence.id, sequence);
  } else {
    localStorage.setItem(`${SEQUENCE_PREFIX}${sequence.id}`, JSON.stringify(sequence));
  }

  await syncSequenceMeta(sequence);
}

/** シーケンスを新規作成 */
export async function createSequence(id: string, description?: string): Promise<SequenceDefinition> {
  const ts = now();
  const sequence: SequenceDefinition = {
    id,
    startValue: 1,
    increment: 1,
    cache: 1,
    cycle: false,
    usedBy: [],
    description: description ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  await saveSequence(sequence);
  return sequence;
}

/** シーケンスを削除 */
export async function deleteSequence(sequenceId: string): Promise<void> {
  if (_backend) {
    await _backend.deleteSequence(sequenceId);
  } else {
    localStorage.removeItem(`${SEQUENCE_PREFIX}${sequenceId}`);
  }

  const project = await loadProject();
  if (project.sequences) {
    project.sequences = renumber(project.sequences.filter((s) => s.id !== sequenceId));
    await saveProject(project);
  }
}

// ─── 内部 ────────────────────────────────────────────────────────────────

async function syncSequenceMeta(sequence: SequenceDefinition): Promise<void> {
  const project = await loadProject();
  if (!project.sequences) project.sequences = [];

  const idx = project.sequences.findIndex((s) => s.id === sequence.id);
  const meta: SequenceMeta = {
    id: sequence.id,
    no: idx >= 0 ? project.sequences[idx].no : nextNo(project.sequences),
    conventionRef: sequence.conventionRef,
    description: sequence.description,
    updatedAt: sequence.updatedAt,
  };

  if (idx >= 0) {
    project.sequences[idx] = meta;
  } else {
    project.sequences.push(meta);
  }
  project.sequences = renumber(project.sequences);
  await saveProject(project);
}
