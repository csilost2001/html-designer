/**
 * TechStackView — rendering smoke (#1146)
 *
 * loading state / 初期 category 表示 / category 切替を検証。
 * 保存系の deep interaction は e2e (project/*) に委譲。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

const loadRawProjectMock = vi.fn();
const saveTechStackMock = vi.fn();

vi.mock("../../store/flowStore", () => ({
  loadRawProject: () => loadRawProjectMock(),
  saveTechStack: (...args: unknown[]) => saveTechStackMock(...args),
}));

vi.mock("../../utils/techStackConstraints", () => ({
  validateTechStackConstraints: vi.fn(() => []),
}));

const { TechStackView } = await import("./TechStackView");

describe("TechStackView", () => {
  beforeEach(() => {
    loadRawProjectMock.mockReset();
    saveTechStackMock.mockReset();
    loadRawProjectMock.mockResolvedValue({ techStack: {} });
  });

  it("shows loading indicator before load completes", () => {
    // unresolved promise — loading stays true
    loadRawProjectMock.mockReturnValue(new Promise(() => { /* never */ }));
    const { container } = render(<TechStackView />);
    expect(container.textContent).toContain("読み込み中");
  });

  it("renders 6 category buttons after load", async () => {
    const { container } = render(<TechStackView />);
    await waitFor(() => {
      expect(container.textContent).not.toContain("読み込み中");
    });
    // 左ペインの category ボタン
    const labels = ["デザイナー", "バックエンド", "データベース", "フロントエンド", "認証", "デプロイ"];
    for (const l of labels) {
      expect(container.textContent).toContain(l);
    }
  });

  it("switches active panel when category button is clicked", async () => {
    const { container } = render(<TechStackView />);
    await waitFor(() => {
      expect(container.textContent).not.toContain("読み込み中");
    });

    // 初期 = designer panel が active。frontend に切替
    const frontendBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("フロントエンド"));
    expect(frontendBtn).toBeTruthy();
    fireEvent.click(frontendBtn!);

    // FrontendPanel に固有のテキストが現れる
    await waitFor(() => {
      expect(container.textContent).toContain("ライブラリ");
    });
  });

  it("save button is enabled after successful load with no violations", async () => {
    const { container } = render(<TechStackView />);
    await waitFor(() => {
      expect(container.textContent).not.toContain("読み込み中");
    });
    const saveBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("保存") && !b.textContent?.includes("中..."));
    expect(saveBtn).toBeTruthy();
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
