import type { ChatHistoryItem } from "core";

import { services } from "../services/index.js";
import { serviceContainer } from "../services/ServiceContainer.js";
import type { ToolPermissionServiceState } from "../services/ToolPermissionService.js";
import { ModelServiceState, SERVICE_NAMES } from "../services/types.js";
import { streamChatResponse } from "../stream/streamChatResponse.js";
import { escapeEvents } from "../util/cli.js";
import { logger } from "../util/logger.js";

export interface SubAgentExecutionOptions {
  agent: ModelServiceState;
  prompt: string;
  parentSessionId: string;
  abortController: AbortController;
  onOutputUpdate?: (output: string) => void;
}

export interface SubAgentResult {
  success: boolean;
  response: string;
  error?: string;
}

async function buildAgentSystemMessage(
  agent: ModelServiceState,
  serviceBag: typeof services,
): Promise<string> {
  const baseMessage = serviceBag.systemMessage
    ? await serviceBag.systemMessage.getSystemMessage(
        serviceBag.toolPermissions.getState().currentMode,
      )
    : "";

  const agentPrompt = agent.model?.chatOptions?.baseSystemMessage || "";
  return agentPrompt ? `${baseMessage}\n\n${agentPrompt}` : baseMessage;
}

export async function executeSubAgent(
  options: SubAgentExecutionOptions,
): Promise<SubAgentResult> {
  const { agent: subAgent, prompt, abortController, onOutputUpdate } = options;
  const mainAgentPermissionsState =
    await serviceContainer.get<ToolPermissionServiceState>(
      SERVICE_NAMES.TOOL_PERMISSIONS,
    );

  try {
    logger.debug("Starting subagent execution", {
      agent: subAgent.model?.name,
    });

    const { model, llmApi } = subAgent;
    if (!model || !llmApi) {
      throw new Error("Model or LLM API not available");
    }

    serviceContainer.set<ToolPermissionServiceState>(
      SERVICE_NAMES.TOOL_PERMISSIONS,
      {
        ...mainAgentPermissionsState,
        permissions: {
          policies: [{ tool: "*", permission: "allow" }],
        },
      },
    );

    const systemMessage = await buildAgentSystemMessage(subAgent, services);
    const originalGetSystemMessage = services.systemMessage?.getSystemMessage;
    const chatHistorySvc = services.chatHistory;
    const originalIsReady =
      chatHistorySvc && typeof chatHistorySvc.isReady === "function"
        ? chatHistorySvc.isReady
        : undefined;

    if (services.systemMessage) {
      services.systemMessage.getSystemMessage = async () => systemMessage;
    }

    if (chatHistorySvc && originalIsReady) {
      chatHistorySvc.isReady = () => false;
    }

    const chatHistory = [
      {
        message: {
          role: "user",
          content: prompt,
        },
        contextItems: [],
      },
    ] as ChatHistoryItem[];

    const escapeHandler = () => {
      abortController.abort();
      chatHistory.push({
        message: {
          role: "user",
          content: "Subagent execution was cancelled by the user.",
        },
        contextItems: [],
      });
    };

    escapeEvents.on("user-escape", escapeHandler);

    try {
      let accumulatedOutput = "";

      const response = await streamChatResponse(
        chatHistory,
        model,
        llmApi,
        abortController,
        {
          onContent: (content: string) => {
            accumulatedOutput += content;
            onOutputUpdate?.(accumulatedOutput);
          },
          onToolResult: (result: string) => {
            accumulatedOutput += `\n\n${result}`;
            onOutputUpdate?.(accumulatedOutput);
          },
        },
      );

      logger.debug("Subagent execution completed", {
        agent: model?.name,
        responseLength: response?.length ?? 0,
      });

      return {
        success: true,
        response: response || "",
      };
    } finally {
      escapeEvents.removeListener("user-escape", escapeHandler);

      if (services.systemMessage && originalGetSystemMessage) {
        services.systemMessage.getSystemMessage = originalGetSystemMessage;
      }

      if (chatHistorySvc && originalIsReady) {
        chatHistorySvc.isReady = originalIsReady;
      }

      serviceContainer.set<ToolPermissionServiceState>(
        SERVICE_NAMES.TOOL_PERMISSIONS,
        mainAgentPermissionsState,
      );
    }
  } catch (error: any) {
    logger.error("Subagent execution failed", {
      agent: subAgent.model?.name,
      error: error.message,
    });

    return {
      success: false,
      response: "",
      error: error.message,
    };
  }
}
