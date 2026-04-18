import { useState, useRef, useEffect } from "react";
import { SaveResetButtons } from "../common/SaveResetButtons";

export type ViewMode = "flow" | "table";

interface Props {
  projectName: string;
  screenCount: number;
  zoomLevel: number;
  viewMode: ViewMode;
  onAddScreen: () => void;
  onAddGroup: () => void;
  onRenameProject: (name: string) => void;
  onClearAll: () => void;
  onExportJSON: () => void;
  onImportJSON: (json: string) => void;
  onCopyMermaid: () => void;
  onExportMarkdown: () => void;
  onZoomChange: (zoom: number) => void;
  onFitView: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onReset?: () => void;
}

export function FlowSubToolbar({
  projectName, screenCount, zoomLevel, viewMode,
  onAddScreen, onAddGroup, onRenameProject, onClearAll,
  onExportJSON, onImportJSON, onCopyMermaid, onExportMarkdown,
  onZoomChange, onFitView, onViewModeChange,
  onUndo, onRedo, canUndo, canRedo,
  isDirty, isSaving, onSave, onReset,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== projectName) {
      onRenameProject(trimmed);
    } else {
      setDraft(projectName);
    }
    setEditing(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImportJSON(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <header className="flow-topbar">
      <div className="flow-topbar-left">
        {editing ? (
          <input
            ref={inputRef}
            className="flow-topbar-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(projectName); setEditing(false); }
            }}
          />
        ) : (
          <span
            className="flow-topbar-title flow-topbar-title-editable"
            onClick={() => { setDraft(projectName); setEditing(true); }}
            title="クリックしてプロジェクト名を編集"
          >
            {projectName} <i className="bi bi-pencil flow-topbar-edit-icon" />
          </span>
        )}
      </div>

      <div className="flow-topbar-center">
        <div className="flow-view-toggle">
          <button
            className={`flow-view-btn${viewMode === "flow" ? " active" : ""}`}
            onClick={() => onViewModeChange("flow")}
            title="フロー図"
          >
            <i className="bi bi-diagram-3" /> フロー図
          </button>
          <button
            className={`flow-view-btn${viewMode === "table" ? " active" : ""}`}
            onClick={() => onViewModeChange("table")}
            title="一覧"
          >
            <i className="bi bi-table" /> 一覧
          </button>
        </div>
        <span className="flow-zoom-separator" />
        <span className="flow-topbar-screen-count">{screenCount} 画面</span>
        <span className="flow-zoom-separator" />
        <div className={`flow-zoom-control${viewMode === "table" ? " hidden" : ""}`}>
          <button
            className="flow-zoom-btn"
            onClick={() => onZoomChange(zoomLevel - 0.1)}
            title="縮小"
          >
            <i className="bi bi-dash" />
          </button>
          <input
            type="range"
            className="flow-zoom-slider"
            min={0.25} max={2} step={0.05}
            value={zoomLevel}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            title={`${Math.round(zoomLevel * 100)}%`}
          />
          <button
            className="flow-zoom-btn"
            onClick={() => onZoomChange(zoomLevel + 0.1)}
            title="拡大"
          >
            <i className="bi bi-plus" />
          </button>
          <span className="flow-zoom-label">{Math.round(zoomLevel * 100)}%</span>
        </div>
        {viewMode === "flow" && (
          <button
            className="flow-btn flow-btn-ghost flow-fit-view-btn"
            onClick={onFitView}
            title="全体表示"
          >
            <i className="bi bi-arrows-fullscreen" />
          </button>
        )}
      </div>

      <div className="flow-topbar-right">
        {onUndo && (
          <button
            className="flow-btn flow-btn-secondary"
            onClick={onUndo}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
          >
            <i className="bi bi-arrow-counterclockwise" />
          </button>
        )}
        {onRedo && (
          <button
            className="flow-btn flow-btn-secondary"
            onClick={onRedo}
            disabled={!canRedo}
            title="やり直し (Ctrl+Y)"
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
        )}
        <div style={{ position: "relative" }}>
          <button
            className="flow-btn flow-btn-secondary"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          >
            <i className="bi bi-three-dots-vertical" /> ファイル
          </button>
          {menuOpen && (
            <div className="flow-file-menu" onClick={(e) => e.stopPropagation()}>
              <button className="flow-file-menu-item" onClick={() => { onExportJSON(); setMenuOpen(false); }}>
                <i className="bi bi-download" /> JSON エクスポート
              </button>
              <button className="flow-file-menu-item" onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}>
                <i className="bi bi-upload" /> JSON インポート
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-file-menu-item" onClick={() => { onExportMarkdown(); setMenuOpen(false); }}>
                <i className="bi bi-file-earmark-text" /> Markdown エクスポート
              </button>
              <button className="flow-file-menu-item" onClick={() => { onCopyMermaid(); setMenuOpen(false); }}>
                <i className="bi bi-clipboard" /> Mermaid をコピー
              </button>
              <div className="flow-context-menu-separator" />
              <button
                className="flow-file-menu-item danger"
                onClick={() => { onClearAll(); setMenuOpen(false); }}
                disabled={screenCount === 0}
              >
                <i className="bi bi-trash" /> 全クリア
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </div>

        {viewMode === "flow" && (
          <button className="flow-btn flow-btn-secondary" onClick={onAddGroup} title="グループを追加">
            <i className="bi bi-collection" /> グループ
          </button>
        )}
        <button className="flow-btn flow-btn-primary" onClick={onAddScreen}>
          <i className="bi bi-plus-lg" /> 画面を追加
        </button>
        {onSave && onReset && (
          <SaveResetButtons
            isDirty={!!isDirty}
            isSaving={!!isSaving}
            onSave={onSave}
            onReset={onReset}
          />
        )}
      </div>
    </header>
  );
}
