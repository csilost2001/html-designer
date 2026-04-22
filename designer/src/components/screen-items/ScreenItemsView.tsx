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
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { generateUUID } from "../../utils/uuid";
import { ScreenItemCandidatesModal } from "./ScreenItemCandidatesModal";
import type { ExtractedCandidate } from "../../utils/screenItemExtractor";
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
        id: generateUUID(),
        name: "",
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
  }, [update]);

  /** 候補モーダルから受け取った ExtractedCandidate[] を ScreenItem[] として一括追加。
   *  candidate が data-item-id を持つなら ScreenItem.id として採用し、画面 DOM と
   *  1:1 でリンクする (#322)。持たない場合は UUID を新規発番。 */
  const handleAddCandidates = useCallback((cands: ExtractedCandidate[]) => {
    if (cands.length === 0) return;
    update((f) => {
      for (const c of cands) {
        f.items.push({
          id: c.dataItemId || generateUUID(),
          name: c.name || "",
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

  const existingNames = useMemo(
    () => new Set((file?.items ?? []).map((i) => i.name).filter(Boolean)),
    [file]
  );

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
                <col style={{ width: 40 }} />
                <col style={{ width: "12em" }} />
                <col style={{ width: "12em" }} />
                <col style={{ width: "9em" }} />
                <col style={{ width: "4em" }} />
                <col style={{ width: "5em" }} />
                <col style={{ width: "5em" }} />
                <col style={{ width: "12em" }} />
                <col />
                <col style={{ width: 30 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>名前 (name)</th>
                  <th>ラベル (label)</th>
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
                    <td colSpan={10} className="screen-items-empty-row">
                      項目がありません。下のボタンから追加してください。
                    </td>
                  </tr>
                )}
                {file.items.map((item, i) => (
                  <tr key={item.id}>
                    <td className="screen-items-no">{i + 1}</td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(i, { name: e.target.value })}
                        onBlur={commit}
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
                    <td className="text-center">
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
            </div>
            <datalist id="screen-items-type-list">
              {PRIMITIVE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        )}
      </div>

      <ScreenItemCandidatesModal
        open={candidatesModalOpen}
        screenId={selectedScreenId ?? null}
        screenName={selectedScreenName}
        existingNames={existingNames}
        onClose={() => setCandidatesModalOpen(false)}
        onAddCandidates={handleAddCandidates}
      />
    </div>
  );
}
