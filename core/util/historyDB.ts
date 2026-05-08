import { fetchwithRequestOptions } from "@continuedev/fetch";
import { BaseSessionMetadata, Session } from "../index.js";
import { CONTINUE_API_URL } from "../llm/constants.js";
import { ListHistoryOptions } from "../protocol/core.js";
import { NEW_SESSION_TITLE } from "./constants.js";

/**
 * HistoryManagerDB - Server-based session storage
 *
 * @deprecated This class is deprecated. Use gui/src/api/sessions.ts instead.
 * GUI now calls the API directly without going through core.
 * This class is kept for backward compatibility with JetBrains extension.
 *
 * This class handles session storage via HTTP API instead of local file system.
 * Sessions are stored on the server with user authentication.
 */
export class HistoryManagerDB {
  private apiBaseUrl: string;
  private accessToken: string | null = null;

  constructor(apiBaseUrl: string = CONTINUE_API_URL) {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Set access token for authentication
   * This should be called from the GUI side when token is available
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * Update API base URL from config
   * This should be called after config.yaml is loaded
   */
  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url;
    console.log("[HistoryDB] API base URL updated to:", url);
  }

  /**
   * Make authenticated API request
   */
  private async fetchWithAuth(
    endpoint: string,
    options: any = {},
  ): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add existing headers from options
    if (options.headers) {
      const existingHeaders = options.headers as Record<string, string>;
      Object.assign(headers, existingHeaders);
    }

    // Add access token as Authorization Bearer header
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    console.log(`[HistoryDB] ${options.method || "GET"} ${endpoint}`);

    try {
      const response = await fetchwithRequestOptions(
        new URL(`${this.apiBaseUrl}${endpoint}`),
        {
          method: options.method || "GET",
          headers,
          body: options.body,
        },
        {},
      );

      if (response.status === 401) {
        console.error("[HistoryDB] Unauthorized: Session expired");
        throw new Error("Unauthorized: Session expired");
      }

      return response;
    } catch (error: any) {
      console.error(`[HistoryDB] Fetch error for ${endpoint}:`, error.message);
      throw error;
    }
  }

  /**
   * List sessions from server
   */
  async list(options: ListHistoryOptions): Promise<BaseSessionMetadata[]> {
    try {
      const params = new URLSearchParams();
      if (options.limit) {
        params.append("limit", options.limit.toString());
      }
      if (options.offset) {
        params.append("offset", options.offset.toString());
      }

      const response = await this.fetchWithAuth(
        `/api/sessions?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`List sessions failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.sessions || [];
    } catch (error: any) {
      console.error("[HistoryDB] Error listing sessions:", error.message);
      return [];
    }
  }

  /**
   * Delete a session from server
   */
  async delete(sessionId: string): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Delete session failed: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error("[HistoryDB] Error deleting session:", error.message);
      throw new Error(`Delete session failed: ${error.message}`);
    }
  }

  /**
   * Clear all sessions from server
   */
  async clearAll(): Promise<void> {
    try {
      const response = await this.fetchWithAuth("/api/sessions", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to clear all sessions: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error clearing all sessions from server:", error);
      throw error;
    }
  }

  /**
   * Load a session from server
   */
  async load(sessionId: string): Promise<Session> {
    try {
      const response = await this.fetchWithAuth(`/api/sessions/${sessionId}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[HistoryDB] Session ${sessionId} not found on server`);
          return {
            history: [],
            title: NEW_SESSION_TITLE,
            workspaceDirectory: "",
            sessionId: sessionId,
          };
        }
        throw new Error(`Load session failed: ${response.statusText}`);
      }

      const session: Session = await response.json();
      session.sessionId = sessionId;
      return session;
    } catch (error: any) {
      console.error(`[HistoryDB] Error loading session:`, error.message);
      return {
        history: [],
        title: NEW_SESSION_TITLE,
        workspaceDirectory: "",
        sessionId: sessionId,
      };
    }
  }

  /**
   * Load the last session for a workspace from server
   */
  async loadLast(workspaceDirectory: string): Promise<Session | null> {
    try {
      const response = await this.fetchWithAuth(
        `/api/sessions/last/data?workspace_directory=${encodeURIComponent(workspaceDirectory)}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log(
            `[HistoryDB] No last session found for ${workspaceDirectory}`,
          );
          return null;
        }
        throw new Error(`Load last session failed: ${response.statusText}`);
      }

      const session: Session = await response.json();
      if (!session.sessionId) {
        // Handle case where API returns empty session object or null sessionId
        return null;
      }
      return session;
    } catch (error: any) {
      console.error(`[HistoryDB] Error loading last session:`, error.message);
      return null;
    }
  }

  /**
   * Save a session to server
   */
  async save(session: Session): Promise<void> {
    console.log(
      `[HistoryDB] Saving session: ${session.sessionId}, title: ${session.title}`,
    );

    try {
      // Prepare session data
      const sessionData = {
        sessionId: session.sessionId,
        title: session.title,
        workspaceDirectory: session.workspaceDirectory,
        history: session.history,
        runtimeState: session.runtimeState,
      };

      console.log(
        `[HistoryDB] Session data prepared, history count: ${session.history.length}`,
      );

      const response = await this.fetchWithAuth("/api/sessions", {
        method: "POST",
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HistoryDB] Save failed: ${response.status} ${response.statusText}`,
        );
        throw new Error(
          `Save session failed: ${response.statusText} - ${errorText}`,
        );
      }

      console.log(
        `[HistoryDB] Session saved successfully: ${session.sessionId}`,
      );
    } catch (error: any) {
      console.error(
        "[HistoryDB] Error saving session to server:",
        error.message,
      );
      throw new Error(`Save session failed: ${error.message}`);
    }
  }
}

// Create singleton instance
const historyManagerDB = new HistoryManagerDB();

export default historyManagerDB;
