/**
 * RegisterComponentDialog — rendering / interaction smoke (#1146)
 *
 * E2E + unit 共に 0 の領域。
 * - 初期 rendering (label / primitive select / empty prop hint)
 * - prop row 追加/削除
 * - 必須 validation (label 空 / property 名規則)
 * - save 成功 → onSaved / onClose 呼出し
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

const addCustomPuckComponentMock = vi.fn();

vi.mock("../../store/puckComponentsStore", () => ({
  addCustomPuckComponent: (...args: unknown[]) => addCustomPuckComponentMock(...args),
}));

vi.mock("../../puck/buildConfig", () => ({
  BUILTIN_PRIMITIVE_NAMES: ["Text", "Button", "Container"],
}));

vi.mock("../../utils/uuid", () => ({
  generateUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

const { RegisterComponentDialog } = await import("./RegisterComponentDialog");

describe("RegisterComponentDialog", () => {
  beforeEach(() => {
    addCustomPuckComponentMock.mockReset();
    addCustomPuckComponentMock.mockResolvedValue(undefined);
  });

  it("renders required form fields", () => {
    const { container } = render(
      <RegisterComponentDialog onClose={vi.fn()} />,
    );

    expect(container.textContent).toContain("新規カスタムコンポーネント");
    expect(container.textContent).toContain("コンポーネント名");
    expect(container.textContent).toContain("ベース種類");
    expect(container.textContent).toContain("プロパティ");
    expect(container.textContent).toContain("プロパティを追加するには");
  });

  it("populates primitive select with registered primitives", () => {
    const { container } = render(
      <RegisterComponentDialog onClose={vi.fn()} />,
    );

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain("Text");
    expect(options).toContain("Button");
    expect(options).toContain("Container");
  });

  it("shows error when label is empty on save", async () => {
    const { container } = render(
      <RegisterComponentDialog onClose={vi.fn()} />,
    );

    const saveBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === "保存");
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain("コンポーネント名は必須");
    });
    expect(addCustomPuckComponentMock).not.toHaveBeenCalled();
  });

  it("adds a prop row when 追加 button is clicked", () => {
    const { container } = render(
      <RegisterComponentDialog onClose={vi.fn()} />,
    );

    const addPropBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === "+ 追加");
    expect(addPropBtn).toBeTruthy();
    fireEvent.click(addPropBtn!);

    // empty hint が消えて name input が現れる
    expect(container.textContent).not.toContain("プロパティを追加するには");
    const inputs = container.querySelectorAll("input[type='text']");
    // label + 最低 1 つの prop name input
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("calls addCustomPuckComponent / onSaved / onClose on successful save", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const { container } = render(
      <RegisterComponentDialog onClose={onClose} onSaved={onSaved} />,
    );

    // label 入力
    const labelInput = container.querySelector<HTMLInputElement>("input[type='text']");
    expect(labelInput).not.toBeNull();
    fireEvent.change(labelInput!, { target: { value: "検索バー" } });

    const saveBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === "保存");
    fireEvent.click(saveBtn!);

    await waitFor(() => {
      expect(addCustomPuckComponentMock).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <RegisterComponentDialog onClose={onClose} />,
    );
    // 最外殻の overlay div を click
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
