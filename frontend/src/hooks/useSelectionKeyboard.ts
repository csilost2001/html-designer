import { useEffect } from "react";

interface SelectionKeyboardOpts {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEscape: () => void;
  enabled?: boolean;
}

/**
 * Ctrl+X / Ctrl+C / Ctrl+V / Delete / Alt+Arrow / Esc キーバインドフック
 */
export function useSelectionKeyboard({
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onMoveUp,
  onMoveDown,
  onEscape,
  enabled = true,
}: SelectionKeyboardOpts): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
        e.preventDefault();
        onDelete();
        return;
      }

      if (e.altKey && e.key === "ArrowUp" && onMoveUp) {
        e.preventDefault();
        onMoveUp();
        return;
      }

      if (e.altKey && e.key === "ArrowDown" && onMoveDown) {
        e.preventDefault();
        onMoveDown();
        return;
      }

      if (!ctrl) return;

      if (e.key === "x") {
        e.preventDefault();
        onCut();
      } else if (e.key === "c") {
        e.preventDefault();
        onCopy();
      } else if (e.key === "v") {
        e.preventDefault();
        onPaste();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCut, onCopy, onPaste, onDelete, onMoveUp, onMoveDown, onEscape, enabled]);
}
