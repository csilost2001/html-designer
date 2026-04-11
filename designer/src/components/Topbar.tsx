import { useEffect, useState } from "react";
import { useEditor } from "@grapesjs/react";
import type { PanelMode } from "./Designer";

interface Props {
  ready: boolean;
  panelMode: PanelMode;
  onOpenPanel: () => void;
}

export function Topbar({ ready, panelMode, onOpenPanel }: Props) {
  const editor = useEditor();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const um = editor.UndoManager;
    const update = () => {
      setCanUndo(um.hasUndo());
      setCanRedo(um.hasRedo());
    };
    const onStorageStart = () => setSaveState("saving");
    const onStorageEnd = () => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    };

    editor.on("component:add component:remove component:update", update);
    editor.on("undo redo", update);
    editor.on("storage:start:store", onStorageStart);
    editor.on("storage:end:store", onStorageEnd);
    update();

    return () => {
      editor.off("component:add component:remove component:update", update);
      editor.off("undo redo", update);
      editor.off("storage:start:store", onStorageStart);
      editor.off("storage:end:store", onStorageEnd);
    };
  }, [editor]);

  const handleUndo = () => editor?.UndoManager.undo();
  const handleRedo = () => editor?.UndoManager.redo();
  const handlePreview = () => editor?.runCommand("preview");
  const handleClear = () => {
    if (confirm("キャンバスをクリアします。よろしいですか？")) {
      editor?.DomComponents.clear();
    }
  };
  const handleSaveNow = () => editor?.store();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <i className="bi bi-palette2 topbar-logo" />
        <span className="topbar-title">業務システム デザイナー</span>
        {panelMode === "hidden" && (
          <button
            className="icon-btn"
            onClick={onOpenPanel}
            title="ブロックパネルを開く"
            style={{ marginLeft: 4 }}
          >
            <i className="bi bi-layout-sidebar" />
          </button>
        )}
      </div>

      <div className="topbar-center">
        <button
          className="icon-btn"
          onClick={handleUndo}
          disabled={!canUndo}
          title="元に戻す (Ctrl+Z)"
        >
          <i className="bi bi-arrow-counterclockwise" />
        </button>
        <button
          className="icon-btn"
          onClick={handleRedo}
          disabled={!canRedo}
          title="やり直し (Ctrl+Shift+Z)"
        >
          <i className="bi bi-arrow-clockwise" />
        </button>
        <div className="divider" />
        <button className="icon-btn" onClick={handlePreview} title="プレビュー">
          <i className="bi bi-eye" />
        </button>
        <button
          className="icon-btn danger"
          onClick={handleClear}
          title="キャンバスをクリア"
        >
          <i className="bi bi-trash" />
        </button>
      </div>

      <div className="topbar-right">
        <span className={`save-indicator ${saveState}`}>
          {saveState === "saving" && (
            <>
              <i className="bi bi-arrow-repeat spin" /> 保存中...
            </>
          )}
          {saveState === "saved" && (
            <>
              <i className="bi bi-check-circle-fill" /> 保存済み
            </>
          )}
          {saveState === "idle" && ready && (
            <>
              <i className="bi bi-cloud-check" /> 自動保存ON
            </>
          )}
        </span>
        <button className="btn-primary-sm" onClick={handleSaveNow}>
          <i className="bi bi-save" /> 今すぐ保存
        </button>
      </div>
    </header>
  );
}
