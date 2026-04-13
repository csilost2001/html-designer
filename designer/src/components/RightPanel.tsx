import { useState, useEffect, useRef } from "react";
import { useEditorMaybe } from "@grapesjs/react";
import { A11yPanel } from "./A11yPanel";

type TabId = "styles" | "traits" | "layers" | "a11y";

/**
 * GrapesJS のネイティブ UI を render() メソッドで取得し、
 * React の ref コンテナにマウントするコンポーネント。
 *
 * <Canvas/> 使用時は GrapesJS のパネルシステムが無効化されるため、
 * @grapesjs/react の Provider + Container パターンは空になる。
 * 代わりに各マネージャーの render() を直接呼び出す。
 */
export function RightPanel() {
  const [tab, setTab] = useState<TabId>("styles");
  const editor = useEditorMaybe();
  const [loaded, setLoaded] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const selectorRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const traitRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // editor:load 後にマネージャーの render() を呼ぶ
  useEffect(() => {
    if (!editor) return;

    const onLoad = () => setLoaded(true);

    // 既にロード済みならすぐセット
    if (editor.getComponents().length > 0 || editor.getStyle().length > 0) {
      setLoaded(true);
    }
    editor.on("load", onLoad);
    return () => {
      editor.off("load", onLoad);
    };
  }, [editor]);

  // コンポーネント選択状態を追跡
  useEffect(() => {
    if (!editor) return;
    const onToggle = () => setHasSelection(!!editor.getSelected());
    editor.on("component:toggled", onToggle);
    return () => {
      editor.off("component:toggled", onToggle);
    };
  }, [editor]);

  // ロード完了後にネイティブ UI をマウント
  useEffect(() => {
    if (!editor || !loaded || mountedRef.current) return;
    mountedRef.current = true;

    // Selector Manager
    if (selectorRef.current) {
      const el = editor.SelectorManager.render([]);
      selectorRef.current.appendChild(el);
    }

    // Style Manager
    if (styleRef.current) {
      const el = editor.StyleManager.render();
      styleRef.current.appendChild(el);
    }

    // Trait Manager
    if (traitRef.current) {
      const el = editor.TraitManager.render();
      traitRef.current.appendChild(el);
    }

    // Layer Manager
    if (layerRef.current) {
      const el = editor.LayerManager.render();
      layerRef.current.appendChild(el);
    }
  }, [editor, loaded]);

  return (
    <div className="right-panel">
      <div className="right-tabs">
        <button
          className={tab === "styles" ? "active" : ""}
          onClick={() => setTab("styles")}
        >
          <i className="bi bi-brush" /> スタイル
        </button>
        <button
          className={tab === "traits" ? "active" : ""}
          onClick={() => setTab("traits")}
        >
          <i className="bi bi-sliders" /> 属性
        </button>
        <button
          className={tab === "layers" ? "active" : ""}
          onClick={() => setTab("layers")}
        >
          <i className="bi bi-stack" /> レイヤー
        </button>
        <button
          className={tab === "a11y" ? "active" : ""}
          onClick={() => setTab("a11y")}
          title="アクセシビリティ"
        >
          <i className="bi bi-universal-access" /> a11y
        </button>
      </div>

      <div className="right-content">
        <div hidden={tab !== "styles"}>
          {!hasSelection && (
            <div className="right-panel-empty">
              <i className="bi bi-cursor" />
              <p>コンポーネントを選択してください</p>
            </div>
          )}
          <div style={{ display: hasSelection ? undefined : "none" }}>
            <div className="panel-block">
              <div className="panel-block-title">セレクタ</div>
              <div ref={selectorRef} />
            </div>
            <div className="panel-block">
              <div className="panel-block-title">スタイル</div>
              <div ref={styleRef} />
            </div>
          </div>
        </div>
        <div hidden={tab !== "traits"}>
          {!hasSelection && (
            <div className="right-panel-empty">
              <i className="bi bi-cursor" />
              <p>コンポーネントを選択してください</p>
            </div>
          )}
          <div style={{ display: hasSelection ? undefined : "none" }}>
            <div className="panel-block">
              <div className="panel-block-title">属性</div>
              <div ref={traitRef} />
            </div>
          </div>
        </div>
        <div hidden={tab !== "layers"}>
          <div className="panel-block">
            <div className="panel-block-title">レイヤー</div>
            <div ref={layerRef} />
          </div>
        </div>
        <div hidden={tab !== "a11y"}>
          <A11yPanel />
        </div>
      </div>
    </div>
  );
}
