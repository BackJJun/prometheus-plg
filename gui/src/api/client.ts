import { store } from "../redux/store";
import { ApiResponse, LoginResponse } from "./types";

/**
 * Get API base URL dynamically from config
 * Priority: config.yaml serverApiUrl > build-time DEFAULT_SERVER_API_URL > fallback
 */
export function getApiBaseUrl(): string {
  const state = store.getState();
  const serverApiUrl = state.config.config.serverApiUrl;

  // Fallback chain: config.yaml → build-time env → hardcoded default
  return (
    serverApiUrl ||
    process.env.DEFAULT_SERVER_API_URL ||
    "http://localhost:8000"
  );
}

// Refresh state management
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;
let failedRequestsQueue: Array<{
  resolve: (value: any) => void;
  reject: (error: any) => void;
  config: {
    endpoint: string;
    options: RequestInit;
  };
}> = [];

/**
 * Check if endpoint is public (doesn't require authentication)
 */
function isPublicEndpoint(endpoint: string): boolean {
  return (
    endpoint === "/login" ||
    endpoint === "/refresh" ||
    endpoint.startsWith("/health")
  );
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<LoginResponse> {
  const refreshToken = localStorage.getItem("refresh_token");

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Use raw fetch (not apiRequest) to avoid infinite loop
  const response = await fetch(`${getApiBaseUrl()}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  const data: LoginResponse = await response.json();

  // Update tokens in localStorage
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);

  console.log("[API Client] Tokens refreshed successfully");

  return data;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Get access token from localStorage
 */
function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

/**
 * Handle token refresh and retry logic
 */
async function handleTokenRefresh<T>(
  endpoint: string,
  options: RequestInit,
): Promise<ApiResponse<T>> {
  // If already refreshing, queue this request
  if (isRefreshing && refreshPromise) {
    console.log(
      `[API Client] Queueing request to ${endpoint} (refresh in progress)`,
    );
    return new Promise((resolve, reject) => {
      failedRequestsQueue.push({
        resolve,
        reject,
        config: { endpoint, options },
      });
    });
  }

  // Start refresh process
  console.log(`[API Client] Starting refresh (triggered by ${endpoint})`);
  isRefreshing = true;

  // Queue the current request that triggered the refresh
  const currentRequestPromise = new Promise<ApiResponse<T>>(
    (resolve, reject) => {
      failedRequestsQueue.push({
        resolve,
        reject,
        config: { endpoint, options },
      });
    },
  );

  refreshPromise = (async () => {
    try {
      console.log("[API Client] Refreshing access token...");

      // Call refresh endpoint
      await refreshAccessToken();

      const queue = [...failedRequestsQueue];
      failedRequestsQueue = [];

      console.log(
        `[API Client] Token refreshed, retrying ${queue.length} queued requests`,
      );

      // Reset flags BEFORE retrying to allow new refresh cycles during retry
      isRefreshing = false;
      refreshPromise = null;

      for (const { resolve, reject, config } of queue) {
        try {
          // Remove old Authorization header from options
          const retryOptions = { ...config.options };
          if (retryOptions.headers) {
            const headers = {
              ...(retryOptions.headers as Record<string, string>),
            };
            delete headers["Authorization"];
            retryOptions.headers = headers;
          }

          // apiRequest will add the new token automatically
          // If this gets 401, it will start a NEW refresh cycle
          const result = await apiRequest(config.endpoint, retryOptions);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }
    } catch (error) {
      console.error("[API Client] Token refresh failed:", error);

      // Reset flags
      isRefreshing = false;
      refreshPromise = null;

      // Refresh failed - logout
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_session");
      window.dispatchEvent(new CustomEvent("auth:logout"));

      // Reject all queued requests
      const queue = [...failedRequestsQueue];
      failedRequestsQueue = [];

      for (const { reject } of queue) {
        reject(new ApiError("Session expired", 401));
      }

      throw error;
    }
  })();

  await refreshPromise;

  // Return the result of the current request (already retried in the queue)
  return currentRequestPromise;
}

/**
 * Base fetch wrapper with authentication and error handling
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const isPublic = isPublicEndpoint(endpoint);
  const accessToken = getAccessToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Add Authorization header for protected endpoints
  if (!isPublic && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${getApiBaseUrl()}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized for protected endpoints
    if (response.status === 401 && !isPublic) {
      return handleTokenRefresh<T>(endpoint, options);
    }

    // Parse response
    let data: T | undefined;
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      data = await response.json();
    }

    if (!response.ok) {
      const errorMessage = (data as any)?.error || response.statusText;
      throw new ApiError(errorMessage, response.status, data);
    }

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or other errors
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      0,
    );
  }
}

/**
 * Streaming fetch for SSE/streaming responses
 */
export async function apiStreamRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const isPublic = isPublicEndpoint(endpoint);
  const accessToken = getAccessToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Add Authorization header for protected endpoints
  if (!isPublic && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${getApiBaseUrl()}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 for streaming requests
  if (response.status === 401 && !isPublic) {
    // Wait for refresh if already in progress
    if (isRefreshing && refreshPromise) {
      await refreshPromise;
      // Retry with new token
      return apiStreamRequest(endpoint, options);
    }

    // Trigger refresh
    await handleTokenRefresh(endpoint, options);
    // Retry with new token
    return apiStreamRequest(endpoint, options);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(errorText || response.statusText, response.status);
  }

  return response;
}

/**
 * Check server health status
 */
export async function checkHealth(): Promise<{
  status: string;
  timestamp?: string;
}> {
  const response = await apiRequest<{ status: string; timestamp?: string }>(
    "/health",
  );
  if (!response.data) {
    throw new Error("No data received from health check");
  }
  return response.data;
}
