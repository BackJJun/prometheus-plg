import { apiRequest } from "./client";
import {
  ListSessionsParams,
  ListSessionsResponse,
  SessionData,
  SessionMetadata,
} from "./types";

function sanitizeSessionHistoryForPersistence(
  session: SessionData,
): SessionData {
  return {
    ...session,
    history: session.history.filter(
      (item) => item?.message?.role !== "thinking",
    ),
  };
}

/**
 * GET /api/sessions
 */
export async function listSessions(
  params?: ListSessionsParams,
): Promise<SessionMetadata[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append("limit", params.limit.toString());
  if (params?.offset) queryParams.append("offset", params.offset.toString());

  const endpoint = `/api/sessions${queryParams.toString() ? `?${queryParams}` : ""}`;
  const response = await apiRequest<ListSessionsResponse>(endpoint);

  return response.data?.sessions || [];
}

/**
 * GET /api/sessions/{session_id}
 */
export async function getSession(sessionId: string): Promise<SessionData> {
  const response = await apiRequest<SessionData>(`/api/sessions/${sessionId}`);

  if (!response.data) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return response.data;
}

/**
 * POST /api/sessions
 */
export async function saveSession(session: SessionData): Promise<void> {
  const sanitizedSession = sanitizeSessionHistoryForPersistence(session);
  await apiRequest("/api/sessions", {
    method: "POST",
    body: JSON.stringify(sanitizedSession),
  });
}

/**
 * DELETE /api/sessions/{session_id}
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

/**
 * DELETE /api/sessions
 */
export async function deleteAllSessions(): Promise<void> {
  await apiRequest("/api/sessions", {
    method: "DELETE",
  });
}

/**
 * GET /api/sessions/last/data
 */
export async function getLastSession(
  workspaceDirectory: string,
): Promise<SessionData | null> {
  try {
    const endpoint = `/api/sessions/last/data?workspace_directory=${encodeURIComponent(workspaceDirectory)}`;
    const response = await apiRequest<SessionData>(endpoint);

    if (!response.data || !response.data.sessionId) {
      return null;
    }

    return response.data;
  } catch (error) {
    // 404 means no last session
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
}
