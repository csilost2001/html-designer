import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditLevel } from "./useEditLevel";

describe("useEditLevel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'implementation' as the default level", () => {
    const { result } = renderHook(() => useEditLevel("flow-1"));
    expect(result.current.editLevel).toBe("implementation");
  });

  it("updates to 'rough' when setEditLevel is called", () => {
    const { result } = renderHook(() => useEditLevel("flow-1"));
    act(() => result.current.setEditLevel("rough"));
    expect(result.current.editLevel).toBe("rough");
  });

  it("updates to 'detail' when setEditLevel is called", () => {
    const { result } = renderHook(() => useEditLevel("flow-1"));
    act(() => result.current.setEditLevel("detail"));
    expect(result.current.editLevel).toBe("detail");
  });

  it("persists the level to localStorage with the correct key", () => {
    const { result } = renderHook(() => useEditLevel("flow-42"));
    act(() => result.current.setEditLevel("rough"));
    const stored = localStorage.getItem("processFlow:editLevel:flow-42");
    expect(stored).toBe('"rough"');
  });

  it("restores the level from localStorage on remount", () => {
    localStorage.setItem("processFlow:editLevel:flow-99", '"detail"');
    const { result } = renderHook(() => useEditLevel("flow-99"));
    expect(result.current.editLevel).toBe("detail");
  });

  it("falls back to 'implementation' if localStorage has an invalid value", () => {
    localStorage.setItem("processFlow:editLevel:flow-bad", '"invalid"');
    const { result } = renderHook(() => useEditLevel("flow-bad"));
    expect(result.current.editLevel).toBe("implementation");
  });

  it("works without a flowId (in-memory only, does not persist under user-visible key)", () => {
    const { result } = renderHook(() => useEditLevel());
    act(() => result.current.setEditLevel("detail"));
    expect(result.current.editLevel).toBe("detail");
    // User-visible keys (processFlow:editLevel:*) should not exist
    const userKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("processFlow:editLevel:") && !k.includes("__noop__")
    );
    expect(userKeys).toHaveLength(0);
  });

  it("isolates levels between different flow IDs", () => {
    const { result: resultA } = renderHook(() => useEditLevel("flow-A"));
    const { result: resultB } = renderHook(() => useEditLevel("flow-B"));
    act(() => resultA.current.setEditLevel("rough"));
    act(() => resultB.current.setEditLevel("detail"));
    expect(resultA.current.editLevel).toBe("rough");
    expect(resultB.current.editLevel).toBe("detail");
  });
});
