import { beforeEach, describe, expect, it, vi } from "vitest";

import { services } from "../services/index.js";
import { serviceContainer } from "../services/ServiceContainer.js";
import { executeSubAgent } from "../subagent/executor.js";
import { getAgentNames, getSubagent } from "../subagent/get-agents.js";

import { subagentTool } from "./subagent.js";

vi.mock("../subagent/get-agents.js");
vi.mock("../subagent/executor.js");
vi.mock("../services/ServiceContainer.js", () => ({
  serviceContainer: {
    get: vi.fn(),
  },
}));
vi.mock("../services/index.js", () => ({
  services: {
    chatHistory: {
      getSessionId: vi.fn().mockReturnValue("parent-session-id"),
      addToolResult: vi.fn(),
    },
  },
}));

describe("subagentTool", () => {
  const modelServiceState = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serviceContainer.get).mockResolvedValue(modelServiceState);
  });

  it("preprocess throws when agent is not found", async () => {
    vi.mocked(getAgentNames).mockReturnValue(["code-agent"]);

    const tool = await subagentTool();

    await expect(
      tool.preprocess!({
        description: "Test task",
        prompt: "Do something",
        subagent_name: "unknown-agent",
      }),
    ).rejects.toThrow("Unknown agent type: unknown-agent");

    expect(vi.mocked(getSubagent)).toHaveBeenCalledWith(
      modelServiceState,
      "unknown-agent",
    );
  });

  it("preprocess includes agent model name when agent exists", async () => {
    vi.mocked(getAgentNames).mockReturnValue(["code-agent"]);
    vi.mocked(getSubagent).mockReturnValue({
      model: { name: "test-model" },
    } as any);

    const tool = await subagentTool();
    const result = await tool.preprocess!({
      description: "Handle specialized task",
      prompt: "Do it",
      subagent_name: "code-agent",
    });

    expect(result.preview).toEqual([
      {
        type: "text",
        content: "Spawning test-model to: Handle specialized task",
      },
    ]);
  });

  it("run executes subagent and streams partial output", async () => {
    vi.mocked(getAgentNames).mockReturnValue(["code-agent"]);
    vi.mocked(getSubagent).mockReturnValue({
      model: { name: "test-model" },
    } as any);
    vi.mocked(executeSubAgent).mockResolvedValue({
      success: true,
      response: "subagent-output",
    });

    const tool = await subagentTool();
    const result = await tool.run(
      {
        prompt: "Subagent prompt",
        subagent_name: "code-agent",
      },
      { toolCallId: "tool-call-id" },
    );

    const [options] = vi.mocked(executeSubAgent).mock.calls[0];
    expect(options.prompt).toBe("Subagent prompt");
    expect(options.parentSessionId).toBe("parent-session-id");

    options.onOutputUpdate?.("partial-output");
    expect(vi.mocked(services.chatHistory.addToolResult)).toHaveBeenCalledWith(
      "tool-call-id",
      "partial-output",
      "calling",
    );

    expect(result).toBe(
      "subagent-output\n<task_metadata>\nstatus: completed\n</task_metadata>",
    );
  });
});
