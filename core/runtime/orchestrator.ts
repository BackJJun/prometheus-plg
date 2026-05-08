import type { ChatHistoryItem, ToolCall } from "..";

import { RuntimeAbortRegistry } from "./abortRegistry";
import { RuntimeEvents } from "./events";
import { RuntimeSessionStore } from "./sessionStore";
import type {
  RuntimeApplyState,
  RuntimeClientAdapter,
  RuntimePermissionEvaluationResult,
  RuntimePreprocessResult,
  RuntimeProcessResult,
  RuntimeSessionState,
  RuntimeToolExecutionResult,
} from "./types";

export interface RuntimeOrchestratorOptions<TPreprocessedToolCall> {
  initialState: RuntimeSessionState;
  adapter?: RuntimeClientAdapter;
  preprocessToolCalls: (
    toolCalls: ToolCall[],
  ) => Promise<RuntimePreprocessResult<TPreprocessedToolCall>>;
  evaluatePermission: (
    toolCall: TPreprocessedToolCall,
  ) => Promise<RuntimePermissionEvaluationResult>;
  executeToolCall: (
    toolCall: TPreprocessedToolCall,
  ) => Promise<RuntimeToolExecutionResult>;
  getToolCallId: (toolCall: TPreprocessedToolCall) => string;
  getToolCallName: (toolCall: TPreprocessedToolCall) => string;
  getProcessedArgs: (toolCall: TPreprocessedToolCall) => Record<string, any>;
  getPreview?: (toolCall: TPreprocessedToolCall) => unknown;
}

export class RuntimeOrchestrator<TPreprocessedToolCall> {
  readonly store: RuntimeSessionStore;
  readonly events = new RuntimeEvents();
  readonly abortRegistry = new RuntimeAbortRegistry();
  private adapter?: RuntimeClientAdapter;
  private options: RuntimeOrchestratorOptions<TPreprocessedToolCall>;
  private pendingPermissionResolvers = new Map<
    string,
    (approved: boolean) => void
  >();

  constructor(options: RuntimeOrchestratorOptions<TPreprocessedToolCall>) {
    this.options = options;
    this.adapter = options.adapter;
    this.store = new RuntimeSessionStore(options.initialState);
  }

  getStateSnapshot() {
    return this.store.getSnapshot();
  }

  startTurn(turnId: string) {
    this.abortRegistry.create(turnId);
    this.store.setProcessing(true, turnId);
    this.emitSessionChanged();
  }

  abortTurn(turnId: string) {
    const aborted = this.abortRegistry.abort(turnId);
    this.pendingPermissionResolvers.forEach((resolve) => resolve(false));
    this.pendingPermissionResolvers.clear();
    this.store.setProcessing(false);
    this.emitSessionChanged();
    return aborted;
  }

  respondToPermission(requestId: string, approved: boolean) {
    const resolve = this.pendingPermissionResolvers.get(requestId);
    if (!resolve) {
      return false;
    }
    this.pendingPermissionResolvers.delete(requestId);
    resolve(approved);
    this.events.emit({
      type: "permission_resolved",
      requestId,
      approved,
    });
    return true;
  }

  reportApplyState(applyState: RuntimeApplyState) {
    this.events.emit({
      type: "apply_state_changed",
      applyState,
    });
    this.adapter?.onApplyStateChanged?.(applyState);
  }

