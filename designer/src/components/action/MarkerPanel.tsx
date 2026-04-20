/**
 * ActionGroup.markers 編集パネル (#261)
 *
 * グループ全体宛のマーカー + ステップ紐付きマーカーを一覧表示。
 * 新規追加 (chat / attention / todo / question)、解決済みの非表示切替、
 * 削除 (resolvedAt で論理削除) をサポート。
 *
 * Claude Code が /designer-work でこれを MCP 経由で読み取り、
 * 対応後 resolvedAt を埋めて resolution コメントを付ける。
 */
import { useState } from "react";
import type { ActionGroup, Marker, MarkerKind } from "../../types/action";
import { generateUUID } from "../../utils/uuid";

interface Props {
  group: ActionGroup;
  onChange: (group: ActionGroup) => void;
}

const KIND_LABELS: Record<MarkerKind, string> = {
  chat: "チャット",
  attention: "注目",
  todo: "TODO",
  question: "質問",
};
const KIND_ICONS: Record<MarkerKind, string> = {
  chat: "bi-chat-left-text",
  attention: "bi-eye",
  todo: "bi-check2-square",
  question: "bi-question-circle",
};

export function MarkerPanel({ group, onChange }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [newKind, setNewKind] = useState<MarkerKind>("chat");
  const [newBody, setNewBody] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const markers = group.markers ?? [];
  const displayed = showResolved ? markers : markers.filter((m) => !m.resolvedAt);
  const unresolved = markers.filter((m) => !m.resolvedAt).length;

  const addMarker = () => {
    const body = newBody.trim();
    if (!body) return;
    const next: Marker = {
      id: generateUUID(),
      kind: newKind,
      body,
      author: "human",
      createdAt: new Date().toISOString(),
    };
    onChange({ ...group, markers: [...markers, next] });
    setNewBody("");
  };

  const removeMarker = (id: string) => {
    const next = markers.filter((m) => m.id !== id);
    onChange({ ...group, markers: next.length > 0 ? next : undefined });
  };

  const startResolve = (id: string) => {
    setResolvingId(id);
    setResolveNote("");
  };

  const cancelResolve = () => {
    setResolvingId(null);
    setResolveNote("");
  };

  const confirmResolve = (id: string) => {
    const note = resolveNote.trim();
    const next = markers.map((m) => (
      m.id === id
        ? {
            ...m,
            resolvedAt: new Date().toISOString(),
            resolution: note || "(人間が手動で解決)",
          }
        : m
    ));
    onChange({ ...group, markers: next });
    setResolvingId(null);
    setResolveNote("");
  };

  const unresolve = (id: string) => {
    const next = markers.map((m) => (
      m.id === id ? { ...m, resolvedAt: undefined, resolution: undefined } : m
    ));
    onChange({ ...group, markers: next });
  };

  return (
    <div className="catalog-panel marker-panel">
      <button
        type="button"
        className="catalog-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <i className={`bi bi-chevron-${expanded ? "down" : "right"}`} />
        <i className="bi bi-megaphone" />
        {" "}AI へのマーカー ({unresolved} 未解決 / {markers.length} 総件数)
      </button>
      {expanded && (
        <div className="catalog-panel-body">
          <div className="catalog-help">
            AI (Claude Code) への指示・質問を保持。
            <code>/designer-work</code> で未解決マーカーをまとめて処理させる。
            <br />
            <strong>committed な内容を編集させたい場合は kind=TODO + 命令形</strong>で
            (「〜を追加して」「〜を削除して」)。質問や注目は AI が保守的に保留します。
          </div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <label className="small d-flex align-items-center gap-1">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              解決済みも表示
            </label>
          </div>
          {displayed.length === 0 && (
            <div className="catalog-empty">
              {markers.length === 0 ? "まだマーカーがありません。" : "未解決のマーカーはありません。"}
            </div>
          )}
          {displayed.map((m) => {
            const resolved = !!m.resolvedAt;
            const isResolving = resolvingId === m.id;
            return (
              <div className={`catalog-row marker-row marker-kind-${m.kind} ${resolved ? "resolved" : ""}`} key={m.id}>
                <div className="catalog-row-header">
                  <span className="marker-kind-badge">
                    <i className={`bi ${KIND_ICONS[m.kind]}`} /> {KIND_LABELS[m.kind]}
                  </span>
                  <span className="marker-author small text-muted">
                    {m.author === "human" ? "人間" : "AI"}
                  </span>
                  {m.stepId && (
                    <span className="marker-step-ref small text-muted">
                      step: {m.stepId}
                      {m.fieldPath && `.${m.fieldPath}`}
                    </span>
                  )}
                  {resolved ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-success ms-auto"
                      onClick={() => unresolve(m.id)}
                      title="未解決に戻す"
                    >
                      <i className="bi bi-check-circle-fill" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-link ms-auto marker-resolve-btn"
                      onClick={() => startResolve(m.id)}
                      title="解決済みにする (メモ付き)"
                      disabled={isResolving}
                    >
                      <i className="bi bi-check-circle" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger"
                    onClick={() => removeMarker(m.id)}
                    title="削除"
                  >
                    <i className="bi bi-trash" />
                  </button>
                </div>
                <div className="marker-body">{m.body}</div>
                {isResolving && !resolved && (
                  <div className="marker-resolve-form">
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={resolveNote}
                      placeholder="解決メモ (任意): 何をしたか・なぜ閉じるか"
                      onChange={(e) => setResolveNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          confirmResolve(m.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelResolve();
                        }
                      }}
                      autoFocus
                    />
                    <div className="marker-resolve-form-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={() => confirmResolve(m.id)}
                        title="解決済みとして閉じる (Ctrl+Enter)"
                      >
                        <i className="bi bi-check-lg" /> 解決
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={cancelResolve}
                        title="キャンセル (Esc)"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
                {resolved && m.resolution && (
                  <div className="marker-resolution">
                    <strong>解決メモ:</strong> {m.resolution}
                  </div>
                )}
                <div className="marker-timestamps small text-muted">
                  {new Date(m.createdAt).toLocaleString("ja-JP")}
                  {resolved && m.resolvedAt && (
                    <> — 解決: {new Date(m.resolvedAt).toLocaleString("ja-JP")}</>
                  )}
                </div>
              </div>
            );
          })}
          <div className="catalog-row catalog-row-add marker-add-row">
            <select
              className="form-select form-select-sm"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as MarkerKind)}
              style={{ maxWidth: 120 }}
            >
              {(["chat", "attention", "todo", "question"] as MarkerKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
            <input
              className="form-control form-control-sm"
              placeholder="AI への指示・質問を入力 (例: 在庫引当の SQL を条件付き UPDATE に変更して)"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMarker(); }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={addMarker}
              disabled={!newBody.trim()}
            >
              <i className="bi bi-plus-lg" /> 追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
