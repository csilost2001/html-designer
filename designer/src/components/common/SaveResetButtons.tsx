import "../../styles/saveReset.css";

interface Props {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SaveResetButtons({ isDirty, isSaving, onSave, onReset }: Props) {
  return (
    <div className="save-reset-buttons">
      <button
        className="srb-btn srb-btn-reset"
        onClick={onReset}
        disabled={!isDirty || isSaving}
        title="最後に保存した状態に戻す"
      >
        <i className="bi bi-arrow-counterclockwise" /> リセット
      </button>
      <button
        className={`srb-btn srb-btn-save${isDirty ? " dirty" : ""}`}
        onClick={onSave}
        disabled={!isDirty || isSaving}
        title="保存 (Ctrl+S)"
      >
        {isSaving
          ? <><i className="bi bi-hourglass-split" /> 保存中...</>
          : <><i className="bi bi-floppy" /> 保存</>
        }
      </button>
    </div>
  );
}
