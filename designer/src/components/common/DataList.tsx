import type { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ListSelection } from "../../hooks/useListSelection";
import "../../styles/dataList.css";

export interface DataListColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T, index: number) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

interface Props<T> {
  items: T[];
  columns: DataListColumn<T>[];
  getId: (item: T) => string;
  selection?: ListSelection<T>;
  /** Double-click / Enter 相当のアクティベート */
  onActivate?: (item: T, index: number) => void;
  /** 行 D&D で並び替え。未指定時はハンドル非表示 & D&D 無効 */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** No 列 (最左) を表示 */
  showNumColumn?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
}

export function DataList<T>({
  items, columns, getId, selection,
  onActivate, onReorder,
  showNumColumn = true,
  emptyMessage,
  className,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || !onReorder) return;
    if (active.id === over.id) return;
    const fromIndex = items.findIndex((it) => getId(it) === active.id);
    const toIndex = items.findIndex((it) => getId(it) === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(fromIndex, toIndex);
  };

  const showHandle = !!onReorder;
  const ids = items.map(getId);

  if (items.length === 0) {
    return (
      <div className={`data-list data-list-empty${className ? " " + className : ""}`}>
        {emptyMessage ?? <span>データがありません</span>}
      </div>
    );
  }

  return (
    <div className={`data-list${className ? " " + className : ""}`} data-testid="data-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <table className="data-list-table">
            <thead>
              <tr>
                {showHandle && <th className="data-list-th-handle" aria-label="並び替えハンドル" />}
                {showNumColumn && <th className="data-list-th-num">No</th>}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={col.className}
                    style={{ width: col.width, textAlign: col.align }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <DataListRow
                  key={getId(item)}
                  item={item}
                  index={index}
                  getId={getId}
                  columns={columns}
                  selection={selection}
                  onActivate={onActivate}
                  showHandle={showHandle}
                  showNumColumn={showNumColumn}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface RowProps<T> {
  item: T;
  index: number;
  getId: (item: T) => string;
  columns: DataListColumn<T>[];
  selection?: ListSelection<T>;
  onActivate?: (item: T, index: number) => void;
  showHandle: boolean;
  showNumColumn: boolean;
}

function DataListRow<T>({
  item, index, getId, columns, selection, onActivate, showHandle, showNumColumn,
}: RowProps<T>) {
  const id = getId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const selected = selection?.isSelected(id) ?? false;

  const handleClick = (e: React.MouseEvent) => {
    selection?.handleRowClick(id, e);
  };

  const handleDoubleClick = () => {
    onActivate?.(item, index);
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`data-list-row${selected ? " selected" : ""}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      data-testid="data-list-row"
      data-row-id={id}
    >
      {showHandle && (
        <td className="data-list-td-handle" {...attributes} {...listeners}>
          <i className="bi bi-grip-vertical" />
        </td>
      )}
      {showNumColumn && <td className="data-list-td-num">{index + 1}</td>}
      {columns.map((col) => (
        <td
          key={col.key}
          className={col.className}
          style={{ textAlign: col.align }}
        >
          {col.render(item, index)}
        </td>
      ))}
    </tr>
  );
}
