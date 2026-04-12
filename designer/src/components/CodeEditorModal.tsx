import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";

/** HTML を整形してインデント付きで返す */
function formatHtml(raw: string): string {
  const VOID_ELEMENTS = new Set([
    "area","base","br","col","embed","hr","img","input",
    "link","meta","param","source","track","wbr",
  ]);
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const roots = doc.body.childNodes;

  function serialize(node: Node, depth: number): string {
    const indent = "  ".repeat(depth);

    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return text ? `${indent}${text}\n` : "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    let attrs = "";
    for (const attr of Array.from(el.attributes)) {
      attrs += ` ${attr.name}="${attr.value}"`;
    }

    if (VOID_ELEMENTS.has(tag)) {
      return `${indent}<${tag}${attrs}>\n`;
    }

    const children = Array.from(el.childNodes);
    if (
      children.length === 1 &&
      children[0].nodeType === Node.TEXT_NODE &&
      (children[0].textContent ?? "").trim().length < 80
    ) {
      const text = (children[0].textContent ?? "").trim();
      return `${indent}<${tag}${attrs}>${text}</${tag}>\n`;
    }

    let inner = "";
    for (const child of children) {
      inner += serialize(child, depth + 1);
    }

    if (!inner) {
      return `${indent}<${tag}${attrs}></${tag}>\n`;
    }
    return `${indent}<${tag}${attrs}>\n${inner}${indent}</${tag}>\n`;
  }

  let result = "";
  roots.forEach((node) => { result += serialize(node, 0); });
  return result.trimEnd();
}

interface Props {
  open: boolean;
  initialHtml: string;
  componentName: string;
  onApply: (html: string) => void;
  onClose: () => void;
}

export function CodeEditorModal({ open, initialHtml, componentName, onApply, onClose }: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHtml(formatHtml(initialHtml));
      setError(null);
    }
  }, [open, initialHtml]);

  if (!open) return null;

  const handleApply = () => {
    const trimmed = html.trim();
    if (!trimmed) {
      setError("HTMLが空です");
      return;
    }
    try {
      const doc = new DOMParser().parseFromString(trimmed, "text/html");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        setError("HTMLの解析に失敗しました: " + parseError.textContent?.slice(0, 100));
        return;
      }
    } catch {
      // DOMParser はほぼエラーを投げないが念のため
    }
    setError(null);
    onApply(trimmed);
  };

  return (
    <div className="code-modal-overlay" onClick={onClose}>
      <div className="code-modal" onClick={(e) => e.stopPropagation()}>
        <div className="code-modal-header">
          <div className="code-modal-title">
            <i className="bi bi-code-slash" />
            <span>HTMLソース編集</span>
            <span className="code-modal-component-name">{componentName}</span>
          </div>
          <button className="code-modal-close" onClick={onClose}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="code-modal-body">
          {error && (
            <div className="code-modal-error">
              <i className="bi bi-exclamation-triangle" /> {error}
            </div>
          )}
          <Editor
            language="html"
            theme="vs-dark"
            value={html}
            onChange={(v) => setHtml(v ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              tabSize: 2,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              folding: true,
              bracketPairColorization: { enabled: true },
              formatOnPaste: true,
            }}
          />
        </div>

        <div className="code-modal-footer">
          <button className="code-btn code-btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button className="code-btn code-btn-primary" onClick={handleApply}>
            <i className="bi bi-check-lg" /> 適用
          </button>
        </div>
      </div>
    </div>
  );
}
