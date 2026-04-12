import { useState, useRef, useEffect } from "react";

interface Props {
  projectName: string;
  screenCount: number;
  onAddScreen: () => void;
  onRenameProject: (name: string) => void;
  onClearAll: () => void;
  onExportJSON: () => void;
  onImportJSON: (json: string) => void;
  onCopyMermaid: () => void;
  onExportMarkdown: () => void;
}

export function FlowTopbar({
  projectName, screenCount, onAddScreen,
  onRenameProject, onClearAll,
  onExportJSON, onImportJSON, onCopyMermaid, onExportMarkdown,
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

  // メニュー外クリックで閉じる
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
    // reset so same file can be re-imported
    e.target.value = "";
  };

  return (
    <header className="flow-topbar">
      <div className="flow-topbar-left">
        <i className="bi bi-diagram-3 topbar-logo" />
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
        <span className="flow-topbar-subtitle">— 画面フロー図</span>
      </div>

      <div className="flow-topbar-center">
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {screenCount} 画面
        </span>
      </div>

      <div className="flow-topbar-right">
        {/* ファイルメニュー */}
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

        <button className="flow-btn flow-btn-primary" onClick={onAddScreen}>
          <i className="bi bi-plus-lg" /> 画面を追加
        </button>
      </div>
    </header>
  );
}
