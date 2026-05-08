import { createAsyncThunk } from "@reduxjs/toolkit";
import { LLMFullCompletionOptions, ModelDescription } from "core";
import { getRuleId } from "core/llm/rules/getSystemMessageWithRules";
import { modelSupportsNativeTools } from "core/llm/toolSupport";
import { ToCoreProtocol } from "core/protocol";
import { runRuntimeTurnLoop } from "core/runtime/turnLoop";
import { addSystemMessageToolsToSystemMessage } from "core/tools/systemMessageTools/buildToolsSystemMessage";
import { interceptSystemToolCalls } from "core/tools/systemMessageTools/interceptSystemToolCalls";
import { SystemMessageToolCodeblocksFramework } from "core/tools/systemMessageTools/toolCodeblocks";
import { v4 as uuidv4 } from "uuid";
import posthog from "posthog-js";
import { refreshAccessToken } from "../../api/client";
import { hasImageParts, streamMultimodalChat } from "../../api/multimodal";
import { selectActiveTools } from "../selectors/selectActiveTools";
import {
  selectCurrentToolCalls,
  selectPendingToolCalls,
} from "../selectors/selectToolCalls";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  abortStream,
  addPromptCompletionPair,
  errorToolCall,
  removeLastAssistantMessages,
  setActive,
  setAppliedRulesAtIndex,
  setAuthError,
  setCompactionLoading,
  setContextPercentage,
  setInactive,
  setInlineErrorMessage,
  setIsPruned,
  setToolGenerated,
  streamUpdate,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { RootState, ThunkApiType } from "../store";
import { constructMessages } from "../util/constructMessages";
import { getBaseSystemMessage } from "../util/getBaseSystemMessage";
import { executeGuiToolCallById } from "./callToolById";
import { detectToolCallInReasoning } from "./detectToolCallInReasoning";
import { evaluateToolPolicies } from "./evaluateToolPolicies";
import { preprocessToolCalls } from "./preprocessToolCallArgs";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

function buildReasoningCompletionOptions(
  baseOptions: LLMFullCompletionOptions,
  hasReasoningEnabled: boolean | undefined,
  model: ModelDescription,
): LLMFullCompletionOptions {
  if (hasReasoningEnabled === undefined) {
    return baseOptions;
  }

  const reasoningOptions: LLMFullCompletionOptions = {
    ...baseOptions,
    reasoning: !!hasReasoningEnabled,
  };

  if (hasReasoningEnabled && model.underlyingProviderName !== "ollama") {
    reasoningOptions.reasoningBudgetTokens =
      model.completionOptions?.reasoningBudgetTokens ?? 2048;
  }

  return reasoningOptions;
}

const AUTO_COMPACT_CONTEXT_THRESHOLD = 0.8;
const AUTO_COMPACT_RECENT_HISTORY_KEEP = 6;
const AUTO_COMPACT_MIN_TARGET_INDEX = 1;

function getAutoCompactIndex(
  history: RootState["session"]["history"],
): number | undefined {
  let latestSummaryIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].conversationSummary) {
      latestSummaryIndex = i;
      break;
    }
  }

  const compactIndex = history.length - AUTO_COMPACT_RECENT_HISTORY_KEEP - 1;
  if (compactIndex < AUTO_COMPACT_MIN_TARGET_INDEX) {
    return undefined;
  }
  if (compactIndex <= latestSummaryIndex) {
    return undefined;
  }

  return compactIndex;
}

export const streamNormalInput = createAsyncThunk<
  void,
  {
    legacySlashCommandData?: ToCoreProtocol["llm/streamChat"][0]["legacySlashCommandData"];
    depth?: number;
  },
  ThunkApiType
