import { describe, expect, it, vi } from "vitest";

import { ToolExtras } from "../..";
import { subagentImpl } from "./subagent";

describe("subagentImpl", () => {
  it("runs the named subagent model and returns metadata", async () => {
    const chat = vi.fn().mockResolvedValue({
      role: "assistant",
      content: "subagent result",
    });
    const extras = {
      config: {
        modelsByRole: {
          subagent: [
            {
              title: "reviewer",
              baseChatSystemMessage: "You are a reviewer.",
              chat,
            },
          ],
        },
      },
    } as unknown as ToolExtras;

    const result = await subagentImpl(
      {
        subagent_name: "reviewer",
        prompt: "Review this change.",
      },
      extras,
    );

    expect(chat).toHaveBeenCalledWith(
      [
        { role: "system", content: "You are a reviewer." },
        { role: "user", content: "Review this change." },
      ],
      expect.any(AbortSignal),
    );
    expect(result[0].content).toContain("subagent result");
    expect(result[0].content).toContain("status: completed");
  });

  it("throws a useful error when the subagent is unknown", async () => {
    const extras = {
      config: {
        modelsByRole: {
          subagent: [{ title: "reviewer" }],
        },
      },
    } as unknown as ToolExtras;

    await expect(
      subagentImpl(
        {
          subagent_name: "tester",
          prompt: "Test this change.",
        },
        extras,
      ),
    ).rejects.toThrow(
      'Unknown subagent "tester". Available subagents: reviewer',
    );
  });
});
