import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FlowProject } from "../types/flow";
import type {
  DisplayName,
  TableId,
  Timestamp,
} from "../types/v3";
import type { FlowStorageBackend } from "./flowStore";
import { setFlowDraftMode, setFlowStorageBackend } from "./flowStore";
import type { ViewDefinitionStorageBackend as StoreViewDefinitionStorageBackend } from "./viewDefinitionStore";
import {
  createViewDefinition,
  deleteViewDefinition,
  setViewDefinitionStorageBackend,
} from "./viewDefinitionStore";

const TS = "2026-04-29T00:00:00.000Z" as Timestamp;

function emptyProject(): FlowProject {
  return {
    version: 1,
    name: "test",
    screens: [],
    groups: [],
    edges: [],
    updatedAt: TS,
  };
}

describe("viewDefinitionStore", () => {
  beforeEach(() => {
    setViewDefinitionStorageBackend(null);
    setFlowStorageBackend(null);
    setFlowDraftMode(false);
    localStorage.clear();
  });

  it("deleteViewDefinition does not save project.json", async () => {
    const saveProject = vi.fn().mockResolvedValue(undefined);
    const flowBackend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(emptyProject()),
      saveProject,
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    const viewBackend: StoreViewDefinitionStorageBackend = {
      loadViewDefinition: vi.fn().mockResolvedValue(null),
      saveViewDefinition: vi.fn().mockResolvedValue(undefined),
      deleteViewDefinition: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(flowBackend);
    setViewDefinitionStorageBackend(viewBackend);

    await deleteViewDefinition("a");

    expect(viewBackend.deleteViewDefinition).toHaveBeenCalledWith("a");
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("createViewDefinition initializes required fields", async () => {
    const project = emptyProject();
    const flowBackend: FlowStorageBackend = {
      loadProject: vi.fn().mockResolvedValue(project),
      saveProject: vi.fn().mockResolvedValue(undefined),
      deleteScreenData: vi.fn().mockResolvedValue(undefined),
    };
    setFlowStorageBackend(flowBackend);

    const vd = await createViewDefinition(
      "受注一覧" as DisplayName,
      "list",
      "table-orders" as TableId,
    );

    expect(vd.id).toBeTruthy();
    expect(vd.kind).toBe("list");
    expect(vd.sourceTableId).toBe("table-orders");
    expect(vd.columns).toEqual([]);
  });
});
