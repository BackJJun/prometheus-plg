import { describe, expect, it } from "vitest";

import { createRuntime } from "./orchestrator";

describe("RuntimeOrchestrator", () => {
  it("tracks permission-gated tool execution in runtime state", async () => {
    const runtime = createRuntime({
      initialState: {
        sessionId: "session-1",
        title: "Runtime Test",
        workspaceDirectory: "/workspace",
        history: [],
        toolStates: {},
        isProcessing: false,
      },
      adapter: {
        onPermissionRequested: (request) => {
          setTimeout(() => {
            runtime.respondToPermission(request.requestId, true);
          }, 0);
        },
      },
      preprocessToolCalls: async (toolCalls) => ({
        preprocessedCalls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        })),
        errorResults: [],
      }),
      evaluatePermission: async () => ({
        permission: "ask" as const,
      }),
      executeToolCall: async () => ({
        content: "ok",
        output: [
          {
            content: "ok",
            name: "Tool Result",
            description: "Tool execution result",
          },
        ],
      }),
      getToolCallId: (toolCall) => toolCall.id,
      getToolCallName: (toolCall) => toolCall.name,
      getProcessedArgs: (toolCall) => toolCall.arguments,
    });

    await runtime.processToolCalls(
      [
        {
          id: "tool-1",
          type: "function",
          function: {
            name: "write_file",
            arguments: JSON.stringify({
              filepath: "test.txt",
            }),
          },
        },
      ],
      "Applying change",
      [],
      "turn-1",
    );

    const snapshot = runtime.getStateSnapshot();

    expect(snapshot.pendingPermission).toBeUndefined();
    expect(snapshot.isProcessing).toBe(false);
    expect(snapshot.toolStates["tool-1"]?.status).toBe("completed");
    expect(snapshot.toolStates["tool-1"]?.processedArgs).toEqual({
      filepath: "test.txt",
    });
  });

  it("marks denied permission requests as rejected and clears pending permission", async () => {
    const events: string[] = [];
    const runtime = createRuntime({
      initialState: {
        sessionId: "session-2",
        title: "Runtime Reject Test",
        workspaceDirectory: "/workspace",
        history: [],
        toolStates: {},
        isProcessing: false,
      },
      adapter: {
        onPermissionRequested: (request) => {
          setTimeout(() => {
            runtime.respondToPermission(request.requestId, false);
          }, 0);
        },
      },
      preprocessToolCalls: async (toolCalls) => ({
        preprocessedCalls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        })),
        errorResults: [],
      }),
      evaluatePermission: async () => ({
        permission: "ask" as const,
      }),
      executeToolCall: async () => {
        throw new Error("should not execute");
      },
      getToolCallId: (toolCall) => toolCall.id,
      getToolCallName: (toolCall) => toolCall.name,
      getProcessedArgs: (toolCall) => toolCall.arguments,
    });

    runtime.events.on((event) => {
      events.push(event.type);
    });

    const outcome = await runtime.processToolCalls(
      [
        {
          id: "tool-2",
          type: "function",
          function: {
            name: "write_file",
            arguments: JSON.stringify({
              filepath: "blocked.txt",
            }),
          },
        },
      ],
      "Need approval",
      [],
      "turn-2",
    );

    const snapshot = runtime.getStateSnapshot();

    expect(outcome.hasRejection).toBe(true);
    expect(snapshot.pendingPermission).toBeUndefined();
    expect(snapshot.isProcessing).toBe(false);
    expect(snapshot.toolStates["tool-2"]?.status).toBe("rejected");
    expect(snapshot.toolStates["tool-2"]?.errorMessage).toBe(
      "Permission denied by user",
    );
    expect(events).toContain("permission_requested");
  });
});
