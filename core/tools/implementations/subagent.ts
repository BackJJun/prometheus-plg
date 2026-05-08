import { ChatMessage, ContextItem } from "../..";
import { ToolImpl } from ".";
import { getStringArg } from "../parseArgs";

function getAvailableSubagents(extras: Parameters<ToolImpl>[1]) {
  return extras.config.modelsByRole.subagent ?? [];
}

export const subagentImpl: ToolImpl = async (args, extras) => {
  const subagentName = getStringArg(args, "subagent_name");
  const prompt = getStringArg(args, "prompt");

  const subagents = getAvailableSubagents(extras);
  const subagent = subagents.find((model) => model.title === subagentName);

  if (!subagent) {
    const available = subagents.map((model) => model.title).join(", ");
    throw new Error(
      `Unknown subagent "${subagentName}". Available subagents: ${available || "none"}`,
    );
  }

  const systemMessage =
    subagent.baseChatSystemMessage || subagent.baseAgentSystemMessage;
  const messages: ChatMessage[] = systemMessage
    ? [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: prompt,
        },
      ]
    : [
        {
          role: "user",
          content: prompt,
        },
      ];

  const response = await subagent.chat(messages, new AbortController().signal);
  const content =
    typeof response.content === "string"
      ? response.content
      : response.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");

  const result = [
    content,
    "<task_metadata>",
    "status: completed",
    "</task_metadata>",
  ]
    .filter(Boolean)
    .join("\n");

  const contextItem: ContextItem = {
    name: `Subagent: ${subagent.title}`,
    description: "Subagent result",
    content: result,
  };

  if (extras.toolCallId && extras.onPartialOutput) {
    extras.onPartialOutput({
      toolCallId: extras.toolCallId,
      contextItems: [contextItem],
    });
  }

  return [contextItem];
};
