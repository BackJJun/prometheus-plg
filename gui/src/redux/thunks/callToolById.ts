import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ContextItem } from "core";
import { CLIENT_TOOLS_IMPLS } from "core/tools/builtIn";
import { ContinueError, ContinueErrorReason } from "core/util/errors";
import posthog from "posthog-js";
import { callClientTool } from "../../util/clientTools/callClientTool";
import { isToolCallArgumentsComplete } from "../../util/toolCallState";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  acceptToolCall,
  errorToolCall,
  setInactive,
  setToolCallCalling,
  updateToolCallOutput,
} from "../slices/sessionSlice";
import { AppThunkDispatch, RootState, ThunkApiType } from "../store";
import { findToolCallById, logToolUsage } from "../util";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

const READONLY_TOOL_RETRY_ATTEMPTS = 2;
const READONLY_TOOL_RETRY_DELAY_MS = 300;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeGuiToolCallById(
  {
    toolCallId,
    isAutoApproved,
  }: {
    toolCallId: string;
    isAutoApproved?: boolean;
  },
  {
    dispatch,
    extra,
    getState,
  }: {
    dispatch: AppThunkDispatch;
    extra: ThunkApiType["extra"];
    getState: () => RootState;
  },
): Promise<{ streamResponse: boolean }> {
  const state = getState();
  const toolCallState = findToolCallById(state.session.history, toolCallId);
  if (!toolCallState) {
    console.warn(`Tool call with ID ${toolCallId} not found`);
    return { streamResponse: false };
  }

  if (toolCallState.status !== "generated") {
    return { streamResponse: false };
  }

  if (!isToolCallArgumentsComplete(toolCallState.toolCall.function.arguments)) {
    const error = new ContinueError(
      ContinueErrorReason.Unspecified,
      "Tool call arguments were not valid JSON.",
    );
    dispatch(
      updateToolCallOutput({
        toolCallId,
        contextItems: [
          {
            icon: "problems",
            name: "Invalid Tool Call",
            description: "Tool Call Failed",
            content: `${toolCallState.toolCall.function.name} failed with the message: ${error.message}\n\nPlease try something else or request further instructions.`,
            hidden: false,
          },
        ],
      }),
    );
    dispatch(errorToolCall({ toolCallId }));
    return { streamResponse: true };
  }

  const startTime = Date.now();
  const selectedChatModel = selectSelectedChatModel(state);

  posthog.capture("tool_call_decision", {
    model: selectedChatModel,
    decision: isAutoApproved ? "auto_accept" : "accept",
    toolName: toolCallState.toolCall.function.name,
    toolCallId: toolCallId,
  });

  if (!selectedChatModel) {
    throw new Error("No model selected");
  }

  dispatch(
    setToolCallCalling({
      toolCallId,
    }),
  );

  let output: ContextItem[] | undefined = undefined;
  let error: ContinueError | undefined = undefined;
  let streamResponse = true;
  const maxAttempts = toolCallState.tool?.readonly
    ? READONLY_TOOL_RETRY_ATTEMPTS
    : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (
        CLIENT_TOOLS_IMPLS.find(
          (toolName) => toolName === toolCallState.toolCall.function.name,
        )
      ) {
        const {
          output: clientToolOutput,
          respondImmediately,
          error: clientToolError,
        } = await callClientTool(toolCallState, {
          dispatch,
          ideMessenger: extra.ideMessenger,
          getState,
        });
        output = clientToolOutput;
        error = clientToolError;
        streamResponse = respondImmediately;
      } else {
        const result = await extra.ideMessenger.request("tools/call", {
          toolCall: toolCallState.toolCall,
          modelDescription: selectedChatModel,
        });
        if (result.status === "error") {
          throw new Error(result.error);
        } else {
          output = result.content.contextItems;
          error = result.content.errorMessage
            ? new ContinueError(
                result.content.errorReason || ContinueErrorReason.Unspecified,
                result.content.errorMessage,
              )
            : undefined;
        }
        streamResponse = true;
      }

      if (!error || attempt === maxAttempts) {
        break;
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
    }

    await delay(READONLY_TOOL_RETRY_DELAY_MS);
  }

  if (error) {
    dispatch(
      updateToolCallOutput({
        toolCallId,
        contextItems: [
          {
            icon: "problems",
            name: "Tool Call Error",
            description: "Tool Call Failed",
            content: `${toolCallState.toolCall.function.name} failed with the message: ${error.message}\n\nPlease try something else or request further instructions.`,
            hidden: false,
          },
        ],
      }),
    );
  } else if (output?.length) {
    dispatch(
      updateToolCallOutput({
        toolCallId,
        contextItems: output,
      }),
    );
  }

  const duration_ms = Date.now() - startTime;
  posthog.capture("tool_call_outcome", {
    model: selectedChatModel,
    succeeded: !error,
    toolName: toolCallState.toolCall.function.name,
    errorReason: error?.reason,
    duration_ms: duration_ms,
  });

  if (streamResponse) {
    if (error) {
      logToolUsage(toolCallState, false, false, extra.ideMessenger, output);
      dispatch(
        errorToolCall({
          toolCallId,
        }),
      );
    } else {
      logToolUsage(toolCallState, true, true, extra.ideMessenger, output);
      dispatch(
        acceptToolCall({
          toolCallId,
        }),
      );
    }
  } else {
    dispatch(setInactive());
  }

  return { streamResponse };
}

export const callToolById = createAsyncThunk<
  void,
  { toolCallId: string; isAutoApproved?: boolean; depth?: number },
  ThunkApiType
>("chat/callTool", async (inputs, { dispatch, extra, getState }) => {
  const { toolCallId, isAutoApproved, depth = 0 } = inputs;
  const { streamResponse } = await executeGuiToolCallById(
    {
      toolCallId,
      isAutoApproved,
    },
    { dispatch, extra, getState },
  );

  if (streamResponse) {
    const wrapped = await dispatch(
      streamResponseAfterToolCall({
        toolCallId,
        depth: depth + 1,
      }),
    );
    unwrapResult(wrapped);
  }
});
