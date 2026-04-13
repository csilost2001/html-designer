import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ScreenNode } from "../../types/flow";
import { SCREEN_TYPE_LABELS, SCREEN_TYPE_ICONS } from "../../types/flow";

type SortKey = "name" | "type" | "path" | "hasDesign" | "updatedAt";
type SortDir = "asc" | "desc";

interface Props {
  screens: ScreenNode[];
  onEdit: (screenId: string) => void;
  onDelete: (screenId: string) => void;
  onAdd: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ScreenTableView({ screens, onEdit, onDelete, onAdd }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return screens
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.path || "").toLowerCase().includes(q) ||
          (SCREEN_TYPE_LABELS[s.type] || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "name":
            cmp = a.name.localeCompare(b.name, "ja");
            break;
          case "type":
            cmp = (SCREEN_TYPE_LABELS[a.type] || "").localeCompare(SCREEN_TYPE_LABELS[b.type] || "", "ja");
            break;
          case "path":
            cmp = (a.path || "").localeCompare(b.path || "");
            break;
          case "hasDesign":
            cmp = (a.hasDesign ? 1 : 0) - (b.hasDesign ? 1 : 0);
            break;
          case "updatedAt":
            cmp = a.updatedAt.localeCompare(b.updatedAt);
            break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [screens, query, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <i className="bi bi-arrow-down-up table-sort-icon inactive" />;
    return <i className={`bi bi-arrow-${sortDir === "asc" ? "up" : "down"} table-sort-icon`} />;
  };

  return (
    <div className="screen-table-view">
      <div className="screen-table-toolbar">
        <div className="screen-table-search">
          <i className="bi bi-search" />
          <input
            type="text"
            placeholder="画面名・URL・種別で絞り込み..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="clear-btn" onClick={() => setQuery("")}>
              <i className="bi bi-x-circle-fill" />
            </button>
          )}
        </div>
        <span className="screen-table-count">{filtered.length} 件</span>
        <button className="flow-btn flow-btn-primary" onClick={onAdd}>
          <i className="bi bi-plus-lg" /> 画面を追加
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="screen-table-empty">
          <i className="bi bi-inbox" />
          <p>{query ? "該当する画面がありません" : "画面がまだありません"}</p>
        </div>
      ) : (
        <div className="screen-table-wrap">
          <table className="screen-table">
            <thead>
              <tr>
                <th className="screen-table-th sortable" onClick={() => handleSort("name")}>
                  画面名 <SortIcon column="name" />
                </th>
                <th className="screen-table-th sortable" onClick={() => handleSort("type")}>
                  種別 <SortIcon column="type" />
                </th>
                <th className="screen-table-th sortable" onClick={() => handleSort("path")}>
                  URL <SortIcon column="path" />
                </th>
                <th className="screen-table-th sortable" onClick={() => handleSort("hasDesign")}>
                  デザイン <SortIcon column="hasDesign" />
                </th>
                <th className="screen-table-th sortable" onClick={() => handleSort("updatedAt")}>
                  更新日時 <SortIcon column="updatedAt" />
                </th>
                <th className="screen-table-th">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((screen) => (
                <tr key={screen.id} className="screen-table-row">
                  <td className="screen-table-td">
                    <div className="screen-table-name">
                      <i className={`bi ${SCREEN_TYPE_ICONS[screen.type] ?? "bi-circle"} screen-table-icon`} />
                      <span>{screen.name}</span>
                    </div>
                  </td>
                  <td className="screen-table-td">
                    <span className="screen-type-badge">
                      {SCREEN_TYPE_LABELS[screen.type] ?? screen.type}
                    </span>
                  </td>
                  <td className="screen-table-td screen-table-path">
                    {screen.path || <span className="screen-table-empty-cell">—</span>}
                  </td>
                  <td className="screen-table-td">
                    <span className={`screen-design-badge${screen.hasDesign ? "" : " empty"}`}>
                      <i className={`bi ${screen.hasDesign ? "bi-brush-fill" : "bi-brush"}`} />
                      {screen.hasDesign ? "デザイン済み" : "未デザイン"}
                    </span>
                  </td>
                  <td className="screen-table-td screen-table-date">
                    {formatDate(screen.updatedAt)}
                  </td>
                  <td className="screen-table-td">
                    <div className="screen-table-actions">
                      <button
                        className="screen-table-btn"
                        onClick={() => navigate(`/design/${screen.id}`)}
                        title="デザインを編集"
                      >
                        <i className="bi bi-palette" />
                      </button>
                      <button
                        className="screen-table-btn"
                        onClick={() => onEdit(screen.id)}
                        title="画面情報を編集"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        className="screen-table-btn danger"
                        onClick={() => onDelete(screen.id)}
                        title="削除"
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
