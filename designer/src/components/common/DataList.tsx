import { useMemo, type ReactNode } from "react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { ListSelection } from "../../hooks/useListSelection";
import type { ListClipboard } from "../../hooks/useListClipboard";
import type { ListSort } from "../../hooks/useListSort";
import "../../styles/dataList.css";

export interface DataListColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T, index: number) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  className?: string;
  /** ヘッダクリックでソート可能にする */
  sortable?: boolean;
  /** ソート時の比較キー。sortable=true の場合に必須 */
  sortAccessor?: (item: T) => string | number;
}

export type DataListLayout = "list" | "grid";

interface Props<T> {
  items: T[];
  columns: DataListColumn<T>[];
  getId: (item: T) => string;
  selection?: ListSelection<T>;
  clipboard?: ListClipboard<T>;
  sort?: ListSort<T>;
  onActivate?: (item: T, index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** "list" = 表 (既定) / "grid" = カード */
  layout?: DataListLayout;
  /** grid レイアウト時のカードレンダラ (columns は使われない) */
  renderCard?: (item: T, index: number) => ReactNode;
  showNumColumn?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
  variant?: "light" | "dark";
}

export function DataList<T>({
  items, columns, getId, selection, clipboard, sort,
  onActivate, onReorder,
  layout = "list",
  renderCard,
  showNumColumn = true,
  emptyMessage,
  className,
  variant = "light",
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const tanstackColumns = useMemo<ColumnDef<T>[]>(() => {
    const helper = createColumnHelper<T>();
    return columns.map((col) =>
      helper.display({
        id: col.key,
        header: () => col.header,
        cell: (ctx) => col.render(ctx.row.original, ctx.row.index),
        meta: { align: col.align, className: col.className, width: col.width, sortable: col.sortable },
      }),
    );
  }, [columns]);

  // TanStack Table のフックは React 19 の incompatible-library ルールに引っかかるが、
  // 推奨どおりのトップレベル呼び出しであり、戻り値は同期レンダーでのみ使用する。
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getId(row),
  });

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || !onReorder) return;
    if (active.id === over.id) return;
    const fromIndex = items.findIndex((it) => getId(it) === active.id);
    const toIndex = items.findIndex((it) => getId(it) === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(fromIndex, toIndex);
  };

  const showHandle = !!onReorder && layout === "list";
  const ids = items.map(getId);
  const rootClass = [
    "data-list",
    `data-list-${layout}`,
    `data-list-${variant}`,
    items.length === 0 ? "data-list-empty" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  if (items.length === 0) {
    return <div className={rootClass}>{emptyMessage ?? <span>データがありません</span>}</div>;
  }

  const strategy = layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy;

  return (
    <div className={rootClass} data-testid="data-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={strategy}>
          {layout === "list" ? (
            <table className="data-list-table">
              <thead>
                <tr>
                  {showHandle && <th className="data-list-th-handle" aria-label="並び替えハンドル" />}
                  {showNumColumn && <th className="data-list-th-num">No</th>}
                  {table.getHeaderGroups()[0].headers.map((header) => {
                    const col = columns.find((c) => c.key === header.column.id)!;
                    const dir = sort?.getSortDirection(col.key) ?? null;
                    const rank = sort?.getSortRank(col.key) ?? null;
                    const isSortable = !!col.sortable && !!sort;
                    return (
                      <th
                        key={col.key}
                        className={[col.className, isSortable ? "data-list-th-sortable" : "", dir ? "data-list-th-sorted" : ""].filter(Boolean).join(" ")}
                        style={{ width: col.width, textAlign: col.align }}
                        onClick={isSortable ? (e) => sort!.toggleSort(col.key, { addKey: e.shiftKey }) : undefined}
                      >
                        <span className="data-list-th-content">
                          {rank !== null && <span className="data-list-sort-rank">{toCircled(rank)}</span>}
                          {col.header as ReactNode}
                          {dir && <i className={`bi ${dir === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill"} data-list-sort-icon`} />}
                        </span>
                      </th>
                    );
                  })}
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
                    clipboard={clipboard}
                    onActivate={onActivate}
                    showHandle={showHandle}
                    showNumColumn={showNumColumn}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="data-list-grid">
              {items.map((item, index) => (
                <DataListCard
                  key={getId(item)}
                  item={item}
                  index={index}
                  getId={getId}
                  selection={selection}
                  clipboard={clipboard}
                  onActivate={onActivate}
                  renderCard={renderCard}
                  draggable={!!onReorder}
                />
              ))}
            </div>
          )}
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
  clipboard?: ListClipboard<T>;
  onActivate?: (item: T, index: number) => void;
  showHandle: boolean;
  showNumColumn: boolean;
}

function DataListRow<T>({
  item, index, getId, columns, selection, clipboard, onActivate, showHandle, showNumColumn,
}: RowProps<T>) {
  const id = getId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const cut = clipboard?.isItemCut(id) ?? false;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : cut ? 0.5 : undefined,
  };

  const selected = selection?.isSelected(id) ?? false;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`data-list-row${selected ? " selected" : ""}${cut ? " cut" : ""}`}
      onClick={(e) => selection?.handleRowClick(id, e)}
      onDoubleClick={() => onActivate?.(item, index)}
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

interface CardProps<T> {
  item: T;
  index: number;
  getId: (item: T) => string;
  selection?: ListSelection<T>;
  clipboard?: ListClipboard<T>;
  onActivate?: (item: T, index: number) => void;
  renderCard?: (item: T, index: number) => ReactNode;
  draggable: boolean;
}

function DataListCard<T>({
  item, index, getId, selection, clipboard, onActivate, renderCard, draggable,
}: CardProps<T>) {
  const id = getId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const cut = clipboard?.isItemCut(id) ?? false;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : cut ? 0.5 : undefined,
  };
  const selected = selection?.isSelected(id) ?? false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`data-list-card${selected ? " selected" : ""}${cut ? " cut" : ""}`}
      onClick={(e) => selection?.handleRowClick(id, e)}
      onDoubleClick={() => onActivate?.(item, index)}
      data-testid="data-list-card"
      data-row-id={id}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      {renderCard ? renderCard(item, index) : <span>{id}</span>}
    </div>
  );
}

function toCircled(n: number): string {
  // ① ② ③ ...
  if (n < 1 || n > 20) return String(n);
  const base = 0x2460; // ①
  return String.fromCharCode(base + n - 1);
}
