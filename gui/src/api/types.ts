// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// Auth
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user_name: string;
  access_token: string;
  refresh_token: string;
}

// Models
export interface ApiModel {
  id: number;
  model_id: string;
  model_name: string;
  model_class: string;
  model_provider: string;
  model_roles: string; // JSON string array
  api_base_url: string | null;
  api_key?: string | null;
  max_tokens?: number | null;
  is_active: boolean;
  /**
   * @deprecated This field is no longer used. All models now use unified-api provider.
   */
  open_source_yn: string; // "y" or "n"
  disable_agent_mode?: string; // "y" or "n"
}

// Sessions
export interface SessionData {
  sessionId: string;
  title: string;
  workspaceDirectory: string;
  history: any[]; // ChatHistoryItem[]
}

export interface SessionMetadata {
  sessionId: string;
  title: string;
  dateCreated: string;
  workspaceDirectory: string;
}

export interface ListSessionsParams {
  limit?: number;
  offset?: number;
}

export interface ListSessionsResponse {
  sessions: SessionMetadata[];
}

// Chat
export interface ChatRequest {
  model: string;
  messages: any[]; // ChatMessage[]
  stream?: boolean;
  [key: string]: any; // Additional options
}
