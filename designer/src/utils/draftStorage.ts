export function saveDraft<T>(kind: string, id: string, data: T): void {
  try {
    localStorage.setItem(`draft-${kind}-${id}`, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function loadDraft<T>(kind: string, id: string): T | null {
  try {
    const raw = localStorage.getItem(`draft-${kind}-${id}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function clearDraft(kind: string, id: string): void {
  try {
    localStorage.removeItem(`draft-${kind}-${id}`);
  } catch { /* ignore */ }
}
