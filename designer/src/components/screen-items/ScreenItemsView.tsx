/**
 * 画面項目定義ビュー (#318 プロトタイプ、#323 既存画面からの抽出対応)。
 *
 * MVP: シングルトンタブで、中で画面を選択して項目を編集する。
 * 保存・リセット・undo/redo は useResourceEditor + EditorHeader に統一 (#318 改善)。
 *
 * 項目追加経路 3 つ:
 * 1. 空欄追加 (従来)
 * 2. 画面デザインから選択 (#323 — モーダルで候補リスト + チェックボックス)
 * 3. (将来) GrapesJS サイドバーからの直接追加 (#322)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistentState } from "../../hooks/usePersistentState";
import { TableSubToolbar } from "../table/TableSubToolbar";
import { EditorHeader } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import {
  loadScreenItems,
  saveScreenItems,
} from "../../store/screenItemsStore";
import { loadProject } from "../../store/flowStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import type { ScreenItem, ScreenItemsFile } from "../../types/screenItem";
import type { FieldType } from "../../types/action";
import { ScreenItemCandidatesModal } from "./ScreenItemCandidatesModal";
import type { ExtractedCandidate } from "../../utils/screenItemExtractor";
import { generateAutoId, getFieldTypePrefix } from "../../utils/screenItemNaming";
import "../../styles/screen-items.css";

const PRIMITIVE_TYPES: Array<"string" | "number" | "boolean" | "date"> =
  ["string", "number", "boolean", "date"];

type ScreenMeta = { id: string; name: string };

/** useResourceEditor 互換のため ScreenItemsFile を読み書きする load/save ラッパー */
async function loadFile(screenId: string): Promise<ScreenItemsFile | null> {
  return loadScreenItems(screenId);
}
async function saveFile(data: ScreenItemsFile): Promise<void> {
  await saveScreenItems(data);
}

