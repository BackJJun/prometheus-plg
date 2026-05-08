import { fetchwithRequestOptions } from "@continuedev/fetch";
import { CONTINUE_API_URL } from "../llm/constants.js";

/**
 * Model data structure from API
 */
export interface ApiModel {
  id: number;
  model_id: string;
  model_name: string;
  model_class: string;
  model_provider: string;
  model_roles: string; // JSON string array
  api_base_url: string | null;
  api_key?: string | null; // API key for the model
  is_active: boolean;
  /**
   * @deprecated This field is no longer used. All models now use unified-api provider.
   * Previously used to determine routing: "y" = custom api_base_url, "n" = provider default
   */
  open_source_yn: string; // "y" or "n"
}

/**
 * ModelManagerDB - Server-based model configuration storage
 *
 * @deprecated This class is deprecated. Use gui/src/api/models.ts instead.
 * GUI now calls the API directly without going through core.
 * This class is kept for backward compatibility with JetBrains extension.
 *
 * This class handles model configuration fetching via HTTP API instead of config.yaml.
 * Models are stored on the server with user authentication.
 */
export class ModelManagerDB {
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
    console.log("[ModelDB] API base URL updated to:", url);
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

    console.log(`[ModelDB] ${options.method || "GET"} ${endpoint}`);

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
        console.error("[ModelDB] Unauthorized: Session expired");
        throw new Error("Unauthorized: Session expired");
      }

      return response;
    } catch (error: any) {
      console.error(`[ModelDB] Fetch error for ${endpoint}:`, error.message);
      throw error;
    }
  }

  /**
   * List models from server
   */
  async list(): Promise<ApiModel[]> {
    try {
      const response = await this.fetchWithAuth("/api/models");

      if (!response.ok) {
        throw new Error(`List models failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error: any) {
      console.error("[ModelDB] Error listing models:", error.message);
      return [];
    }
  }
}

// Create singleton instance
const modelManagerDB = new ModelManagerDB();

export default modelManagerDB;
