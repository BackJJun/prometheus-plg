import { apiStreamRequest } from "./client";
import { ChatRequest } from "./types";

/**
 * POST /chat (streaming)
 *
 * @deprecated Currently not used. Chat streaming still goes through
 * ideMessenger.llmStreamChat() -> core/llm/streamChat.ts
 *
 * This will be migrated in Phase 2 after other APIs are stable.
 */
export async function streamChat(request: ChatRequest): Promise<Response> {
  return apiStreamRequest("/chat", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
