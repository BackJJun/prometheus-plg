import type { ChatHistoryItem, ContextItem, Tool, ToolCall } from "..";

export type RuntimeToolStateStatus =
  | "generated"
  | "pending_permission"
  | "running"
  | "completed"
  | "errored"
  | "rejected";

export interface RuntimeToolState {
  toolCallId: string;
  toolCall: ToolCall;
  status: RuntimeToolStateStatus;
  parsedArgs: any;
  processedArgs?: Record<string, any>;
  output?: ContextItem[];
  tool?: Tool;
  errorMessage?: string;
}

export interface RuntimePermissionRequest {
  requestId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
  preview?: unknown;
}

export interface RuntimeApplyState {
  streamId: string;
  status: string;
  toolCallId?: string;
  fileContent?: string;
  originalFileContent?: string;
  numDiffs?: number;
}

export interface RuntimeSessionState {
  sessionId: string;
  title: string;
  workspaceDirectory: string;
  history: ChatHistoryItem[];
  toolStates: Record<string, RuntimeToolState>;
  pendingPermission?: RuntimePermissionRequest;
  isProcessing: boolean;
  currentTurnId?: string;
}

export interface RuntimeClientAdapter {
  onAssistantMessage?: (content: string, toolCalls?: ToolCall[]) => void;
  onHistoryItem?: (historyItem: ChatHistoryItem) => void;
  onToolStateChanged?: (toolState: RuntimeToolState) => void;
  onPermissionRequested?: (request: RuntimePermissionRequest) => void;
  onApplyStateChanged?: (applyState: RuntimeApplyState) => void;
  onSessionChanged?: (state: RuntimeSessionState) => void;
}

export interface RuntimePreprocessResult<TPreprocessedToolCall> {
  preprocessedCalls: TPreprocessedToolCall[];
  errorResults: Array<{
    toolCallId: string;
    content: string;
  }>;
}

export interface RuntimePermissionEvaluationResult {
  permission: "allow" | "ask" | "deny";
}

export interface RuntimeProcessResult {
  hasRejection: boolean;
}

export interface RuntimeToolExecutionResult {
  content: string;
  output?: ContextItem[];
}

export type RuntimeToolStateEvent =
  | { type: "session_updated"; state: RuntimeSessionState }
  | { type: "tool_state_changed"; toolState: RuntimeToolState }
  | { type: "permission_requested"; request: RuntimePermissionRequest }
  | { type: "permission_resolved"; requestId: string; approved: boolean }
  | { type: "apply_state_changed"; applyState: RuntimeApplyState };
