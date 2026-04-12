import { useState, useEffect, useRef } from "react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setHtml(initialHtml);
      setError(null);
      // フォーカスを少し遅らせてモーダル描画後に当てる
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, initialHtml]);

  if (!open) return null;

  const handleApply = () => {
    const trimmed = html.trim();
    if (!trimmed) {
      setError("HTMLが空です");
      return;
    }
    // 簡易バリデーション: パースできるか確認
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab キーでインデント挿入
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = html.substring(0, start) + "  " + html.substring(end);
      setHtml(newVal);
      // カーソル位置を復元
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
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
          <textarea
            ref={textareaRef}
            className="code-editor-textarea"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
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
