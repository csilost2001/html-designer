import { useState, useEffect } from "react";
import type { ScreenType } from "../../types/flow";
import { SCREEN_TYPE_LABELS } from "../../types/flow";

export interface ScreenFormData {
  name: string;
  type: ScreenType;
  path: string;
  description: string;
}

interface Props {
  open: boolean;
  initial?: Partial<ScreenFormData>;
  title: string;
  onSave: (data: ScreenFormData) => void;
  onClose: () => void;
}

const defaultData: ScreenFormData = {
  name: "",
  type: "other",
  path: "",
  description: "",
};

export function ScreenEditModal({ open, initial, title, onSave, onClose }: Props) {
  const [form, setForm] = useState<ScreenFormData>({ ...defaultData, ...initial });

  useEffect(() => {
    if (open) {
      setForm({ ...defaultData, ...initial });
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <div className="flow-modal-overlay" onClick={onClose}>
      <div className="flow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flow-modal-header">
          <h3>{title}</h3>
          <button className="flow-modal-close" onClick={onClose}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="flow-modal-body">
            <label htmlFor="screen-name">画面名 *</label>
            <input
              id="screen-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例: 顧客一覧"
              autoFocus
            />

            <label htmlFor="screen-type">画面種別</label>
            <select
              id="screen-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ScreenType }))}
            >
              {(Object.entries(SCREEN_TYPE_LABELS) as [ScreenType, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            <label htmlFor="screen-path">想定URL</label>
            <input
              id="screen-path"
              type="text"
              value={form.path}
              onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
              placeholder="例: /customers"
            />

            <label htmlFor="screen-desc">説明</label>
            <textarea
              id="screen-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="画面の用途や備考"
              rows={3}
            />
          </div>
          <div className="flow-modal-footer">
            <button type="button" className="flow-btn flow-btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="submit"
              className="flow-btn flow-btn-primary"
              disabled={!form.name.trim()}
            >
              <i className="bi bi-check-lg" /> 保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
