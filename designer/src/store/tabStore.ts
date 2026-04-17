const TABS_KEY = "designer-open-tabs";
const ACTIVE_KEY = "designer-active-tab";

export type TabType = "design" | "table" | "er" | "actions";

export interface TabItem {
  id: string;
  type: TabType;
  resourceId: string;
  label: string;
  isDirty: boolean;
  isPinned: boolean;
}

type Listener = () => void;

let _tabs: TabItem[] = _loadTabs();
let _activeTabId: string = _loadActiveId();
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

function _loadTabs(): TabItem[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TabItem[];
      return parsed.map((t) => ({ ...t, isDirty: false }));
    }
  } catch { /* ignore */ }
  return [];
}

function _loadActiveId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}

function _persist() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(_tabs.map((t) => ({ ...t, isDirty: false }))));
    localStorage.setItem(ACTIVE_KEY, _activeTabId);
  } catch { /* ignore */ }
}

export function makeTabId(type: TabType, resourceId: string): string {
  return `${type}:${resourceId}`;
}

/** テスト専用: モジュール状態を初期化する */
export function _resetForTests(): void {
  _tabs = [];
  _activeTabId = "";
  _listeners.clear();
}

export function getTabs(): readonly TabItem[] {
  return _tabs;
}

export function getActiveTabId(): string {
  return _activeTabId;
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function openTab(item: Omit<TabItem, "isDirty" | "isPinned">): void {
  const existing = _tabs.find((t) => t.id === item.id);
  if (existing) {
    _tabs = _tabs.map((t) => (t.id === item.id ? { ...t, label: item.label } : t));
    _activeTabId = item.id;
  } else {
    _tabs = [..._tabs, { ...item, isDirty: false, isPinned: false }];
    _activeTabId = item.id;
  }
  _persist();
  _notify();
}

/** returns false if tab is dirty and force=false (caller should confirm) */
export function closeTab(id: string, force = false): boolean {
  const tab = _tabs.find((t) => t.id === id);
  if (!tab) return true;
  if (tab.isDirty && !force) return false;

  const idx = _tabs.findIndex((t) => t.id === id);
  const newTabs = _tabs.filter((t) => t.id !== id);
  _tabs = newTabs;

  if (_activeTabId === id) {
    _activeTabId = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? "";
  }
  _persist();
  _notify();
  return true;
}

export function setActiveTab(id: string): void {
  if (_activeTabId === id) return;
  _activeTabId = id;
  _persist();
  _notify();
}

export function reorderTabs(fromIndex: number, toIndex: number): void {
  const arr = [..._tabs];
  const [removed] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, removed);
  _tabs = arr;
  _persist();
  _notify();
}

export function setDirty(id: string, dirty: boolean): void {
  const tab = _tabs.find((t) => t.id === id);
  if (!tab || tab.isDirty === dirty) return;
  _tabs = _tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t));
  _notify();
}

export function setPinned(id: string, pinned: boolean): void {
  _tabs = _tabs.map((t) => (t.id === id ? { ...t, isPinned: pinned } : t));
  _persist();
  _notify();
}

export function updateTabLabel(id: string, label: string): void {
  _tabs = _tabs.map((t) => (t.id === id ? { ...t, label } : t));
  _persist();
  _notify();
}

export function closeOtherTabs(id: string): void {
  const keep = _tabs.find((t) => t.id === id);
  const pinned = _tabs.filter((t) => t.isPinned && t.id !== id);
  _tabs = keep ? [...pinned, keep] : pinned;
  if (!_tabs.find((t) => t.id === _activeTabId)) {
    _activeTabId = keep?.id ?? _tabs[_tabs.length - 1]?.id ?? "";
  }
  _persist();
  _notify();
}

export function closeTabsToRight(id: string): void {
  const idx = _tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  _tabs = _tabs.filter((_, i) => i <= idx || _tabs[i].isPinned);
  if (!_tabs.find((t) => t.id === _activeTabId)) {
    _activeTabId = id;
  }
  _persist();
  _notify();
}