export function ScreenItemsView() {
  const [screens, setScreens] = useState<ScreenMeta[]>([]);
  const [selectedScreenId, setSelectedScreenId] = usePersistentState<string | undefined>(
    "screen-items:selectedScreenId",
    undefined,
  );
  const [candidatesModalOpen, setCandidatesModalOpen] = useState(false);

  /** ID フィールドのフォーカス時の値 (行インデックス → 元の値) */
  const idFocusVals = useRef<Map<number, string>>(new Map());

  /** リネーム確認ダイアログの状態 */
  const [pendingRename, setPendingRename] = useState<{
    idx: number;
    oldId: string;
    newId: string;
    affectedGroups: Array<{ id: string; name: string; refCount: number }>;
    totalRefs: number;
  } | null>(null);

  /** ID リセット確認ダイアログの状態 */
  const [pendingReset, setPendingReset] = useState<{
    resets: Array<{ idx: number; oldId: string; newId: string }>;
    affectedGroups: Array<{ id: string; name: string; refCount: number }>;
    totalRefs: number;
  } | null>(null);

  /** 複数選択中の行インデックス */
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // 画面一覧をロード (初回 + MCP 接続復帰時)
  useEffect(() => {
    let mounted = true;
    const doLoad = () => {
      loadProject().then((p) => {
        if (!mounted) return;
        const metas = p.screens.map((s) => ({ id: s.id, name: s.name }));
        setScreens(metas);
        setSelectedScreenId((cur) => {
          if (cur && metas.some((m) => m.id === cur)) return cur; // 有効な保存済み ID を維持
          return metas.length > 0 ? metas[0].id : undefined;
        });
      }).catch(console.error);
    };
    mcpBridge.startWithoutEditor();
    doLoad();
    const unsubStatus = mcpBridge.onStatusChange((s) => {
      if (s === "connected") doLoad();
    });
    return () => {
      mounted = false;
      unsubStatus();
    };
  }, []);

  const {
    state: file,
    isDirty, isSaving, serverChanged,
    update, updateSilent, commit,
    undo, redo, canUndo, canRedo,
    handleSave, handleReset, dismissServerBanner,
  } = useResourceEditor<ScreenItemsFile>({
    tabType: "screen-items",
    mtimeKind: "screenItems",
    draftKind: "screen-items",
    id: selectedScreenId,
    load: loadFile,
    save: saveFile,
    broadcastName: "screenItemsChanged",
    broadcastIdField: "screenId",
  });

  const handleSwitchScreen = (nextId: string) => {
    if (isDirty) {
      const ok = window.confirm("未保存の変更があります。破棄して別の画面に切り替えますか?");
      if (!ok) return;
    }
    setSelectedScreenId(nextId);
  };

  const handleAddItem = useCallback(() => {
    update((f) => {
      f.items.push({
        id: "",
        label: "",
        type: "string",
      });
    });
  }, [update]);

  const handleUpdateItem = useCallback((idx: number, patch: Partial<ScreenItem>) => {
    updateSilent((f) => {
      Object.assign(f.items[idx], patch);
    });
  }, [updateSilent]);

  const handleRemoveItem = useCallback((idx: number) => {
    update((f) => {
      f.items.splice(idx, 1);
    });
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      }
      return next;
    });
  }, [update]);

  /** 複数インデックスのリセット用新 ID を計算 (バッチ内で重複しないよう pool を積み上げ) */
  const buildResets = useCallback((indices: number[]): Array<{ idx: number; oldId: string; newId: string }> => {
    if (!file) return [];
    const indicesSet = new Set(indices);
    const pool = file.items
      .filter((_, i) => !indicesSet.has(i))
      .map((item) => item.id)
      .filter(Boolean);

    return indices.map((idx) => {
      const item = file.items[idx];
      const prefix = getFieldTypePrefix(item.type);
      const newId = generateAutoId(prefix, pool);
      pool.push(newId);
      return { idx, oldId: item.id, newId };
    });
  }, [file]);

  /** ID リセット開始: 参照チェック → 確認ダイアログ or 即実行 */
  const handleResetItems = useCallback(async (indices: number[]) => {
    if (!file || !selectedScreenId) return;
    if (isDirty) {
      alert("未保存の変更があります。先に保存してからIDをリセットしてください。");
      return;
    }
    const resets = buildResets(indices);
    if (resets.length === 0) return;

    // 空 ID 行はリネーム不要 (local に新 ID を直接セット)
    const toLocalSet = resets.filter((r) => !r.oldId);
    const toRename = resets.filter((r) => !!r.oldId);

    if (toLocalSet.length > 0) {
      updateSilent((f) => {
        for (const { idx, newId } of toLocalSet) {
          f.items[idx].id = newId;
        }
      });
      commit();
    }

    if (toRename.length === 0) return;

    // 参照チェック (全対象を並列チェック)
    try {
      const results = await Promise.all(
        toRename.map((r) =>
          mcpBridge.request("checkScreenItemRefs", {
            screenId: selectedScreenId,
            itemId: r.oldId,
          }) as Promise<{ affectedActionGroups: Array<{ id: string; name: string; refCount: number }>; totalRefs: number }>,
        ),
      );

      const totalRefs = results.reduce((s, r) => s + r.totalRefs, 0);

      // 処理フロー名でまとめる (同一グループが複数 reset で重複する可能性あり)
      const groupMap = new Map<string, { id: string; name: string; refCount: number }>();
      for (const r of results) {
        for (const ag of r.affectedActionGroups) {
          const existing = groupMap.get(ag.id);
          if (existing) existing.refCount += ag.refCount;
          else groupMap.set(ag.id, { ...ag });
        }
      }
      const affectedGroups = [...groupMap.values()];

      if (totalRefs === 0) {
        // 参照なし → 即実行
        for (const { oldId, newId } of toRename) {
          await mcpBridge.request("renameScreenItem", {
            screenId: selectedScreenId,
            oldId,
            newId,
          });
        }
      } else {
        setPendingReset({ resets: toRename, affectedGroups, totalRefs });
      }
    } catch {
      // MCP 未接続等: ローカルのみ更新
      updateSilent((f) => {
        for (const { idx, newId } of toRename) {
          f.items[idx].id = newId;
        }
      });
      commit();
    }
  }, [file, selectedScreenId, isDirty, buildResets, updateSilent, commit]);

  /** リセット確認: renameScreenItem を順次実行 */
  const handleConfirmReset = useCallback(async () => {
    if (!pendingReset || !selectedScreenId) return;
    const { resets } = pendingReset;
    setPendingReset(null);
    try {
      for (const { oldId, newId } of resets) {
        await mcpBridge.request("renameScreenItem", {
          screenId: selectedScreenId,
          oldId,
          newId,
        });
      }
    } catch (e) {
      alert(`IDリセットに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [pendingReset, selectedScreenId]);

  const handleCancelReset = useCallback(() => {
    setPendingReset(null);
  }, []);

  /** 行チェックボックスのトグル */
  const handleToggleRow = useCallback((idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  /** 候補モーダルから受け取った ExtractedCandidate[] を ScreenItem[] として一括追加。
   *  HTML name 属性 (c.name) を業務識別子 ScreenItem.id として採用する。未設定なら空文字。 */
  const handleAddCandidates = useCallback((cands: ExtractedCandidate[]) => {
    if (cands.length === 0) return;
    update((f) => {
      for (const c of cands) {
        f.items.push({
          id: c.name || "",
          label: c.label || "",
          type: c.type,
          required: c.required,
          minLength: c.minLength,
          maxLength: c.maxLength,
          pattern: c.pattern,
          placeholder: c.placeholder,
        });
      }
    });
  }, [update]);

  /** ID フィールドの blur 時: 変更あり + 参照あり → 確認ダイアログを表示 */
  const handleIdBlur = useCallback(async (idx: number, e: React.FocusEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    const originalId = idFocusVals.current.get(idx) ?? newId;
    idFocusVals.current.delete(idx);

    if (newId === originalId || !originalId || !selectedScreenId) {
      commit();
      return;
    }

    try {
      const result = await mcpBridge.request("checkScreenItemRefs", {
        screenId: selectedScreenId,
        itemId: originalId,
      }) as { affectedActionGroups: Array<{ id: string; name: string; refCount: number }>; totalRefs: number };

      if (result.totalRefs === 0) {
        commit();
        return;
      }

      setPendingRename({
        idx,
        oldId: originalId,
        newId,
        affectedGroups: result.affectedActionGroups,
        totalRefs: result.totalRefs,
      });
    } catch {
      commit();
    }
  }, [selectedScreenId, commit]);

  /** リネーム確認: バックエンドに実行を委譲 */
  const handleConfirmRename = useCallback(async () => {
    if (!pendingRename || !selectedScreenId) return;
    const { idx, oldId, newId } = pendingRename;
    setPendingRename(null);
    try {
      await mcpBridge.request("renameScreenItem", {
        screenId: selectedScreenId,
        oldId,
        newId,
      });
      // broadcast で useResourceEditor がリロードするので追加操作不要
    } catch (e) {
      alert(`リネームに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      // 失敗時はローカル状態を元に戻す
      updateSilent((f) => { f.items[idx].id = oldId; });
      commit();
    }
  }, [pendingRename, selectedScreenId, updateSilent, commit]);

  /** リネームキャンセル: ローカル状態を元に戻す */
  const handleCancelRename = useCallback(() => {
    if (!pendingRename) return;
    updateSilent((f) => { f.items[pendingRename.idx].id = pendingRename.oldId; });
    commit();
    setPendingRename(null);
  }, [pendingRename, updateSilent, commit]);

  const existingIds = useMemo(
    () => new Set((file?.items ?? []).map((i) => i.id).filter(Boolean)),
    [file]
  );

  const itemCount = file?.items.length ?? 0;
  const allSelected = itemCount > 0 && selectedIndices.size === itemCount;
  const someSelected = selectedIndices.size > 0 && !allSelected;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(Array.from({ length: itemCount }, (_, i) => i)));
    }
  }, [allSelected, itemCount]);

  // ファイル切替時に選択を解除
  useEffect(() => {
    setSelectedIndices(new Set());
  }, [selectedScreenId]);

  const selectedScreenName = screens.find((s) => s.id === selectedScreenId)?.name;

  return (
    <div className="screen-items-view">
      <TableSubToolbar />

      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}

      <EditorHeader
        title={
          <span className="fw-semibold">
            <i className="bi bi-ui-checks-grid me-1" />
            画面項目定義
            <span className="badge bg-warning text-dark ms-2" style={{ fontSize: "0.7rem" }}>
              ドラフト (#318)
            </span>
          </span>
        }
        centerTools={
          <div className="d-flex align-items-center gap-2">
            <label className="form-label mb-0 small fw-semibold">画面</label>
            <select
              className="form-select form-select-sm screen-items-screen-select"
              value={selectedScreenId ?? ""}
              onChange={(e) => handleSwitchScreen(e.target.value)}
              disabled={screens.length === 0}
            >
              {screens.length === 0 && <option value="">画面がありません</option>}
              {screens.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        }
        undoRedo={{ onUndo: undo, onRedo: redo, canUndo, canRedo }}
        saveReset={{ isDirty, isSaving, onSave: handleSave, onReset: handleReset }}
      />

      <div className="screen-items-content">
        {!selectedScreenId && (
          <div className="screen-items-empty">
            <p>画面を選択してください。</p>
            <p className="text-muted small">画面が存在しない場合は、先に「画面一覧」で画面を作成してください。</p>
          </div>
        )}
        {selectedScreenId && file && (
          <div className="screen-items-table-wrap">
            <table className="screen-items-table">
              <colgroup>
                <col style={{ width: 24 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: "12em" }} />
                <col style={{ width: "12em" }} />
                <col style={{ width: "9em" }} />
                <col style={{ width: "4em" }} />
                <col style={{ width: "5em" }} />
                <col style={{ width: "5em" }} />
                <col style={{ width: "12em" }} />
                <col />
                <col style={{ width: 54 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-center">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={handleToggleAll}
                      aria-label="全選択"
                    />
                  </th>
                  <th>#</th>
                  <th>ID</th>
                  <th>ラベル</th>
                  <th>型</th>
                  <th className="text-center">必須</th>
                  <th>最小長</th>
                  <th>最大長</th>
                  <th>pattern</th>
                  <th>description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {file.items.length === 0 && (
                  <tr>
                    <td colSpan={11} className="screen-items-empty-row">
                      項目がありません。下のボタンから追加してください。
                    </td>
                  </tr>
                )}
                {file.items.map((item, i) => (
                  <tr key={item.id ? `id-${item.id}` : `idx-${i}`} className={selectedIndices.has(i) ? "screen-items-row-selected" : ""}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedIndices.has(i)}
                        onChange={() => handleToggleRow(i)}
                        aria-label={`行${i + 1}を選択`}
                      />
                    </td>
                    <td className="screen-items-no">{i + 1}</td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.id}
                        onChange={(e) => handleUpdateItem(i, { id: e.target.value })}
                        onFocus={(e) => idFocusVals.current.set(i, e.target.value)}
                        onBlur={(e) => handleIdBlur(i, e)}
                        placeholder="email"
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.label}
                        onChange={(e) => handleUpdateItem(i, { label: e.target.value })}
                        onBlur={commit}
                        placeholder="メールアドレス"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        list="screen-items-type-list"
                        className="form-control form-control-sm"
                        value={typeof item.type === "string"
                          ? item.type
                          : item.type.kind === "custom"
                            ? item.type.label ?? ""
                            : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            handleUpdateItem(i, { type: "string" });
                          } else if ((PRIMITIVE_TYPES as string[]).includes(v)) {
                            handleUpdateItem(i, { type: v as FieldType });
                          } else {
                            handleUpdateItem(i, { type: { kind: "custom", label: v } });
                          }
                        }}
                        onBlur={commit}
                        placeholder="string"
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={!!item.required}
                        onChange={(e) => handleUpdateItem(i, { required: e.target.checked || undefined })}
                        aria-label="必須"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={item.minLength ?? ""}
                        min={0}
                        onChange={(e) => handleUpdateItem(i, { minLength: e.target.value === "" ? undefined : Number(e.target.value) })}
                        onBlur={commit}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={item.maxLength ?? ""}
                        min={0}
                        onChange={(e) => handleUpdateItem(i, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })}
                        onBlur={commit}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.pattern ?? ""}
                        onChange={(e) => handleUpdateItem(i, { pattern: e.target.value || undefined })}
                        onBlur={commit}
                        placeholder="@conv.regex.email-simple"
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.description ?? ""}
                        onChange={(e) => handleUpdateItem(i, { description: e.target.value || undefined })}
                        onBlur={commit}
                      />
                    </td>
                    <td className="text-center screen-items-actions-cell">
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-secondary p-0"
                        onClick={() => handleResetItems([i])}
                        title="IDをリセット (自動採番形式に戻す)"
                        aria-label="IDをリセット"
                      >
                        <i className="bi bi-arrow-counterclockwise" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0"
                        onClick={() => handleRemoveItem(i)}
                        title="削除"
                        aria-label="削除"
                      >
                        <i className="bi bi-x" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="screen-items-toolbar">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary screen-items-add"
                onClick={handleAddItem}
              >
                <i className="bi bi-plus-lg me-1" /> 項目追加
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary screen-items-add"
                onClick={() => setCandidatesModalOpen(true)}
                title="現在選択中の画面デザインから input/select/textarea を抽出してチェックで追加"
              >
                <i className="bi bi-ui-checks me-1" /> 画面デザインから追加
              </button>
              {selectedIndices.size > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => handleResetItems([...selectedIndices].sort((a, b) => a - b))}
                  title="選択行の ID を自動採番形式にリセット"
                >
                  <i className="bi bi-arrow-counterclockwise me-1" />
                  選択行のIDをリセット ({selectedIndices.size} 件)
                </button>
              )}
            </div>
            <datalist id="screen-items-type-list">
              {PRIMITIVE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        )}
      </div>

      {pendingRename && (
        <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">ID リネームの確認</h5>
              </div>
              <div className="modal-body">
                <p>
                  <code className="me-1">{pendingRename.oldId}</code>
                  <span className="me-1">→</span>
                  <code>{pendingRename.newId}</code>
                </p>
                <p className="mb-1">
                  以下の処理フロー ({pendingRename.affectedGroups.length} 件、計 {pendingRename.totalRefs} 箇所) の参照が自動追従されます:
                </p>
                <ul className="mb-0">
                  {pendingRename.affectedGroups.map((ag) => (
                    <li key={ag.id}>{ag.name}（{ag.refCount} 箇所）</li>
                  ))}
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCancelRename}>
                  キャンセル
                </button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmRename}>
                  リネーム実行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingReset && (
        <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">IDリセットの確認</h5>
              </div>
              <div className="modal-body">
                <p>以下の ID を自動採番形式にリセットします:</p>
                <ul className="mb-2">
                  {pendingReset.resets.map(({ oldId, newId }) => (
                    <li key={oldId}>
                      <code className="me-1">{oldId}</code>
                      <span className="me-1">→</span>
                      <code>{newId}</code>
                    </li>
                  ))}
                </ul>
                <p className="mb-1">
                  以下の処理フロー ({pendingReset.affectedGroups.length} 件、計 {pendingReset.totalRefs} 箇所) の参照が自動追従されます:
                </p>
                <ul className="mb-0">
                  {pendingReset.affectedGroups.map((ag) => (
                    <li key={ag.id}>{ag.name}（{ag.refCount} 箇所）</li>
                  ))}
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCancelReset}>
                  キャンセル
                </button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmReset}>
                  リセット実行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ScreenItemCandidatesModal
        open={candidatesModalOpen}
        screenId={selectedScreenId ?? null}
        screenName={selectedScreenName}
        existingIds={existingIds}
        onClose={() => setCandidatesModalOpen(false)}
        onAddCandidates={handleAddCandidates}
      />
    </div>
  );
}
