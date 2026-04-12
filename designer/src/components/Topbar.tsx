import { useEffect, useState } from "react";
import { useEditor } from "@grapesjs/react";
import type { PanelMode, ThemeId } from "./Designer";
import type { McpStatus } from "../mcp/mcpBridge";

const THEMES: { id: ThemeId; label: string; icon: string; color: string }[] = [
  { id: "standard", label: "標準",    icon: "bi-grid-3x3",     color: "#6c757d" },
  { id: "card",     label: "カード型", icon: "bi-layers",       color: "#6366f1" },
  { id: "compact",  label: "コンパクト", icon: "bi-table",      color: "#0284c7" },
  { id: "dark",     label: "ダーク",   icon: "bi-moon-stars",   color: "#0f172a" },
];

interface BackLink {
  label: string;
  onClick: () => void;
}

interface Props {
  ready: boolean;
  panelMode: PanelMode;
  onOpenPanel: () => void;
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  mcpStatus: McpStatus;
  backLink?: BackLink;
}

export function Topbar({ ready, panelMode, onOpenPanel, activeTheme, onThemeChange, mcpStatus, backLink }: Props) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
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

  const handleExportHtml = () => {
    if (!editor) return;
    const html = editor.getHtml();
    const css = editor.getCss();
    const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>エクスポート</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" />
  <style>${css}</style>
</head>
<body>
${html}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "design-export.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {backLink ? (
          <>
            <button
              className="icon-btn"
              onClick={backLink.onClick}
              title="フロー図に戻る"
              style={{ marginRight: 6 }}
            >
              <i className="bi bi-arrow-left" />
            </button>
            <span className="topbar-title">{backLink.label}</span>
          </>
        ) : (
          <>
            <i className="bi bi-palette2 topbar-logo" />
            <span className="topbar-title">業務シス���ム デ��イナー</span>
          </>
        )}
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
        {/* テーマ選択 */}
        <div className="theme-selector">
          <button
            className="theme-selector-btn"
            onClick={() => setThemeMenuOpen((v) => !v)}
            title="デザインテーマを選択"
          >
            <i className={`bi ${THEMES.find((t) => t.id === activeTheme)?.icon ?? "bi-palette"}`} />
            <span>{THEMES.find((t) => t.id === activeTheme)?.label ?? "テーマ"}</span>
            <i className="bi bi-chevron-down" style={{ fontSize: 10 }} />
          </button>
          {themeMenuOpen && (
            <div className="theme-menu">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-menu-item${activeTheme === t.id ? " active" : ""}`}
                  onClick={() => { onThemeChange(t.id); setThemeMenuOpen(false); }}
                >
                  <span className="theme-swatch" style={{ background: t.color }} />
                  <i className={`bi ${t.icon}`} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="divider" />
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
        <button className="btn-secondary-sm" onClick={handleExportHtml} title="HTMLファイルとしてダウンロード">
          <i className="bi bi-download" /> HTMLエクスポート
        </button>
        <div className="divider" />
        <McpIndicator status={mcpStatus} />
      </div>
    </header>
  );
}

function McpIndicator({ status }: { status: McpStatus }) {
  const label =
    status === "connected" ? "MCP接続中" :
    status === "connecting" ? "MCP接続試行中" :
    "MCP未接続";
  const title =
    status === "connected" ? "MCPサーバーに接続されています" :
    status === "connecting" ? "MCPサーバーへの接続を試みています..." :
    "MCPサーバーに接続されていません。designer-mcpサーバーを起動してください。";

  return (
    <div className={`mcp-indicator mcp-${status}`} title={title}>
      <span className="mcp-dot" />
      <span className="mcp-label">{label}</span>
    </div>
  );
}
