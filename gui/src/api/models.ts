import { apiRequest } from "./client";
import { ApiModel } from "./types";

export interface GetModelsResult {
  models: ApiModel[];
  default_model_id: string | null;
}

/**
 * GET /api/models
 */
export async function getModels(): Promise<GetModelsResult> {
  const response = await apiRequest<{
    models: ApiModel[];
    default_model_id?: string | null;
  }>("/api/models");

  return {
    models: response.data?.models || [],
    default_model_id: response.data?.default_model_id ?? null,
  };
}
