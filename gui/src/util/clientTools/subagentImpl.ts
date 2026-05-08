import { ContextItem } from "core";
import { streamChat } from "../../api";
import { ClientToolImpl } from "./callClientTool";

function getStringArg(args: any, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value.trim();
}

function extractSseContent(text: string): string {
  let content = "";

  for (const event of text.split(/\n\n+/)) {
    for (const rawLine of event.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta;
        const message = json?.choices?.[0]?.message;
        if (typeof delta?.content === "string") {
          content += delta.content;
        } else if (typeof message?.content === "string") {
          content += message.content;
        }
      } catch {
        // Ignore malformed stream fragments.
      }
    }
  }

  return content.trim();
}

async function readResponseContent(response: Response): Promise<string> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    return extractSseContent(text);
  }

  if (contentType.includes("application/json")) {
    const json = JSON.parse(text);
    return (
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.delta?.content ??
      json?.content ??
      json?.response ??
      ""
    ).trim();
  }

  return text.trim();
}

export const subagentClientToolImpl: ClientToolImpl = async (
  args,
  _toolCallId,
  extras,
) => {
  const subagentName = getStringArg(args, "subagent_name");
  const prompt = getStringArg(args, "prompt");
  const description =
    typeof args?.description === "string" ? args.description.trim() : "";

  const subagents = extras.getState().config.config.modelsByRole.subagent ?? [];
  const subagent = subagents.find(
    (model) => model.title === subagentName || model.model === subagentName,
  );

  if (!subagent) {
    const available = subagents
      .map((model) => `${model.title} (${model.model})`)
      .join(", ");
    throw new Error(
      `Unknown subagent "${subagentName}". Available subagents: ${available || "none"}`,
    );
  }

  const systemMessage = [
    "You are a specialized subagent called by the main Prometheus agent.",
    "Focus only on the assigned task and return concise, actionable findings.",
    "Do not make broad assumptions. If evidence is insufficient, say so.",
    description ? `Task description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await streamChat({
    model: subagent.model,
    stream: true,
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = await readResponseContent(response);
  const result = [
    content || "(Subagent returned no content.)",
    "<task_metadata>",
    "status: completed",
    `subagent: ${subagent.title}`,
    `model: ${subagent.model}`,
    "</task_metadata>",
  ].join("\n");

  const output: ContextItem[] = [
    {
      name: `Subagent: ${subagent.title}`,
      description: "Subagent result",
      content: result,
    },
  ];

  return {
    output,
    respondImmediately: true,
  };
};

