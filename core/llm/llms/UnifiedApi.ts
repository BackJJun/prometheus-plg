import { LLMOptions } from "../../index.js";
import OpenAI from "./OpenAI.js";

/**
 * UnifiedApi Provider
 *
 * Routes all chat requests to CONTINUE_API_URL/chat endpoint
 * regardless of model type, using OpenAI Chat Completions format.
 *
 * This replaces the previous architecture where:
 * - Open source models used custom api_base_url
 * - Proprietary models used provider-specific endpoints
 */
class UnifiedApi extends OpenAI {
  static providerName = "unified-api";
  static defaultOptions: Partial<LLMOptions> = {
    // apiBase must be provided from config.yaml server_api_url
  };

  protected _getEndpoint(
    endpoint: "chat/completions" | "completions" | "models" | "responses",
  ) {
    if (!this.apiBase) {
      throw new Error(
        "No API base URL provided. Please set CONTINUE_API_URL in environment.",
      );
    }

    // Override to use /chat instead of /v1/chat/completions
    if (endpoint === "chat/completions") {
      return new URL("chat", this.apiBase);
    }

    // For other endpoints, use parent implementation
    return super._getEndpoint(endpoint);
  }

  protected _convertArgs(options: any, messages: any[]): any {
    const args = super._convertArgs(options, messages);
    // Explicitly ensure model is set from options
    if (options.model) {
      args.model = options.model;
    }
    // requestId를 body에 추가 (재시도 시 서버 캐시 활용)
    if (options.requestId) {
      (args as any).requestId = options.requestId;
    }
    return args;
  }
}

export default UnifiedApi;
