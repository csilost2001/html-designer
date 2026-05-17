/**
 * DdlPreviewDrawer — rendering / interaction smoke (#1146)
 *
 * 小型 component (~55 lines) — 厚めに rendering + open/close + dialect select +
 * copy interaction の boundary を検証。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DdlPreviewDrawer } from "./DdlPreviewDrawer";

const SAMPLE_DDL = "CREATE TABLE foo (id INT);";

describe("DdlPreviewDrawer", () => {
  beforeEach(() => {
    // navigator.clipboard モック (jsdom 未実装)
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders header but not body when defaultOpen is false", () => {
    const { container } = render(
      <DdlPreviewDrawer
        ddl={SAMPLE_DDL}
        dialect="postgresql"
        onDialectChange={vi.fn()}
      />,
    );

    expect(screen.getByText("DDL プレビュー")).toBeInTheDocument();
    // body は閉じているので preview 要素は出ない
    expect(container.querySelector(".ddl-preview")).toBeNull();
    expect(container.querySelector(".ddl-drawer-controls")).toBeNull();
  });

  it("renders body and DDL content when defaultOpen is true", () => {
    const { container } = render(
      <DdlPreviewDrawer
        ddl={SAMPLE_DDL}
        dialect="postgresql"
        onDialectChange={vi.fn()}
        defaultOpen
      />,
    );

    const preview = container.querySelector(".ddl-preview");
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toBe(SAMPLE_DDL);
    expect(container.querySelector(".ddl-drawer-controls")).not.toBeNull();
  });

  it("toggles open/close when header is clicked", () => {
    const { container } = render(
      <DdlPreviewDrawer
        ddl={SAMPLE_DDL}
        dialect="postgresql"
        onDialectChange={vi.fn()}
      />,
    );

    const header = container.querySelector(".ddl-drawer-header");
    expect(header).not.toBeNull();
    fireEvent.click(header!);
    expect(container.querySelector(".ddl-preview")).not.toBeNull();

    fireEvent.click(header!);
    expect(container.querySelector(".ddl-preview")).toBeNull();
  });

  it("calls onDialectChange when select value changes", () => {
    const onDialectChange = vi.fn();
    const { container } = render(
      <DdlPreviewDrawer
        ddl={SAMPLE_DDL}
        dialect="postgresql"
        onDialectChange={onDialectChange}
        defaultOpen
      />,
    );

    const select = container.querySelector<HTMLSelectElement>(".ddl-dialect-select");
    expect(select).not.toBeNull();
    fireEvent.change(select!, { target: { value: "mysql" } });

    expect(onDialectChange).toHaveBeenCalledWith("mysql");
  });

  it("copies DDL to clipboard when copy button is clicked", () => {
    const writeTextSpy = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    const { container } = render(
      <DdlPreviewDrawer
        ddl={SAMPLE_DDL}
        dialect="postgresql"
        onDialectChange={vi.fn()}
        defaultOpen
      />,
    );

    const copyBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".ddl-drawer-controls .tbl-btn"),
    ).find((b) => b.textContent?.includes("コピー"));
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn!);

    expect(writeTextSpy).toHaveBeenCalledWith(SAMPLE_DDL);
  });
});