  async processToolCalls(
    toolCalls: ToolCall[],
    content: string,
    history: ChatHistoryItem[],
    turnId: string,
  ): Promise<RuntimeProcessResult> {
    this.store.setHistory(history);
    this.startTurn(turnId);

    if (toolCalls.length === 0) {
      if (content) {
        this.adapter?.onAssistantMessage?.(content);
      }
      this.finishTurn(turnId);
      return {
        hasRejection: false,
      };
    }

    this.store.recordAssistantToolCalls(toolCalls);
    this.adapter?.onAssistantMessage?.(content, toolCalls);
    this.emitSessionChanged();

    const { preprocessedCalls, errorResults } =
      await this.options.preprocessToolCalls(toolCalls);

    errorResults.forEach((result) => {
      const toolState = this.store.updateToolState(result.toolCallId, {
        status: "errored",
        errorMessage: result.content,
      });
      if (toolState) {
        this.emitToolStateChanged(toolState);
      }
    });

    let hasRejection = false;

    for (const toolCall of preprocessedCalls) {
      const toolCallId = this.options.getToolCallId(toolCall);
      const permissionResult = await this.options.evaluatePermission(toolCall);

      if (permissionResult.permission === "deny") {
        const toolState = this.store.updateToolState(toolCallId, {
          status: "rejected",
          errorMessage: "Command blocked by security policy",
        });
        if (toolState) {
          this.emitToolStateChanged(toolState);
        }
        hasRejection = true;
        continue;
      }

      if (permissionResult.permission === "ask") {
        const request = {
          requestId: `runtime-${toolCallId}`,
          toolCallId,
          toolName: this.options.getToolCallName(toolCall),
          arguments: this.options.getProcessedArgs(toolCall),
          preview: this.options.getPreview?.(toolCall),
        };
        this.store.setPendingPermission(request);
        this.events.emit({
          type: "permission_requested",
          request,
        });
        this.adapter?.onPermissionRequested?.(request);
        const pendingState = this.store.updateToolState(toolCallId, {
          status: "pending_permission",
          processedArgs: this.options.getProcessedArgs(toolCall),
        });
        if (pendingState) {
          this.emitToolStateChanged(pendingState);
        }

        if (!(await this.waitForPermissionResponse(request.requestId))) {
          this.store.setPendingPermission(undefined);
          const rejectedState = this.store.updateToolState(toolCallId, {
            status: "rejected",
            errorMessage: "Permission denied by user",
          });
          if (rejectedState) {
            this.emitToolStateChanged(rejectedState);
          }
          hasRejection = true;
          continue;
        }

        this.store.setPendingPermission(undefined);
      }

      const runningState = this.store.updateToolState(toolCallId, {
        status: "running",
        processedArgs: this.options.getProcessedArgs(toolCall),
      });
      if (runningState) {
        this.emitToolStateChanged(runningState);
      }

      try {
        const result = await this.options.executeToolCall(toolCall);
        const completedState = this.store.updateToolState(toolCallId, {
          status: "completed",
          output: result.output,
        });
        if (completedState) {
          this.emitToolStateChanged(completedState);
        }
      } catch (error) {
        const erroredState = this.store.updateToolState(toolCallId, {
          status: "errored",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        if (erroredState) {
          this.emitToolStateChanged(erroredState);
        }
      }
    }

    this.finishTurn(turnId);
    return {
      hasRejection,
    };
  }

  private finishTurn(turnId: string) {
    this.abortRegistry.clear(turnId);
    this.store.setPendingPermission(undefined);
    this.store.setProcessing(false, undefined);
    this.emitSessionChanged();
  }

  private waitForPermissionResponse(requestId: string) {
    return new Promise<boolean>((resolve) => {
      this.pendingPermissionResolvers.set(requestId, resolve);
    });
  }

  private emitSessionChanged() {
    const state = this.store.getSnapshot();
    this.events.emit({
      type: "session_updated",
      state,
    });
    this.adapter?.onSessionChanged?.(state);
  }

  private emitToolStateChanged(
    toolState: RuntimeSessionState["toolStates"][string],
  ) {
    this.events.emit({
      type: "tool_state_changed",
      toolState,
    });
    this.adapter?.onToolStateChanged?.(toolState);
    this.emitSessionChanged();
  }
}

export function createRuntime<TPreprocessedToolCall>(
  options: RuntimeOrchestratorOptions<TPreprocessedToolCall>,
) {
  return new RuntimeOrchestrator(options);
}
