import { memo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TableColumn } from "../../types/table";

export interface ErTableNodeData {
  tableId: string;
  name: string;
  logicalName: string;
  category?: string;
  columns: TableColumn[];
  [key: string]: unknown;
}

function ErTableNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as ErTableNodeData;
  const [expanded, setExpanded] = useState(false);

  const pkColumns = d.columns.filter((c) => c.primaryKey);
  const fkColumns = d.columns.filter((c) => c.foreignKey && !c.primaryKey);
  const otherColumns = d.columns.filter((c) => !c.primaryKey && !c.foreignKey);
  const hiddenCount = otherColumns.length;

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const dataTypeShort = (col: TableColumn) => {
    const dt = col.dataType;
    if (dt === "VARCHAR" || dt === "CHAR") return `${dt}(${col.length ?? ""})`;
    if (dt === "DECIMAL") return `DEC(${col.length ?? ""},${col.scale ?? ""})`;
    return dt;
  };

  return (
    <>
      <Handle type="target" position={Position.Top} id="top" className="er-handle" />
      <Handle type="target" position={Position.Left} id="left" className="er-handle" />

      <div className={`er-table-node${selected ? " selected" : ""}`}>
        {/* Header */}
        <div className="er-node-header">
          <span className="er-node-name">{d.name}</span>
          {d.category && <span className="er-node-category">{d.category}</span>}
        </div>
        <div className="er-node-logical">{d.logicalName}</div>

        {/* PK columns */}
        <div className="er-node-columns">
          {pkColumns.map((col) => (
            <div key={col.id} className="er-col pk">
              <i className="bi bi-key-fill er-col-icon pk-icon" />
              <span className="er-col-name">{col.name}</span>
              <span className="er-col-type">{dataTypeShort(col)}</span>
            </div>
          ))}

          {/* FK columns */}
          {fkColumns.map((col) => (
            <div key={col.id} className="er-col fk">
              <i className="bi bi-link-45deg er-col-icon fk-icon" />
              <span className="er-col-name">{col.name}</span>
              <span className="er-col-type">{dataTypeShort(col)}</span>
            </div>
          ))}

          {/* Other columns (expandable) */}
          {expanded && otherColumns.map((col) => (
            <div key={col.id} className="er-col">
              <span className="er-col-icon-space" />
              <span className="er-col-name">{col.name}</span>
              <span className="er-col-type">{dataTypeShort(col)}</span>
            </div>
          ))}

          {/* Expand/collapse toggle */}
          {hiddenCount > 0 && (
            <div className="er-col-toggle" onClick={toggleExpand}>
              {expanded ? (
                <><i className="bi bi-chevron-up" /> 折りたたむ</>
              ) : (
                <><i className="bi bi-chevron-down" /> 他 {hiddenCount} カラム</>
              )}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="er-handle" />
      <Handle type="source" position={Position.Right} id="right" className="er-handle" />
    </>
  );
}

export default memo(ErTableNodeComponent);
