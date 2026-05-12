import { describe, expect, it, vi } from "vitest";
import { CodexBrowserClient, type McpBridgeLike } from "./codexClient";
import { generateScreenDesignWithCodex } from "./screenDesignGeneration";

function clientWithGeneratedText(text: string) {
  let notificationHandler: ((data: unknown) => void) | null = null;
  const request = vi.fn(async (method: string) => {
    if (method === "codex.thread.start") return { thread: { id: "thread-1" } };
    if (method === "codex.turn.start") {
      queueMicrotask(() => {
        notificationHandler?.({
          method: "item/completed",
          params: { threadId: "thread-1", item: { type: "agentMessage", text } },
        });
        notificationHandler?.({
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null } },
        });
      });
      return { turn: { id: "turn-1", status: "inProgress" } };
    }
    throw new Error(`unexpected method: ${method}`);
  });
  const bridge: McpBridgeLike = {
    request,
    onBroadcast: vi.fn((event, handler) => {
      if (event === "codex.notification") notificationHandler = handler;
      return () => { notificationHandler = null; };
    }),
  };
  return { client: new CodexBrowserClient(bridge), request };
}

describe("generateScreenDesignWithCodex", () => {
  it("generates GrapesJS projectData with the GrapesJS output schema", async () => {
    const payload = { pages: [{ component: "<main>顧客検索</main>" }], styles: [] };
    const { client, request } = clientWithGeneratedText(JSON.stringify(payload));

    const result = await generateScreenDesignWithCodex({
      client,
      editorKind: "grapesjs",
      cssFramework: "bootstrap",
      screenName: "顧客検索",
      current: { pages: [] },
      requirement: "検索条件と結果一覧を作る",
    });

    expect(result).toEqual(payload);
    expect(request).toHaveBeenCalledWith("codex.turn.start", expect.objectContaining({
      threadId: "thread-1",
      outputSchema: expect.objectContaining({ required: ["pages"] }),
    }));
  });

  it("generates Puck Data with the Puck output schema", async () => {
    const payload = { root: { props: {} }, content: [{ type: "Heading", props: { id: "title", text: "顧客検索" } }] };
    const { client, request } = clientWithGeneratedText(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);

    const result = await generateScreenDesignWithCodex({
      client,
      editorKind: "puck",
      cssFramework: "tailwind",
      current: { root: { props: {} }, content: [] },
      requirement: "検索画面を作る",
    });

    expect(result).toEqual(payload);
    expect(request).toHaveBeenCalledWith("codex.turn.start", expect.objectContaining({
      outputSchema: expect.objectContaining({ required: ["root", "content"] }),
    }));
  });
});
