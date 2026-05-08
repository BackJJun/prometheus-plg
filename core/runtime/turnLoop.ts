import type { ChatHistoryItem } from "..";

export interface RuntimeTurnLoopIteration<TToolCall> {
  content: string;
  toolCalls: TToolCall[];
  shouldContinue: boolean;
}

export interface RuntimeTurnLoopResult {
  fullResponse: string;
  finalResponse: string;
  history: ChatHistoryItem[];
}

export interface RuntimeTurnLoopOptions<TToolCall> {
  initialHistory: ChatHistoryItem[];
  isAborted?: () => boolean;
  beforeIteration?: (
    history: ChatHistoryItem[],
  ) => Promise<ChatHistoryItem[]> | ChatHistoryItem[];
  iterate: (
    history: ChatHistoryItem[],
  ) => Promise<RuntimeTurnLoopIteration<TToolCall>>;
  onContent?: (
    content: string,
    shouldContinue: boolean,
  ) => Promise<void> | void;
  processToolCalls: (args: {
    toolCalls: TToolCall[];
    content: string;
    history: ChatHistoryItem[];
  }) => Promise<{
    shouldReturn?: boolean;
    history?: ChatHistoryItem[];
  }>;
  afterToolCalls?: (
    history: ChatHistoryItem[],
    shouldContinue: boolean,
  ) => Promise<ChatHistoryItem[]> | ChatHistoryItem[];
  updateFinalResponse: (args: {
    content: string;
    shouldContinue: boolean;
    currentFinalResponse: string;
  }) => string;
}

export async function runRuntimeTurnLoop<TToolCall>(
  options: RuntimeTurnLoopOptions<TToolCall>,
): Promise<RuntimeTurnLoopResult> {
  let history = [...options.initialHistory];
  let fullResponse = "";
  let finalResponse = "";

  while (true) {
    if (options.isAborted?.()) {
      return {
        fullResponse,
        finalResponse,
        history,
      };
    }

    history = options.beforeIteration
      ? await options.beforeIteration(history)
      : history;

    const iteration = await options.iterate(history);

    if (options.isAborted?.()) {
      return {
        fullResponse,
        finalResponse: finalResponse || iteration.content || fullResponse,
        history,
      };
    }

    fullResponse += iteration.content;
    finalResponse = options.updateFinalResponse({
      content: iteration.content,
      shouldContinue: iteration.shouldContinue,
      currentFinalResponse: finalResponse,
    });

    await options.onContent?.(iteration.content, iteration.shouldContinue);

    const toolResult = await options.processToolCalls({
      toolCalls: iteration.toolCalls,
      content: iteration.content,
      history,
    });

    history = toolResult.history ?? history;

    if (toolResult.shouldReturn || !iteration.shouldContinue) {
      break;
    }

    history = options.afterToolCalls
      ? await options.afterToolCalls(history, iteration.shouldContinue)
      : history;
  }

  return {
    fullResponse,
    finalResponse,
    history,
  };
}
