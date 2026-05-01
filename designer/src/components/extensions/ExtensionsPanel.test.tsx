import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { mcpBridge } from "../../mcp/mcpBridge";

vi.mock("../../mcp/mcpBridge", () => ({
  mcpBridge: {
    getExtensions: vi.fn(),
    request: vi.fn(),
    onExtensionsChanged: vi.fn(() => () => undefined),
    onBroadcast: vi.fn(() => () => undefined),
  },
}));

const bridgeMock = vi.mocked(mcpBridge);

describe("ExtensionsPanel", () => {
  beforeEach(() => {
    bridgeMock.getExtensions.mockReset();
    bridgeMock.request.mockReset();
    bridgeMock.onExtensionsChanged.mockClear();
    bridgeMock.getExtensions.mockResolvedValue({
      responseTypes: {
        namespace: "",
        responseTypes: {
          ApiError: { description: "API error", schema: { type: "object", properties: {} } },
        },
      },
    });
    bridgeMock.request.mockResolvedValue({ success: true });
  });

  it("renders five extension tabs", async () => {
    render(<MemoryRouter><ExtensionsPanel /></MemoryRouter>);
    expect(await screen.findByRole("tab", { name: /ステップ型/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /フィールド型/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /トリガー/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /DB 操作/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /レスポンス型/ })).toBeInTheDocument();
  });

  it("saves response type changes through wsBridge", async () => {
    render(<MemoryRouter initialEntries={["/extensions?tab=responseTypes"]}><ExtensionsPanel /></MemoryRouter>);

    expect(await screen.findByDisplayValue("ApiError")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    fireEvent.change(screen.getAllByPlaceholderText("ApiError")[1], { target: { value: "Created" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(bridgeMock.request).toHaveBeenCalledWith(
        "saveExtensionPackage",
        expect.objectContaining({ type: "responseTypes" }),
      );
    });
  });
});
