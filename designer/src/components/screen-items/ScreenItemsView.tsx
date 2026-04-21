/**
 * 画面項目定義ビュー (#318 プロトタイプ)。
 *
 * MVP: シングルトンタブで、中で画面を選択して項目を編集する。
 * 将来 (#318 v1.0 合意後): /screen/items/:screenId の per-screen タブに分割。
 */
import { useCallback, useEffect, useState } from "react";
import { TableSubToolbar } from "../table/TableSubToolbar";
import {
  loadScreenItems,
  saveScreenItems,
} from "../../store/screenItemsStore";
import { loadProject } from "../../store/flowStore";
import type { ScreenItem, ScreenItemsFile } from "../../types/screenItem";
import type { FieldType } from "../../types/action";
import { generateUUID } from "../../utils/uuid";
import "../../styles/screen-items.css";

const PRIMITIVE_TYPES: Array<"string" | "number" | "boolean" | "date"> =
  ["string", "number", "boolean", "date"];

type ScreenMeta = { id: string; name: string };

export function ScreenItemsView() {
  const [screens, setScreens] = useState<ScreenMeta[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [file, setFile] = useState<ScreenItemsFile | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 画面一覧をロード
  useEffect(() => {
    loadProject().then((p) => {
      const metas = p.screens.map((s) => ({ id: s.id, name: s.name }));
      setScreens(metas);
      if (metas.length > 0 && !selectedScreenId) {
        setSelectedScreenId(metas[0].id);
      }
    }).catch(console.error);
  }, []);

  // 選択画面が変わったら項目ファイルをロード
  useEffect(() => {
    if (!selectedScreenId) { setFile(null); return; }
    loadScreenItems(selectedScreenId).then((f) => {
      setFile(f);
      setIsDirty(false);
    }).catch(console.error);
  }, [selectedScreenId]);

  const update = useCallback((mut: (f: ScreenItemsFile) => void) => {
    setFile((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mut(next);
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleAddItem = () => {
    update((f) => {
      f.items.push({
        id: generateUUID(),
        name: "",
        label: "",
        type: "string",
      });
    });
  };

  const handleUpdateItem = (idx: number, patch: Partial<ScreenItem>) => {
    update((f) => {
      Object.assign(f.items[idx], patch);
    });
  };

  const handleRemoveItem = (idx: number) => {
    update((f) => {
      f.items.splice(idx, 1);
    });
  };

  const handleSave = async () => {
    if (!file) return;
    setIsSaving(true);
    try {
      await saveScreenItems(file);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="screen-items-view">
      <TableSubToolbar />

      <div className="screen-items-header">
        <div className="screen-items-title">
          <i className="bi bi-ui-checks-grid" /> 画面項目定義
          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: "0.7rem" }}>
            ドラフト (#318)
          </span>
        </div>
        <div className="screen-items-screen-selector">
          <label className="form-label mb-0 small fw-semibold">画面</label>
          <select
            className="form-select form-select-sm"
            value={selectedScreenId ?? ""}
            onChange={(e) => setSelectedScreenId(e.target.value || null)}
            disabled={screens.length === 0}
          >
            {screens.length === 0 && <option value="">画面がありません</option>}
            {screens.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="screen-items-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            <i className="bi bi-save me-1" />
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      <div className="screen-items-content">
        {!selectedScreenId && (
          <div className="screen-items-empty">
            <p>画面を選択してください。</p>
            <p className="text-muted small">
              画面が 1 つも存在しない場合は、先に「画面一覧」から画面を作成してください。
            </p>
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
                    <td colSpan={10} className="screen-items-empty-row">項目がありません。下の「項目追加」から追加してください。</td>
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
                        placeholder="email"
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.label}
                        onChange={(e) => handleUpdateItem(i, { label: e.target.value })}
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
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={item.maxLength ?? ""}
                        min={0}
                        onChange={(e) => handleUpdateItem(i, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.pattern ?? ""}
                        onChange={(e) => handleUpdateItem(i, { pattern: e.target.value || undefined })}
                        placeholder="@conv.regex.email-simple"
                      />
                    </td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={item.description ?? ""}
                        onChange={(e) => handleUpdateItem(i, { description: e.target.value || undefined })}
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
            <button
              type="button"
              className="btn btn-sm btn-outline-primary screen-items-add"
              onClick={handleAddItem}
            >
              <i className="bi bi-plus-lg me-1" /> 項目追加
            </button>
            <datalist id="screen-items-type-list">
              {PRIMITIVE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        )}
      </div>
    </div>
  );
}
