import { useEffect } from "react";
import type { ListSelection } from "./useListSelection";

interface ListKeyboardOpts<T> {
  items: T[];
  getId: (item: T) => string;
  selection: ListSelection<T>;
  onActivate?: (item: T) => void;
  onDelete?: (items: T[]) => void;
  onCopy?: (items: T[]) => void;
  onCut?: (items: T[]) => void;
  onPaste?: (insertIndex: number | null) => void;
  onDuplicate?: (items: T[]) => void;
  onMoveUp?: (items: T[]) => void;
  onMoveDown?: (items: T[]) => void;
  enabled?: boolean;
}

/**
 * リスト向けキーボードショートカット。window keydown に登録。
 * - ↑/↓: 選択移動, Shift+↑/↓: 選択範囲拡張
 * - Enter / F2: onActivate
 * - Ctrl+A: 全選択, Delete: onDelete
 * - Ctrl+C / X / V: onCopy / onCut / onPaste
 * - Ctrl+D: onDuplicate
 * - Alt+↑/↓: onMoveUp / onMoveDown
 * - Escape: 選択解除
 *
 * input/textarea/select/contenteditable がフォーカス中は無効。
 */
export function useListKeyboard<T>(opts: ListKeyboardOpts<T>): void {
  const {
    items, getId, selection,
    onActivate, onDelete, onCopy, onCut, onPaste, onDuplicate,
    onMoveUp, onMoveDown,
    enabled = true,
  } = opts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const itemIds = items.map(getId);

      if (e.key === "Escape") {
        if (selection.selectedIds.size > 0) {
          e.preventDefault();
          selection.clearSelection();
        }
        return;
      }

      if (ctrl && e.key === "a") {
        e.preventDefault();
        selection.selectAll();
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.key === "c") {
        if (onCopy && selection.selectedItems.length > 0) {
          e.preventDefault();
          onCopy(selection.selectedItems);
        }
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.key === "x") {
        if (onCut && selection.selectedItems.length > 0) {
          e.preventDefault();
          onCut(selection.selectedItems);
        }
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.key === "v") {
        if (onPaste) {
          e.preventDefault();
          const ids = itemIds;
          const selected = Array.from(selection.selectedIds);
          const insertIndex = selected.length > 0
            ? Math.max(...selected.map((id) => ids.indexOf(id))) + 1
            : null;
          onPaste(insertIndex);
        }
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.key === "d") {
        if (onDuplicate && selection.selectedItems.length > 0) {
          e.preventDefault();
          onDuplicate(selection.selectedItems);
        }
        return;
      }

      if (e.key === "Delete" && !ctrl && !e.altKey && !e.shiftKey) {
        if (onDelete && selection.selectedItems.length > 0) {
          e.preventDefault();
          onDelete(selection.selectedItems);
        }
        return;
      }

      if ((e.key === "Enter" || e.key === "F2") && !ctrl && !e.altKey) {
        if (onActivate && selection.selectedItems.length === 1) {
          e.preventDefault();
          onActivate(selection.selectedItems[0]);
        }
        return;
      }

      if (e.altKey && !ctrl && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const handler = e.key === "ArrowUp" ? onMoveUp : onMoveDown;
        if (handler && selection.selectedItems.length > 0) {
          e.preventDefault();
          handler(selection.selectedItems);
        }
        return;
      }

      if (!ctrl && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const ids = itemIds;
        if (ids.length === 0) return;
        const anchor = selection.getAnchorId();
        const anchorIdx = anchor ? ids.indexOf(anchor) : -1;
        const delta = e.key === "ArrowUp" ? -1 : 1;
        const nextIdx = anchorIdx < 0
          ? (delta > 0 ? 0 : ids.length - 1)
          : Math.max(0, Math.min(ids.length - 1, anchorIdx + delta));
        const nextId = ids[nextIdx];
        if (e.shiftKey && anchor) {
          const [lo, hi] = anchorIdx < nextIdx ? [anchorIdx, nextIdx] : [nextIdx, anchorIdx];
          const range = new Set(ids.slice(lo, hi + 1));
          selection.setSelectedIds(range);
        } else {
          selection.setSelectedIds(new Set([nextId]));
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled, items, getId, selection,
    onActivate, onDelete, onCopy, onCut, onPaste, onDuplicate, onMoveUp, onMoveDown,
  ]);
}
