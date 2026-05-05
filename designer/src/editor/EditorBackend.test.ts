/**
 * EditorBackend interface の契約テスト。
 *
 * Mock Backend を使って load / save の round-trip を検証する。
 * GrapesJSBackend と PuckBackend の基本動作も確認する。
 *
 * #806 子 3
 */
import { describe, it, expect, vi } from "vitest";
import type { EditorBackend, EditorState, RenderOpts, Disposable } from "./EditorBackend";
import { GrapesJSBackend, isEmptyGjsPayload } from "./GrapesJSBackend";

// -----------------------------------------------------------------------
// Mock EditorBackend — interface 契約テスト用
// -----------------------------------------------------------------------

class MockBackend implements EditorBackend {
  async load(_screenId: string, draftRead: () => Promise<unknown>): Promise<EditorState> {
    const payload = await draftRead();
    return { payload };
  }

  async save(
    _screenId: string,
    state: EditorState,
    draftWrite: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    await draftWrite(state.payload);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderEditor(_container: HTMLElement, _state: EditorState, _opts: RenderOpts): Disposable {
    const disposed = { value: false };
    return {
      dispose() {
        disposed.value = true;
      },
    };
  }
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------

describe("EditorBackend interface — Mock Backend round-trip", () => {
  it("load で draftRead の戻り値を payload に持つ EditorState を返す", async () => {
    const backend = new MockBackend();
    const payload = { pages: [{ frames: [{ component: { type: "wrapper" } }] }] };
    const draftRead = vi.fn().mockResolvedValue(payload);

    const state = await backend.load("screen-001", draftRead);

    expect(draftRead).toHaveBeenCalledOnce();
    expect(state.payload).toEqual(payload);
  });

  it("save で draftWrite に state.payload が渡される", async () => {
    const backend = new MockBackend();
    const payload = { pages: [{ id: "main" }] };
    const state: EditorState = { payload };
    const draftWrite = vi.fn().mockResolvedValue(undefined);

    await backend.save("screen-001", state, draftWrite);

    expect(draftWrite).toHaveBeenCalledOnce();
    expect(draftWrite).toHaveBeenCalledWith(payload);
  });

  it("load → save の round-trip で payload が保持される", async () => {
    const backend = new MockBackend();
    const originalPayload = { data: "test-payload-value" };
    const stored: { value: unknown } = { value: null };

    const draftRead = vi.fn().mockResolvedValue(originalPayload);
    const draftWrite = vi.fn().mockImplementation(async (p: unknown) => {
      stored.value = p;
    });

    const state = await backend.load("screen-001", draftRead);
    await backend.save("screen-001", state, draftWrite);

    expect(stored.value).toEqual(originalPayload);
  });

  it("renderEditor が返す Disposable の dispose() が呼べる", () => {
    const backend = new MockBackend();
    const container = document.createElement("div");
    const state: EditorState = { payload: {} };
    const opts: RenderOpts = { cssFramework: "bootstrap", themeVariant: "standard" };

    const disposable = backend.renderEditor(container, state, opts);
    expect(() => disposable.dispose()).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// GrapesJSBackend の基本テスト
// -----------------------------------------------------------------------

describe("GrapesJSBackend", () => {
  it("load: draftRead が成功すれば payload に値が入る", async () => {
    const backend = new GrapesJSBackend();
    const expected = { pages: [{ id: "page-1" }] };
    const draftRead = vi.fn().mockResolvedValue(expected);

    const state = await backend.load("screen-001", draftRead);

    expect(state.payload).toEqual(expected);
  });

  it("load: draftRead が reject したら payload は null (GrapesJS が autoload で処理)", async () => {
    const backend = new GrapesJSBackend();
    const draftRead = vi.fn().mockRejectedValue(new Error("draft not found"));

    const state = await backend.load("screen-001", draftRead);

    expect(state.payload).toBeNull();
  });

  it("save: draftWrite に state.payload が渡される", async () => {
    const backend = new GrapesJSBackend();
    const payload = { pages: [{ id: "main" }], styles: [] };
    const state: EditorState = { payload };
    const draftWrite = vi.fn().mockResolvedValue(undefined);

    await backend.save("screen-001", state, draftWrite);

    expect(draftWrite).toHaveBeenCalledWith(payload);
  });

  it("renderEditor: Disposable を返す (GrapesJS cleanup は GjsEditor が担当)", () => {
    const backend = new GrapesJSBackend();
    const container = document.createElement("div");
    const state: EditorState = { payload: null };
    const opts: RenderOpts = { cssFramework: "bootstrap", themeVariant: "standard" };

    const disposable = backend.renderEditor(container, state, opts);
    expect(typeof disposable.dispose).toBe("function");
    expect(() => disposable.dispose()).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// isEmptyGjsPayload のテスト
// -----------------------------------------------------------------------

describe("isEmptyGjsPayload", () => {
  it("null は empty とみなす", () => {
    expect(isEmptyGjsPayload(null)).toBe(true);
  });

  it("undefined は empty とみなす", () => {
    expect(isEmptyGjsPayload(undefined)).toBe(true);
  });

  it("pages が空配列なら empty とみなす", () => {
    expect(isEmptyGjsPayload({ pages: [] })).toBe(true);
  });

  it("pages が 1 件以上あれば empty ではない", () => {
    expect(isEmptyGjsPayload({ pages: [{ id: "main" }] })).toBe(false);
  });
});
