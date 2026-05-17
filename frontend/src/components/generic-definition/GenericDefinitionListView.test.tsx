/**
 * GenericDefinitionListView — rendering smoke (#1146)
 *
 * E2E 0 spec の領域。kind param 解決 / 不正 kind fallback / header 表示を検証。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GenericDefinitionSummary } from "../../types/v3";

let mockItems: GenericDefinitionSummary[] = [];

vi.mock("../../store/genericDefinitionStore", () => ({
  listGenericDefinitions: vi.fn(() => Promise.resolve(mockItems)),
  loadGenericDefinition: vi.fn(),
  saveGenericDefinition: vi.fn(),
  deleteGenericDefinition: vi.fn(),
  createGenericDefinitionTemplate: vi.fn(),
}));

vi.mock("../../schemas/genericDefinitionValidator", () => ({
  validateGenericDefinition: vi.fn(() => []),
}));

vi.mock("../../mcp/mcpBridge", () => ({
  mcpBridge: {
    onBroadcast: vi.fn(() => () => {}),
  },
}));

vi.mock("../../store/tabStore", () => ({
  makeTabId: (a: string, b: string) => `${a}:${b}`,
  openTab: vi.fn(),
}));

vi.mock("../../hooks/useWorkspacePath", () => ({
  useWorkspacePath: () => ({ wsPath: (p: string) => p }),
}));

vi.mock("../../hooks/useListSelection", () => ({
  useListSelection: () => ({
    selectedItems: [],
    selectedIds: new Set<string>(),
    isSelected: vi.fn(() => false),
    handleRowClick: vi.fn(),
    clearSelection: vi.fn(),
    setSelectedIds: vi.fn(),
  }),
}));

vi.mock("../../hooks/useListClipboard", () => ({
  useListClipboard: () => ({
    clipboard: { mode: null, items: [] },
    copy: vi.fn(), cut: vi.fn(), paste: vi.fn(),
    canPaste: () => ({ ok: false, reason: "" }),
  }),
}));

vi.mock("../../hooks/useListFilter", () => ({
  useListFilter: <T,>(items: T[]) => ({
    filtered: items, isActive: false,
    totalCount: items.length, visibleCount: items.length,
    applyFilter: vi.fn(), clearFilter: vi.fn(),
  }),
}));

vi.mock("../../hooks/useListSort", () => ({
  useListSort: <T,>(items: T[]) => ({
    sorted: items, sortKeys: [], isActive: false,
    toggleSort: vi.fn(),
    getSortDirection: vi.fn(() => null), getSortRank: vi.fn(() => null),
  }),
}));

vi.mock("../../hooks/useListKeyboard", () => ({ useListKeyboard: () => undefined }));

vi.mock("../../hooks/usePersistentState", () => ({
  usePersistentState: <T,>(_k: string, initial: T) => [initial, vi.fn()],
}));

vi.mock("../common/DataList", () => ({
  DataList: ({ items }: { items: unknown[] }) => (
    <div data-testid="data-list">{items.length} items</div>
  ),
}));

vi.mock("../common/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("../common/SortBar", () => ({ SortBar: () => null }));
vi.mock("../common/ViewModeToggle", () => ({ ViewModeToggle: () => null }));
vi.mock("../common/ValidationBadge", () => ({ ValidationBadge: () => null }));

const { GenericDefinitionListView } = await import("./GenericDefinitionListView");

function renderForKind(kind: string) {
  return render(
    <MemoryRouter initialEntries={[`/generic-definition/${kind}`]}>
      <Routes>
        <Route path="/generic-definition/:kind" element={<GenericDefinitionListView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GenericDefinitionListView", () => {
  beforeEach(() => {
    mockItems = [];
  });

  it("shows error message for invalid kind", () => {
    const { container } = renderForKind("not-a-real-kind");
    expect(container.textContent).toContain("不正な kind");
  });

  it("renders header with label and kind for valid kind", async () => {
    const { container } = renderForKind("data-contract");
    await waitFor(() => {
      expect(container.textContent).toContain("一覧");
      expect(container.textContent).toContain("data-contract");
    });
  });

  it("renders 新規作成 button for valid kind", async () => {
    const { container } = renderForKind("domain-type");
    await waitFor(() => {
      const buttons = Array.from(container.querySelectorAll("button"));
      const addBtn = buttons.find((b) => b.textContent?.includes("新規作成"));
      expect(addBtn).toBeTruthy();
    });
  });

  it("renders DataList with item count for valid kind", async () => {
    mockItems = [
      { name: "DTO1", purpose: "p1", targets: [], responsibilities: ["r1"], fields: [] } as unknown as GenericDefinitionSummary,
      { name: "DTO2", purpose: "p2", targets: [], responsibilities: ["r2"], fields: [] } as unknown as GenericDefinitionSummary,
    ];
    const { findByTestId } = renderForKind("data-contract");
    const list = await findByTestId("data-list");
    expect(list.textContent).toContain("2 items");
  });
});
