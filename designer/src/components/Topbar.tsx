import { useEffect, useState, useCallback } from "react";
import { useEditor } from "@grapesjs/react";
import type { PanelMode, ThemeId } from "./Designer";
import type { McpStatus } from "../mcp/mcpBridge";
import { CodeEditorModal } from "./CodeEditorModal";
import { SaveBlockModal } from "./SaveBlockModal";
import { upsertCustomBlock } from "../store/customBlockStore";

export const CUSTOM_BLOCK_CATEGORY = "マイブロック";

/** 共有ブロックとして保存する際、HTML のルート要素に data-shared-block-id を付与する */
function addSharedBlockId(html: string, blockId: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  if (doc.body.children.length === 1) {
    doc.body.children[0].setAttribute("data-shared-block-id", blockId);
    return doc.body.innerHTML;
  }
  // 複数ルートの場合は div でラップ
  return `<div data-shared-block-id="${blockId}">${html}</div>`;
}

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
  isDirty?: boolean;
  onSaveToFile?: () => Promise<void>;
}

export function Topbar({ ready, panelMode, onOpenPanel, activeTheme, onThemeChange, mcpStatus, backLink, isDirty, onSaveToFile }: Props) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const editor = useEditor();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelected, setHasSelected] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeModalHtml, setCodeModalHtml] = useState("");
  const [codeModalName, setCodeModalName] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("desktop");
  const [saveBlockOpen, setSaveBlockOpen] = useState(false);
  const [saveBlockDefaultName, setSaveBlockDefaultName] = useState("");

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
    const onSelectionChange = () => {
      setHasSelected(editor.getSelectedAll().length > 0);
    };

    const onDeviceChange = () => {
      setSelectedDevice(editor.Devices.getSelected()?.get("id") ?? "desktop");
    };

    editor.on("component:add component:remove component:update", update);
    editor.on("undo redo", update);
    editor.on("storage:start:store", onStorageStart);
    editor.on("storage:end:store", onStorageEnd);
    editor.on("component:selected component:deselected", onSelectionChange);
    editor.on("device:select", onDeviceChange);
    update();
    onSelectionChange();
    onDeviceChange();

    return () => {
      editor.off("component:add component:remove component:update", update);
      editor.off("undo redo", update);
      editor.off("storage:start:store", onStorageStart);
      editor.off("storage:end:store", onStorageEnd);
      editor.off("component:selected component:deselected", onSelectionChange);
      editor.off("device:select", onDeviceChange);
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
  const handleSaveNow = () => onSaveToFile?.();

  const handleOpenCodeEditor = useCallback(() => {
    if (!editor) return;
    const selected = editor.getSelected();
    if (!selected) return;
    const html = selected.toHTML();
    const name = selected.getName() || selected.get("tagName") || "コンポーネント";
    setCodeModalHtml(html);
    setCodeModalName(name);
    setCodeModalOpen(true);
  }, [editor]);

  const handleOpenSaveBlock = useCallback(() => {
    if (!editor) return;
    const selected = editor.getSelected();
    if (!selected) return;
    const defaultName = selected.getName() || selected.get("tagName") || "マイブロック";
    setSaveBlockDefaultName(defaultName as string);
    setSaveBlockOpen(true);
  }, [editor]);

  const handleSaveBlock = useCallback(async (name: string, shared: boolean) => {
    if (!editor) return;
    const selected = editor.getSelected();
    if (!selected) return;

    const id = `custom-block-${Date.now()}`;
    const rawHtml = selected.toHTML();
    const content = shared ? addSharedBlockId(rawHtml, id) : rawHtml;
    const now = new Date().toISOString();

    const customBlock = {
      id,
      label: name,
      category: CUSTOM_BLOCK_CATEGORY,
      content,
      shared,
      createdAt: now,
      updatedAt: now,
    };

    await upsertCustomBlock(customBlock);

    editor.BlockManager.add(id, {
      label: name,
      category: CUSTOM_BLOCK_CATEGORY,
      content,
      ...(shared ? { shared: true } : {}),
    } as Parameters<typeof editor.BlockManager.add>[1]);

    setSaveBlockOpen(false);
  }, [editor]);

  const handleCodeApply = useCallback((newHtml: string) => {
    if (!editor) return;
    const selected = editor.getSelected();
    if (!selected) return;
    const parent = selected.parent();
    const index = selected.index();
    // replaceWith は新しいコンポーネントを返す
    selected.replaceWith(newHtml);
    // 置換後のコンポーネントを選択
    if (parent) {
      const newComp = parent.getChildAt(index);
      if (newComp) editor.select(newComp);
    }
    setCodeModalOpen(false);
  }, [editor]);

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

  // キーボードショートカット
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力フィールド内では無効化
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "s") {
        e.preventDefault();
        onSaveToFile?.();
      } else if (ctrl && e.key === "p") {
        e.preventDefault();
        editor.runCommand("preview");
      } else if (ctrl && e.key === "d") {
        e.preventDefault();
        const selected = editor.getSelected();
        if (selected) {
          editor.runCommand("tlb-clone");
        }
      } else if (ctrl && e.key === "e") {
        e.preventDefault();
        const selected = editor.getSelected();
        if (selected) {
          const html = selected.toHTML();
          const name = selected.getName() || selected.get("tagName") || "コンポーネント";
          setCodeModalHtml(html);
          setCodeModalName(name as string);
          setCodeModalOpen(true);
        }
      } else if (e.key === "Delete" && !ctrl && !e.shiftKey && !e.altKey) {
        const selected = editor.getSelected();
        if (selected) {
          editor.runCommand("tlb-delete");
        }
      } else if (e.key === "?") {
        setHelpOpen((v) => !v);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

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
            <span className="topbar-title">業務システム デザイナー</span>
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
        <button className="icon-btn" onClick={handlePreview} title="プレビュー (Ctrl+P)">
          <i className="bi bi-eye" />
        </button>
        <button
          className="icon-btn"
          onClick={handleOpenCodeEditor}
          disabled={!hasSelected}
          title="HTMLソースを編集 (Ctrl+E)"
        >
          <i className="bi bi-code-slash" />
        </button>
        <button
          className="icon-btn"
          onClick={handleOpenSaveBlock}
          disabled={!hasSelected}
          title="マイブロックとして保存"
        >
          <i className="bi bi-bookmark-plus" />
        </button>
        <button
          className="icon-btn danger"
          onClick={handleClear}
          title="キャンバスをクリア"
        >
          <i className="bi bi-trash" />
        </button>
        <div className="divider" />
        <div className="device-switcher">
          <button
            className={`device-btn${selectedDevice === "desktop" ? " active" : ""}`}
            onClick={() => editor?.setDevice("desktop")}
            title="PC（全幅）"
          >
            <i className="bi bi-display" />
          </button>
          <button
            className={`device-btn${selectedDevice === "tablet" ? " active" : ""}`}
            onClick={() => editor?.setDevice("tablet")}
            title="タブレット (768px)"
          >
            <i className="bi bi-tablet" />
          </button>
          <button
            className={`device-btn${selectedDevice === "smartphone" ? " active" : ""}`}
            onClick={() => editor?.setDevice("smartphone")}
            title="スマートフォン (375px)"
          >
            <i className="bi bi-phone" />
          </button>
        </div>
        <div className="divider" />
        <button
          className="icon-btn"
          onClick={() => setHelpOpen(true)}
          title="キーボードショートカット一覧 (?)"
        >
          <i className="bi bi-keyboard" />
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
        {isDirty ? (
          <button
            className="btn-primary-sm"
            onClick={handleSaveNow}
            title="変更を保存 (Ctrl+S)"
            disabled={!ready}
            style={{ background: "#f59e0b", animation: "none" }}
          >
            <i className="bi bi-save" /> 保存
          </button>
        ) : (
          <span className="save-indicator saved" style={{ visibility: saveState === "saved" ? "visible" : "hidden" }}>
            <i className="bi bi-check-circle-fill" /> 保存済み
          </span>
        )}
        <button className="btn-secondary-sm" onClick={handleExportHtml} title="HTMLファイルとしてダウンロード">
          <i className="bi bi-download" /> HTMLエクスポート
        </button>
        <div className="divider" />
        <McpIndicator status={mcpStatus} />
      </div>

      <CodeEditorModal
        open={codeModalOpen}
        initialHtml={codeModalHtml}
        componentName={codeModalName}
        onApply={handleCodeApply}
        onClose={() => setCodeModalOpen(false)}
      />

      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

      <SaveBlockModal
        open={saveBlockOpen}
        defaultName={saveBlockDefaultName}
        onSave={handleSaveBlock}
        onClose={() => setSaveBlockOpen(false)}
      />
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

const SHORTCUTS = [
  { key: "Ctrl + Z",       desc: "元に戻す" },
  { key: "Ctrl + Shift + Z", desc: "やり直し" },
  { key: "Ctrl + S",       desc: "今すぐ保存" },
  { key: "Ctrl + P",       desc: "プレビュー" },
  { key: "Ctrl + D",       desc: "選択コンポーネントを複製" },
  { key: "Ctrl + E",       desc: "HTMLソースエディタを開く" },
  { key: "Delete",         desc: "選択コンポーネントを削除" },
  { key: "?",              desc: "このヘルプを表示 / 非表示" },
  { key: "Esc",            desc: "ヘルプを閉じる" },
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <i className="bi bi-keyboard" />
          <span>キーボードショートカット</span>
          <button className="shortcuts-close" onClick={onClose}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <ul className="shortcuts-list">
          {SHORTCUTS.map(({ key, desc }) => (
            <li key={key}>
              <span className="shortcuts-desc">{desc}</span>
              <kbd className="shortcuts-key">{key}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
