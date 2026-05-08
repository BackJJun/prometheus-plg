import { createAsyncThunk } from "@reduxjs/toolkit";
import { getModels } from "../../api";
import { ThunkApiType } from "../store";

const CHAT_SESSION_CONTEXT_LENGTH = 258_000;

/**
 * API Model structure from /api/models endpoint
 */
interface ApiModel {
  id: number;
  model_id: string;
  model_name: string;
  model_class: string;
  model_provider: string;
  model_roles: string; // JSON string array like "[\"chat\", \"edit\"]"
  api_base_url: string | null;
  api_key?: string | null; // API key for the model
  max_tokens?: number | null;
  is_active: boolean;
  /**
   * @deprecated No longer used. All models use unified-api provider.
   */
  open_source_yn: string; // "y" or "n"
  disable_agent_mode?: string; // "y" or "n"
}

/**
 * Transformed model structure for Redux state
 */
interface TransformedModel {
  title: string;
  provider: string;
  underlyingProviderName: string;
  model: string;
  apiKey?: string;
  apiBase?: string;
  contextLength?: number;
  roles?: string[];
  disableAgentMode?: boolean;
}

/**
 * Transform API model to application model format
 */
function transformApiModel(apiModel: ApiModel): TransformedModel {
  const transformed: TransformedModel = {
    title: apiModel.model_name,
    provider: "unified-api", // All models now use unified-api provider
    underlyingProviderName: "unified-api",
    model: apiModel.model_id,
    contextLength: CHAT_SESSION_CONTEXT_LENGTH,
  };

  // Add API key if provided
  if (apiModel.api_key) {
    transformed.apiKey = apiModel.api_key;
  }

  // Parse roles from JSON string
  try {
    const roles = JSON.parse(apiModel.model_roles);
    if (Array.isArray(roles)) {
      transformed.roles = roles;
    }
  } catch (e) {
    console.error("[loadRemoteModels] Failed to parse model_roles:", e);
  }

  // Set disableAgentMode flag
  if (apiModel.disable_agent_mode === "y") {
    transformed.disableAgentMode = true;
  }

  // Note: apiBase is now handled by UnifiedApi provider's defaultOptions
  // All requests will go to CONTINUE_API_URL/chat regardless of model type

  return transformed;
}

/**
 * Load models from /api/models endpoint
 * This thunk fetches models from the server instead of reading from config.yaml
 */
export interface LoadRemoteModelsResult {
  models: TransformedModel[];
  defaultModelId: string | null;
}

export const loadRemoteModels = createAsyncThunk<
  LoadRemoteModelsResult,
  void,
  ThunkApiType
>("models/loadRemote", async (_, { extra }) => {
  try {
    // Get access token from localStorage
    const accessToken = localStorage.getItem("access_token");

    if (!accessToken) {
      console.log("[loadRemoteModels] No access token found, skipping");
      return { models: [], defaultModelId: null };
    }

    console.log("[loadRemoteModels] Fetching models from API");

    // Use centralized API function
    const result = await getModels();

    console.log(
      `[loadRemoteModels] Received ${result.models.length} models from API (default_model_id: ${result.default_model_id})`,
    );

    // Transform API models to application format
    const transformedModels = result.models
      .filter((model) => model.is_active) // Only include active models
      .map(transformApiModel);

    console.log(
      `[loadRemoteModels] Transformed ${transformedModels.length} active models`,
    );

    return {
      models: transformedModels,
      defaultModelId: result.default_model_id,
    };
  } catch (error: any) {
    console.error("[loadRemoteModels] Failed to load models:", error.message);
    throw error;
  }
});
