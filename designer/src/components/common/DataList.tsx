import { useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
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
  /** 削除マーク等で ghost 表示する項目判定 (clipboard.isItemCut と OR される) */
  isItemGhost?: (id: string) => boolean;
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
  isItemGhost,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

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

  const handleDragStart = (e: { active: { id: string | number } }) => {
    setActiveDragId(String(e.active.id));
    setOverId(null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    setOverId(e.over ? String(e.over.id) : null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragId(null);
    setOverId(null);
    if (!over || !onReorder) return;
    if (active.id === over.id) return;
    const fromIndex = items.findIndex((it) => getId(it) === active.id);
    const toIndex = items.findIndex((it) => getId(it) === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(fromIndex, toIndex);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setOverId(null);
  };

  const showHandle = !!onReorder && layout === "list";
  const ids = items.map(getId);
  const rootClass = [
    "data-list",
    `data-list-layout-${layout}`,
    `data-list-${variant}`,
    items.length === 0 ? "data-list-empty" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  /** 空領域クリックで選択解除。ルート要素を直接クリックした場合のみ発火 */
  const handleRootClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!selection) return;
    if (e.target === e.currentTarget) {
      selection.clearSelection();
    }
  };

  if (items.length === 0) {
    return <div className={rootClass} onClick={handleRootClick}>{emptyMessage ?? <span>データがありません</span>}</div>;
  }

  const strategy = layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy;

  /** ドロップ位置インジケータ: 対象行が active より下なら bottom-line、上なら top-line */
  const dropIndicatorFor = (rowId: string): "top" | "bottom" | null => {
    if (!activeDragId || !overId) return null;
    if (rowId !== overId) return null;
    if (activeDragId === overId) return null;
    const activeIdx = items.findIndex((it) => getId(it) === activeDragId);
    const overIdx = items.findIndex((it) => getId(it) === overId);
    if (activeIdx < 0 || overIdx < 0) return null;
    return activeIdx < overIdx ? "bottom" : "top";
  };

  const isRowGhost = (id: string): boolean => {
    if (isItemGhost?.(id)) return true;
    if (clipboard?.isItemCut(id)) return true;
    return false;
  };

  return (
    <div className={rootClass} data-testid="data-list" onClick={handleRootClick}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
                {items.map((item, index) => {
                  const id = getId(item);
                  return (
                    <DataListRow
                      key={id}
                      item={item}
                      index={index}
                      getId={getId}
                      columns={columns}
                      selection={selection}
                      ghost={isRowGhost(id)}
                      onActivate={onActivate}
                      showHandle={showHandle}
                      showNumColumn={showNumColumn}
                      dropIndicator={dropIndicatorFor(id)}
                    />
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="data-list-grid">
              {items.map((item, index) => {
                const id = getId(item);
                return (
                  <DataListCard
                    key={id}
                    item={item}
                    index={index}
                    getId={getId}
                    selection={selection}
                    ghost={isRowGhost(id)}
                    onActivate={onActivate}
                    renderCard={renderCard}
                    draggable={!!onReorder}
                    dropIndicator={dropIndicatorFor(id)}
                  />
                );
              })}
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
  ghost: boolean;
  onActivate?: (item: T, index: number) => void;
  showHandle: boolean;
  showNumColumn: boolean;
  dropIndicator: "top" | "bottom" | null;
}

function DataListRow<T>({
  item, index, getId, columns, selection, ghost, onActivate, showHandle, showNumColumn, dropIndicator,
}: RowProps<T>) {
  const id = getId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : ghost ? 0.5 : undefined,
  };

  const selected = selection?.isSelected(id) ?? false;
  const indicatorClass = dropIndicator === "top"
    ? " drop-indicator-top"
    : dropIndicator === "bottom"
      ? " drop-indicator-bottom"
      : "";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`data-list-row${selected ? " selected" : ""}${ghost ? " ghost" : ""}${indicatorClass}`}
      onClick={(e) => selection?.handleRowClick(id, e)}
      onDoubleClick={() => onActivate?.(item, index)}
      data-testid="data-list-row"
      data-row-id={id}
    >
      {showHandle && (
        <td className="data-list-td-handle" {...attributes} {...listeners} aria-label="並び替え">
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
  ghost: boolean;
  onActivate?: (item: T, index: number) => void;
  renderCard?: (item: T, index: number) => ReactNode;
  draggable: boolean;
  dropIndicator: "top" | "bottom" | null;
}

function DataListCard<T>({
  item, index, getId, selection, ghost, onActivate, renderCard, draggable, dropIndicator,
}: CardProps<T>) {
  const id = getId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : ghost ? 0.5 : undefined,
  };
  const selected = selection?.isSelected(id) ?? false;
  const indicatorClass = dropIndicator === "top"
    ? " drop-indicator-left"
    : dropIndicator === "bottom"
      ? " drop-indicator-right"
      : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`data-list-card${selected ? " selected" : ""}${ghost ? " ghost" : ""}${indicatorClass}`}
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
