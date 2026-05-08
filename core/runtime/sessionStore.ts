import type { ToolCall } from "..";

import type {
  RuntimePermissionRequest,
  RuntimeSessionState,
  RuntimeToolState,
  RuntimeToolStateStatus,
} from "./types";

export class RuntimeSessionStore {
  private state: RuntimeSessionState;

  constructor(state: RuntimeSessionState) {
    this.state = {
      ...state,
      history: [...state.history],
      toolStates: { ...state.toolStates },
    };
  }

  getSnapshot(): RuntimeSessionState {
    return {
      ...this.state,
      history: [...this.state.history],
      toolStates: { ...this.state.toolStates },
    };
  }

  setHistory(history: RuntimeSessionState["history"]) {
    this.state.history = [...history];
  }

  setProcessing(isProcessing: boolean, currentTurnId?: string) {
    this.state.isProcessing = isProcessing;
    this.state.currentTurnId = currentTurnId;
  }

  setPendingPermission(request?: RuntimePermissionRequest) {
    this.state.pendingPermission = request;
  }

  recordAssistantToolCalls(toolCalls: ToolCall[]) {
    toolCalls.forEach((toolCall) => {
      this.state.toolStates[toolCall.id] = {
        toolCallId: toolCall.id,
        toolCall,
        status: "generated",
        parsedArgs: this.parseArguments(toolCall.function.arguments),
      };
    });
  }

  updateToolState(
    toolCallId: string,
    updates: Partial<RuntimeToolState> & { status?: RuntimeToolStateStatus },
  ) {
    const existing = this.state.toolStates[toolCallId];
    if (!existing) {
      return undefined;
    }
    const nextState = {
      ...existing,
      ...updates,
    };
    this.state.toolStates[toolCallId] = nextState;
    return nextState;
  }

  private parseArguments(rawArguments: string) {
    try {
      return JSON.parse(rawArguments);
    } catch {
      return {};
    }
  }
}
