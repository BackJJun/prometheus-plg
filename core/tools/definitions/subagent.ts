import { GetTool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

function truncateDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > 240
    ? `${normalized.slice(0, 237).trim()}...`
    : normalized;
}

function describeSubagents(params: Parameters<GetTool>[0]): string {
  const subagents = params.config?.modelsByRole.subagent ?? [];
  if (subagents.length === 0) {
    return "No subagents are currently configured.";
  }

  return subagents
    .map((model) => {
      const modelDescription = (model as { description?: string }).description;
      const description =
        modelDescription ||
        model.baseChatSystemMessage ||
        model.baseAgentSystemMessage ||
        "No description provided.";
      return `  - ${model.title}: ${truncateDescription(description)}`;
    })
    .join("\n");
}

export const subagentTool: GetTool = async (params) => ({
  type: "function",
  displayTitle: "Subagent",
  wouldLikeTo: "run subagent {{{ subagent_name }}}",
  isCurrently: "running subagent {{{ subagent_name }}}",
  hasAlready: "ran subagent {{{ subagent_name }}}",
  readonly: false,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.Subagent,
    description: `Launch a specialized subagent to handle a specific task.

Subagents are configured as models with roles: ["subagent"] and a chatOptions.baseSystemMessage.

Available subagents:
${describeSubagents(params)}`,
    parameters: {
      type: "object",
      required: ["description", "prompt", "subagent_name"],
      properties: {
        description: {
          type: "string",
          description: "A short description of the task",
        },
        prompt: {
          type: "string",
          description: "The task for the subagent to perform",
        },
        subagent_name: {
          type: "string",
          description: "The configured subagent model title to use",
        },
      },
    },
  },
});
