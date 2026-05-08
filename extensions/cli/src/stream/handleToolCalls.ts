import type {
  ChatHistoryItem,
  ToolCall as CoreToolCall,
  ToolStatus,
} from "core/index.js";
import { createRuntime } from "core/runtime/index.js";
import type {
  RuntimePermissionRequest,
  RuntimeSessionState,
  RuntimeToolState,
  RuntimeToolStateEvent,
} from "core/runtime/types.js";
import { createHistoryItem } from "core/util/messageConversion.js";

import { checkToolPermission } from "src/permissions/permissionChecker.js";

import {
  SERVICE_NAMES,
  serviceContainer,
  services,
} from "../services/index.js";
import { getCurrentSession, updateSessionRuntimeState } from "../session.js";
import type { ToolPermissionServiceState } from "../services/ToolPermissionService.js";
import {
  convertToolToChatCompletionTool,
  executeToolCall,
  getAllAvailableTools,
  Tool,
  ToolCall,
  validateToolCallArgsPresent,
} from "../tools/index.js";
import { PreprocessedToolCall } from "../tools/types.js";
import { logger } from "../util/logger.js";

import { requestUserPermission } from "./streamChatResponse.helpers.js";
import { StreamCallbacks } from "./streamChatResponse.types.js";

function toChatStatus(
  status:
    | "generated"
    | "pending_permission"
    | "running"
    | "completed"
    | "errored"
    | "rejected",
): ToolStatus {
  if (status === "running") {
    return "calling";
  }
  if (status === "completed") {
    return "done";
  }
  if (status === "errored") {
    return "errored";
  }
  if (status === "rejected") {
    return "canceled";
  }
  return "generated";
}

