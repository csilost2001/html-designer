/**
 * GenericDefinitionCatalogView — rendering smoke (#1146)
 *
 * E2E カバー 0 領域なのでやや厚めに rendering + 件数 fetch + 失敗時 fallback を検証。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const listGenericDefinitionsMock = vi.fn();

vi.mock("../../store/genericDefinitionStore", () => ({
  listGenericDefinitions: (kind: string) => listGenericDefinitionsMock(kind),
}));

vi.mock("../../hooks/useWorkspacePath", () => ({
  useWorkspacePath: () => ({ wsPath: (p: string) => p }),
}));

const { GenericDefinitionCatalogView } = await import("./GenericDefinitionCatalogView");
const { GENERIC_DEFINITION_KINDS, GENERIC_DEFINITION_KIND_LABELS } = await import("../../types/v3");

function renderCatalog() {
  return render(
    <MemoryRouter>
      <GenericDefinitionCatalogView />
    </MemoryRouter>,
  );
}

describe("GenericDefinitionCatalogView", () => {
  beforeEach(() => {
    listGenericDefinitionsMock.mockReset();
    listGenericDefinitionsMock.mockResolvedValue([]);
  });

  it("renders header and description", () => {
    const { container } = renderCatalog();
    expect(container.textContent).toContain("汎用定義カタログ");
    expect(container.textContent).toContain("Generic Definition Catalog");
  });

  it("renders one card per registered kind", () => {
    const { container } = renderCatalog();
    for (const kind of GENERIC_DEFINITION_KINDS) {
      const label = GENERIC_DEFINITION_KIND_LABELS[kind];
      expect(container.textContent).toContain(label);
    }
  });

  it("renders count badge with fetched item length", async () => {
    listGenericDefinitionsMock.mockImplementation((kind: string) => {
      if (kind === "data-contract") return Promise.resolve([{ id: "1" }, { id: "2" }, { id: "3" }]);
      return Promise.resolve([]);
    });

    const { container } = renderCatalog();
    await waitFor(() => {
      expect(container.textContent).toContain("3 件");
    });
  });

  it("falls back to 0 count when fetch fails", async () => {
    listGenericDefinitionsMock.mockRejectedValue(new Error("network"));

    const { container } = renderCatalog();
    // 全 kind が 0 件として描画される
    await waitFor(() => {
      const badges = container.querySelectorAll("span");
      const zeroBadges = Array.from(badges).filter((b) => b.textContent === "0 件");
      expect(zeroBadges.length).toBe(GENERIC_DEFINITION_KINDS.length);
    });
  });
});
