/**
 * flowStore データ消失ガードの回帰テスト (2026-04-22)。
 *
 * 2 つの destructive path をカバー:
 * 1. loadProject: backend が null を返した時、空 project を backend に書き戻さないこと
 * 2. saveProject / persistProject: 空 project で非空 backend を上書きしないこと
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FlowStorageBackend } from "./flowStore";
import {
  loadProject,
  saveProject,
  persistProject,
  setFlowStorageBackend,
  setFlowDraftMode,
} from "./flowStore";
import type { FlowProject } from "../types/flow";

function mkEmptyProject(): FlowProject {
  return {
    version: 1,
    name: "テスト",
    screens: [],
    groups: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  } as FlowProject;
}

function mkNonEmptyProject(): FlowProject {
  return {
    version: 1,
    name: "実プロジェクト",
    screens: [
      { id: "s1", no: 1, name: "画面1", type: "standard", description: "", path: "", position: { x: 0, y: 0 }, size: { w: 200, h: 100 }, hasDesign: false, createdAt: "", updatedAt: "" } as any,
    ],
    groups: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  } as FlowProject;
}

describe("flowStore データ消失ガード (2026-04-22)", () => {
  beforeEach(() => {
    setFlowStorageBackend(null);
    setFlowDraftMode(false);
    localStorage.clear();
  });

  it("loadProject: backend が null を返しても空 project を backend に書き戻さない", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(null),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);

    const result = await loadProject();

    expect(result.screens).toHaveLength(0);
    // 重要: backend.saveProject が呼ばれていないこと
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("loadProject: backend null + localStorage 空でも backend には書き戻さない", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(null),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);
    // localStorage も空
    localStorage.removeItem("flow-project");

    const result = await loadProject();

    expect(result.name).toBe("新規プロジェクト");
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("loadProject: localStorage に有意データがあれば backend に移行する", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(null),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);
    localStorage.setItem("flow-project", JSON.stringify(mkNonEmptyProject()));

    const result = await loadProject();

    expect(result.screens).toHaveLength(1);
    // 有意データがあるので backend 移行は走る
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("saveProject: 空 project で非空 backend を上書きしない (data-loss guard)", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(mkNonEmptyProject()),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);

    await saveProject(mkEmptyProject());

    // backend にデータがあるので空上書きは拒否される
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("saveProject: 空 project でも backend が空ならそのまま保存する (初回)", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(null),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);

    await saveProject(mkEmptyProject());

    // backend にデータなし → 書き込み成功
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("saveProject: 非空 project はガードの影響を受けない (通常の保存)", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(mkNonEmptyProject()),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);

    await saveProject(mkNonEmptyProject());

    // 非空 → 無条件保存
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("persistProject: 同じ data-loss guard が適用される", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const backend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(mkNonEmptyProject()),
      saveProject: saveMock,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(backend);

    await persistProject(mkEmptyProject());

    expect(saveMock).not.toHaveBeenCalled();
  });
});