export async function handleToolCalls(
  toolCalls: ToolCall[],
  chatHistory: ChatHistoryItem[],
  content: string,
  callbacks: StreamCallbacks | undefined,
  isHeadless: boolean,
): Promise<boolean> {
  const chatHistorySvc = services.chatHistory;
  const useService =
    typeof chatHistorySvc?.isReady === "function" && chatHistorySvc.isReady();
  const session = getCurrentSession();

  if (toolCalls.length === 0) {
    if (content) {
      if (useService) {
        chatHistorySvc.addAssistantMessage(content);
      } else {
        chatHistory.push(
          createHistoryItem({
            role: "assistant",
            content,
          }),
        );
      }
    }
    return false;
  }

  const runtime = createRuntime<PreprocessedToolCall>({
    initialState: {
      sessionId: session.sessionId,
      title: session.title,
      workspaceDirectory: session.workspaceDirectory,
      history: useService ? chatHistorySvc.getHistory() : [...chatHistory],
      toolStates: session.runtimeState?.toolStates ?? {},
      pendingPermission: session.runtimeState?.pendingPermission,
      isProcessing: false,
      currentTurnId: session.runtimeState?.currentTurnId,
    },
    adapter: {
      onAssistantMessage: (
        assistantContent: string,
        assistantToolCalls?: CoreToolCall[],
      ) => {
        const formattedToolCalls = assistantToolCalls?.map((toolCall) => ({
          id: toolCall.id,
          type: "function" as const,
          function: toolCall.function,
        }));
        if (useService) {
          chatHistorySvc.addAssistantMessage(
            assistantContent || "",
            formattedToolCalls,
          );
          return;
        }
        const toolCallStates = formattedToolCalls?.map((toolCall) => ({
          toolCallId: toolCall.id,
          toolCall,
          status: "generated" as ToolStatus,
          parsedArgs: (() => {
            try {
              return JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              return {};
            }
          })(),
        }));
        chatHistory.push(
          createHistoryItem(
            {
              role: "assistant",
              content: assistantContent || "",
              toolCalls: formattedToolCalls,
            },
            [],
            toolCallStates,
          ),
        );
      },
      onHistoryItem: (historyItem: ChatHistoryItem) => {
        if (useService) {
          chatHistorySvc.addHistoryItem(historyItem);
          return;
        }
        chatHistory.push(historyItem);
      },
      onToolStateChanged: (toolState: RuntimeToolState) => {
        const status = toChatStatus(toolState.status);
        const output = toolState.output?.[0]?.content ?? toolState.errorMessage;
        if (useService) {
          if (output !== undefined) {
            chatHistorySvc.addToolResult(toolState.toolCallId, output, status);
            return;
          }
          chatHistorySvc.updateToolStatus(toolState.toolCallId, status);
          return;
        }

        const lastAssistantIndex = chatHistory.findLastIndex(
          (item) => item.message.role === "assistant" && item.toolCallStates,
        );
        if (lastAssistantIndex < 0) {
          return;
        }
        const runtimeToolState =
          chatHistory[lastAssistantIndex].toolCallStates?.find(
            (state) => state.toolCallId === toolState.toolCallId,
          );
        if (!runtimeToolState) {
          return;
        }
        runtimeToolState.status = status;
        if (output !== undefined) {
          runtimeToolState.output = [
            {
              content: output,
              name: "Tool Result",
              description: "Tool execution result",
            },
          ];
        }
      },
      onSessionChanged: (state: RuntimeSessionState) => {
        updateSessionRuntimeState(state);
      },
      onPermissionRequested: (request: RuntimePermissionRequest) => {
        const toolState = runtime
          .getStateSnapshot()
          .toolStates[request.toolCallId];
        if (!toolState) {
          runtime.respondToPermission(request.requestId, false);
          return;
        }

        const toolCall: PreprocessedToolCall = {
          id: toolState.toolCallId,
          name: toolState.toolCall.function.name,
          arguments: toolState.processedArgs ?? toolState.parsedArgs,
          argumentsStr: toolState.toolCall.function.arguments,
          startNotified: true,
          tool: toolState.tool as Tool,
          preprocessResult: toolState.processedArgs
            ? {
                args: toolState.processedArgs,
                preview: request.preview as any,
              }
            : undefined,
        };

        void requestUserPermission(toolCall, callbacks).then((approved) => {
          runtime.respondToPermission(request.requestId, approved);
        });
      },
    },
    preprocessToolCalls: async (calls: CoreToolCall[]) => {
      const availableTools: Tool[] = await getAllAvailableTools(isHeadless);
      const preprocessedCalls: PreprocessedToolCall[] = [];
      const errorResults: Array<{ toolCallId: string; content: string }> = [];

      for (const toolCall of calls) {
        try {
          const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
          const tool = availableTools.find(
            (item) => item.name === toolCall.function.name,
          );
          if (!tool) {
            throw new Error(`Tool ${toolCall.function.name} not found`);
          }

          const streamedToolCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parsedArgs,
            argumentsStr: toolCall.function.arguments,
            startNotified: true,
          };

          validateToolCallArgsPresent(streamedToolCall, tool);

          const preprocessedCall: PreprocessedToolCall = {
            ...streamedToolCall,
            tool,
          };

          if (tool.preprocess) {
            preprocessedCall.preprocessResult = await tool.preprocess(
              parsedArgs,
            );
          }

          preprocessedCalls.push(preprocessedCall);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          callbacks?.onToolStart?.(toolCall.function.name, {});
          errorResults.push({
            toolCallId: toolCall.id,
            content: errorMessage,
          });
        }
      }

      return {
        preprocessedCalls,
        errorResults,
      };
    },
    evaluatePermission: async (toolCall: PreprocessedToolCall) => {
      callbacks?.onToolStart?.(
        toolCall.name,
        toolCall.preprocessResult?.args ?? toolCall.arguments,
      );
      const permissionState =
        await serviceContainer.get<ToolPermissionServiceState>(
          SERVICE_NAMES.TOOL_PERMISSIONS,
        );
      const result = checkToolPermission(toolCall, permissionState.permissions);
      return {
        permission:
          result.permission === "exclude"
            ? "deny"
            : result.permission === "ask"
              ? "ask"
              : "allow",
      };
    },
    executeToolCall: async (toolCall: PreprocessedToolCall) => {
      const result = await executeToolCall(toolCall);
      callbacks?.onToolResult?.(result, toolCall.name, "done");
      return {
        content: result,
        output: [
          {
            content: result,
            name: "Tool Result",
            description: "Tool execution result",
          },
        ],
      };
    },
    getToolCallId: (toolCall: PreprocessedToolCall) => toolCall.id,
    getToolCallName: (toolCall: PreprocessedToolCall) => toolCall.name,
    getProcessedArgs: (toolCall: PreprocessedToolCall) =>
      toolCall.preprocessResult?.args ?? toolCall.arguments,
    getPreview: (toolCall: PreprocessedToolCall) =>
      toolCall.preprocessResult?.preview,
  });

  runtime.events.on((event: RuntimeToolStateEvent) => {
    if (event.type !== "tool_state_changed") {
      return;
    }

    if (event.toolState.status === "errored" && event.toolState.errorMessage) {
      callbacks?.onToolError?.(
        event.toolState.errorMessage,
        event.toolState.toolCall.function.name,
      );
    }

    if (event.toolState.status === "rejected") {
      const message =
        event.toolState.errorMessage ?? "Permission denied by user";
      callbacks?.onToolResult?.(
        message,
        event.toolState.toolCall.function.name,
        "canceled",
      );
    }
  });

  const turnId = `turn-${Date.now()}`;
  const result = await runtime.processToolCalls(
    toolCalls.map<CoreToolCall>((toolCall) => ({
      id: toolCall.id,
      type: "function" as const,
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments),
      },
    })),
    content,
    useService ? chatHistorySvc.getHistory() : chatHistory,
    turnId,
  );

  if (useService) {
    session.history = chatHistorySvc.getHistory();
  } else {
    session.history = [...chatHistory];
  }

  const runtimeState = runtime.getStateSnapshot();
  runtimeState.history = session.history;
  updateSessionRuntimeState(runtimeState);

  if (isHeadless && result.hasRejection) {
    logger.debug(
      "Tool call rejected in headless mode - returning current content",
    );
    return true;
  }

  return false;
}

export async function getRequestTools(isHeadless: boolean) {
  const availableTools = await getAllAvailableTools(isHeadless);

  const permissionsState =
    await serviceContainer.get<ToolPermissionServiceState>(
      SERVICE_NAMES.TOOL_PERMISSIONS,
    );

  const allowedTools: Tool[] = [];
  for (const tool of availableTools) {
    const result = checkToolPermission(
      { name: tool.name, arguments: {} },
      permissionsState.permissions,
    );

    if (
      result.permission === "allow" ||
      (result.permission === "ask" && !isHeadless)
    ) {
      allowedTools.push(tool);
    }
  }

  return allowedTools.map(convertToolToChatCompletionTool);
}