>(
  "chat/streamNormalInput",
  async (
    { legacySlashCommandData, depth = 0 },
    { dispatch, extra, getState },
  ) => {
    if (process.env.NODE_ENV === "test" && depth > 50) {
      const message = `Max stream depth of ${50} reached in test`;
      console.error(message, JSON.stringify(getState(), null, 2));
      throw new Error(message);
    }

    await runRuntimeTurnLoop({
      initialHistory: getState().session.history,
      isAborted: () => {
        const state = getState();
        return (
          state.session.streamAborter.signal.aborted || !state.session.isStreaming
        );
      },
      iterate: async () => {
        const state = getState();
        const selectedChatModel = selectSelectedChatModel(state);

        if (!selectedChatModel) {
          throw new Error("No chat model selected");
        }

        const activeTools = selectActiveTools(state);
        const useNativeTools = state.config.config.experimental
          ?.onlyUseSystemMessageTools
          ? false
          : modelSupportsNativeTools(selectedChatModel);
        const systemToolsFramework = !useNativeTools
          ? new SystemMessageToolCodeblocksFramework()
          : undefined;

        let completionOptions: LLMFullCompletionOptions = {};
        if (useNativeTools && activeTools.length > 0) {
          completionOptions = {
            tools: activeTools,
          };
        }

        completionOptions = buildReasoningCompletionOptions(
          completionOptions,
          state.session.hasReasoningEnabled,
          selectedChatModel,
        );

        const baseSystemMessage = getBaseSystemMessage(
          state.session.mode,
          selectedChatModel,
          activeTools,
        );

        const systemMessage = systemToolsFramework
          ? addSystemMessageToolsToSystemMessage(
              systemToolsFramework,
              baseSystemMessage,
              activeTools,
            )
          : baseSystemMessage;

        const withoutMessageIds = state.session.history.map((item) => {
          const { id, ...messageWithoutId } = item.message;
          return { ...item, message: messageWithoutId };
        });

        let { messages, appliedRules, appliedRuleIndex } = constructMessages(
          withoutMessageIds,
          systemMessage,
          state.config.config.rules,
          state.ui.ruleSettings,
          systemToolsFramework,
        );

        dispatch(
          setAppliedRulesAtIndex({
            index: appliedRuleIndex,
            appliedRules,
          }),
        );

        dispatch(setActive());
        dispatch(setInlineErrorMessage(undefined));

        let containsImageInput = hasImageParts(messages);
        let compiledChatMessages = messages;
        let didPrune = false;
        let contextPercentage: number | undefined;

        if (!containsImageInput) {
          const precompiledRes = await extra.ideMessenger.request(
            "llm/compileChat",
            {
              messages,
              options: completionOptions,
              modelDescription: selectedChatModel,
            },
          );

          if (precompiledRes.status === "error") {
            if (precompiledRes.error.includes("Not enough context")) {
              dispatch(setInlineErrorMessage("out-of-context"));
              dispatch(setInactive());
              return {
                content: "",
                toolCalls: [],
                shouldContinue: false,
              };
            }

            throw new Error(precompiledRes.error);
          }

          compiledChatMessages = precompiledRes.content.compiledChatMessages;
          didPrune = precompiledRes.content.didPrune;
          contextPercentage = precompiledRes.content.contextPercentage;
        }

        dispatch(setIsPruned(didPrune));
        if (contextPercentage !== undefined) {
          dispatch(setContextPercentage(contextPercentage));
        }

        if (
          contextPercentage !== undefined &&
          contextPercentage >= AUTO_COMPACT_CONTEXT_THRESHOLD &&
          !containsImageInput
        ) {
          const autoCompactIndex = getAutoCompactIndex(
            getState().session.history,
          );

          if (autoCompactIndex !== undefined && getState().session.id) {
            dispatch(
              setCompactionLoading({
                index: autoCompactIndex,
                loading: true,
              }),
            );

            try {
              const compactState = getState();
              const compactResult = await extra.ideMessenger.request(
                "conversation/compact",
                {
                  index: autoCompactIndex,
                  sessionId: compactState.session.id,
                  modelDescription: selectedChatModel,
                  history: compactState.session.history,
                },
              );

              if (compactResult.status === "success" && compactResult.content) {
                dispatch(
                  updateHistoryItemAtIndex({
                    index: autoCompactIndex,
                    updates: {
                      conversationSummary: compactResult.content,
                    },
                  }),
                );

                const compactedState = getState();
                const compactedHistoryWithoutIds =
                  compactedState.session.history.map((item) => {
                    const { id, ...messageWithoutId } = item.message;
                    return { ...item, message: messageWithoutId };
                  });

                const compactedMessages = constructMessages(
                  compactedHistoryWithoutIds,
                  systemMessage,
                  compactedState.config.config.rules,
                  compactedState.ui.ruleSettings,
                  systemToolsFramework,
                );

                const compactedContainsImageInput = hasImageParts(
                  compactedMessages.messages,
                );

                if (!compactedContainsImageInput) {
                  const compactedPrecompiledRes =
                    await extra.ideMessenger.request("llm/compileChat", {
                      messages: compactedMessages.messages,
                      options: completionOptions,
                      modelDescription: selectedChatModel,
                    });

                  if (compactedPrecompiledRes.status === "success") {
                    messages = compactedMessages.messages;
                    appliedRules = compactedMessages.appliedRules;
                    appliedRuleIndex = compactedMessages.appliedRuleIndex;
                    containsImageInput = compactedContainsImageInput;
                    compiledChatMessages =
                      compactedPrecompiledRes.content.compiledChatMessages;
                    didPrune = compactedPrecompiledRes.content.didPrune;
                    contextPercentage =
                      compactedPrecompiledRes.content.contextPercentage;

                    dispatch(
                      setAppliedRulesAtIndex({
                        index: appliedRuleIndex,
                        appliedRules,
                      }),
                    );
                    dispatch(setIsPruned(didPrune));
                    if (contextPercentage !== undefined) {
                      dispatch(setContextPercentage(contextPercentage));
                    }
                  } else {
                    console.warn(
                      "[AutoCompact] Failed to compile compacted messages:",
                      compactedPrecompiledRes.error,
                    );
                  }
                }
              }
            } catch (error) {
              console.error("[AutoCompact] Failed to compact conversation:", error);
            } finally {
              dispatch(
                setCompactionLoading({
                  index: autoCompactIndex,
                  loading: false,
                }),
              );
            }
          }
        }

        const start = Date.now();
        const streamAborter = getState().session.streamAborter;
        let retryCount = 0;
        const maxRetries = 2;
        let toolCallRetryCount = 0;
        const maxToolCallRetries = 20;
        const requestId = uuidv4();

        while (retryCount < maxRetries) {
          try {
            if (containsImageInput) {
              let gen = await streamMultimodalChat(
                {
                  messages: compiledChatMessages,
                  model: selectedChatModel.model,
                  requestId,
                  ...completionOptions,
                },
                streamAborter.signal,
              );
              if (systemToolsFramework && activeTools.length > 0) {
                gen = interceptSystemToolCalls(
                  gen,
                  streamAborter,
                  systemToolsFramework,
                );
              }

              let next = await gen.next();
              while (!next.done) {
                if (!getState().session.isStreaming) {
                  dispatch(abortStream());
                  break;
                }

                dispatch(streamUpdate(next.value));
                next = await gen.next();
              }
            } else {
              const accessToken = localStorage.getItem("access_token");

              let gen = extra.ideMessenger.llmStreamChat(
                {
                  completionOptions: {
                    ...completionOptions,
                    ...(accessToken && { access_token: accessToken }),
                  },
                  title: selectedChatModel.title,
                  requestId,
                  modelDescription: selectedChatModel,
                  messages: compiledChatMessages,
                  legacySlashCommandData,
                  messageOptions: { precompiled: true },
                },
                streamAborter.signal,
              );
              if (systemToolsFramework && activeTools.length > 0) {
                gen = interceptSystemToolCalls(
                  gen,
                  streamAborter,
                  systemToolsFramework,
                );
              }

              let next = await gen.next();
              while (!next.done) {
                if (!getState().session.isStreaming) {
                  dispatch(abortStream());
                  break;
                }

                dispatch(streamUpdate(next.value));
                next = await gen.next();
              }

              if (next.done && next.value) {
                dispatch(addPromptCompletionPair([next.value]));

                try {
                  extra.ideMessenger.post("devdata/log", {
                    name: "chatInteraction",
                    data: {
                      prompt: next.value.prompt,
                      completion: next.value.completion,
                      modelProvider: selectedChatModel.underlyingProviderName,
                      modelName: selectedChatModel.title,
                      modelTitle: selectedChatModel.title,
                      sessionId: state.session.id,
                      ...(activeTools.length > 0 && {
                        tools: activeTools.map((tool) => tool.function.name),
                      }),
                      ...(appliedRules.length > 0 && {
                        rules: appliedRules.map((rule) => ({
                          id: getRuleId(rule),
                          rule: rule.rule,
                          slug: rule.slug,
                        })),
                      }),
                    },
                  });
                } catch (e) {
                  console.error("Failed to send dev data interaction log", e);
                }
              }
            }

            const currentState = getState();
            const lastHistoryItem =
              currentState.session.history[
                currentState.session.history.length - 1
              ];
            const reasoningContent =
              lastHistoryItem?.reasoning?.text ||
              (lastHistoryItem?.message.role === "thinking"
                ? (lastHistoryItem.message.content as string)
                : undefined);

            if (reasoningContent) {
              const detection = detectToolCallInReasoning(reasoningContent);

              if (
                detection.detected &&
                toolCallRetryCount < maxToolCallRetries
              ) {
                console.warn(
                  `[GPT-OSS Bug] Tool call detected in reasoning field (attempt ${toolCallRetryCount + 1}/${maxToolCallRetries}):`,
                  detection.suspectedToolName,
                  detection.jsonData,
                );
                dispatch(removeLastAssistantMessages());
                toolCallRetryCount++;
                continue;
              }
            }

            break;
          } catch (e) {
            console.log("[Chat] Caught error:", {
              error: e,
              status: (e as any).status,
              statusCode: (e as any).statusCode,
              responseStatus: (e as any).response?.status,
              message: (e as any).message,
              name: (e as any).name,
            });

            let errorStatus: number | undefined =
              (e as any).status ||
              (e as any).statusCode ||
              (e as any).response?.status;

            if (!errorStatus && (e as any).message) {
              const message = (e as any).message as string;
              const match = message.match(/^HTTP\s+(\d{3})/);
              if (match) {
                errorStatus = parseInt(match[1], 10);
              }
            }

            if (errorStatus === 401) {
              try {
                await refreshAccessToken();
                retryCount++;
                continue;
              } catch (refreshError) {
                console.error("[Chat] Token refresh failed:", refreshError);
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                localStorage.removeItem("user_session");
                window.dispatchEvent(new CustomEvent("auth:logout"));
                dispatch(setAuthError(true));
                dispatch(setInactive());
                return {
                  content: "",
                  toolCalls: [],
                  shouldContinue: false,
                };
              }
            }

            const toolCallsToCancel = selectCurrentToolCalls(getState());
            posthog.capture("stream_premature_close_error", {
              duration: (Date.now() - start) / 1000,
              model: selectedChatModel.model,
              provider: selectedChatModel.underlyingProviderName,
              context: legacySlashCommandData ? "slash_command" : "regular_chat",
              ...(legacySlashCommandData && {
                command: legacySlashCommandData.command.name,
              }),
            });

            if (
              toolCallsToCancel.length > 0 &&
              e instanceof Error &&
              e.message.toLowerCase().includes("premature close")
            ) {
              for (const tc of toolCallsToCancel) {
                dispatch(
                  errorToolCall({
                    toolCallId: tc.toolCallId,
                    output: [
                      {
                        name: "Tool Call Error",
                        description: "Premature Close",
                        content:
                          '"Premature Close" error: this tool call was aborted mid-stream because the arguments took too long to stream or there were network issues. Please re-attempt by breaking the operation into smaller chunks or trying something else',
                        icon: "problems",
                      },
                    ],
                  }),
                );
              }
              break;
            }

            throw e;
          }
        }

        const currentState = getState();
        const currentToolCalls = selectCurrentToolCalls(currentState);
        const lastAssistantMessage = [...currentState.session.history]
          .reverse()
          .find((item) => item.message.role === "assistant");
        const content =
          lastAssistantMessage?.message.role === "assistant" &&
          typeof lastAssistantMessage.message.content === "string"
            ? lastAssistantMessage.message.content
            : "";

        return {
          content,
          toolCalls: currentToolCalls,
          shouldContinue: currentToolCalls.length > 0,
        };
      },
      processToolCalls: async ({ toolCalls }) => {
        const state1 = getState();
        const streamAborter = state1.session.streamAborter;

        if (
          toolCalls.length === 0 ||
          streamAborter.signal.aborted ||
          !state1.session.isStreaming
        ) {
          dispatch(setInactive());
          return {
            shouldReturn: true,
            history: getState().session.history,
          };
        }

        const generatingCalls = toolCalls.filter(
          (toolCall) => toolCall.status === "generating",
        );
        for (const { toolCallId } of generatingCalls) {
          dispatch(
            setToolGenerated({
              toolCallId,
              tools: state1.config.config.tools,
            }),
          );
        }

        const state2 = getState();
        if (streamAborter.signal.aborted || !state2.session.isStreaming) {
          return {
            shouldReturn: true,
            history: state2.session.history,
          };
        }

        const activeTools = selectActiveTools(state2);
        const generatedCalls2 = selectPendingToolCalls(state2);
        await preprocessToolCalls(dispatch, extra.ideMessenger, generatedCalls2);

        const state3 = getState();
        if (streamAborter.signal.aborted || !state3.session.isStreaming) {
          return {
            shouldReturn: true,
            history: state3.session.history,
          };
        }

        const generatedCalls3 = selectPendingToolCalls(state3);
        const policies = await evaluateToolPolicies(
          dispatch,
          extra.ideMessenger,
          activeTools,
          generatedCalls3,
          state3.ui.toolSettings,
        );

        const state4 = getState();
        if (streamAborter.signal.aborted || !state4.session.isStreaming) {
          return {
            shouldReturn: true,
            history: state4.session.history,
          };
        }

        let shouldReturn = false;

        if (policies.length > 0) {
          for (const { policy, toolCallState } of policies) {
            if (policy === "disabled") {
              continue;
            }

            const latestState = getState();
            if (
              streamAborter.signal.aborted ||
              !latestState.session.isStreaming
            ) {
              shouldReturn = true;
              break;
            }

            if (policy === "allowedWithPermission") {
              dispatch(setInactive());
              shouldReturn = true;
              break;
            }

            const { streamResponse } = await executeGuiToolCallById(
              {
                toolCallId: toolCallState.toolCallId,
                isAutoApproved: true,
              },
              { dispatch, extra, getState },
            );

            if (streamResponse) {
              await dispatch(
                streamResponseAfterToolCall({
                  toolCallId: toolCallState.toolCallId,
                  depth: depth + 1,
                  continueStreaming: false,
                }),
              );
            } else {
              shouldReturn = true;
            }
          }
        } else {
          for (const { toolCallId } of toolCalls) {
            await dispatch(
              streamResponseAfterToolCall({
                toolCallId,
                depth: depth + 1,
                continueStreaming: false,
              }),
            );
          }
        }

        return {
          shouldReturn,
          history: getState().session.history,
        };
      },
      afterToolCalls: async () => getState().session.history,
      updateFinalResponse: ({ content, currentFinalResponse }) =>
        content || currentFinalResponse,
    });
  },
);
