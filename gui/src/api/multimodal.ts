import { ChatMessage, MessagePart, PromptLog } from "core";
import { fromChatCompletionChunk } from "core/llm/openaiTypeConverters";
import { apiStreamRequest } from "./client";

const MULTIMODAL_ENDPOINT = "/chat";

type MultimodalPayload = {
  messages: ChatMessage[];
  model: string;
  requestId?: string;
  [key: string]: unknown;
};

function isImagePart(
  part: MessagePart,
): part is Extract<MessagePart, { type: "imageUrl" }> {
  return part.type === "imageUrl";
}

function getLastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return i;
    }
  }
  return -1;
}

function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

async function dataUrlToFile(dataUrl: string, index: number): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const extension = getExtensionFromMimeType(mimeType);
  return new File([blob], `attachment-${index}${extension}`, {
    type: mimeType,
  });
}

async function buildMultimodalFormData(
  payload: MultimodalPayload,
): Promise<{ formData: FormData; imageCount: number }> {
  const messages: ChatMessage[] = payload.messages.map((message) =>
    structuredClone(message),
  );
  const lastUserMessageIndex = getLastUserMessageIndex(messages);
  const imageParts: Extract<MessagePart, { type: "imageUrl" }>[] = [];

  if (lastUserMessageIndex >= 0) {
    const lastUserMessage = messages[lastUserMessageIndex] as Extract<
      ChatMessage,
      { role: "user" }
    >;
    if (Array.isArray(lastUserMessage.content)) {
      const textOnlyParts = lastUserMessage.content.filter((part) => {
        if (isImagePart(part)) {
          imageParts.push(part);
          return false;
        }
        return true;
      });
      messages[lastUserMessageIndex] = {
        ...lastUserMessage,
        content: textOnlyParts,
      };
    }
  }

  const formData = new FormData();
  formData.append(
    "payload",
    JSON.stringify({
      ...payload,
      messages,
    }),
  );

  for (let i = 0; i < imageParts.length; i += 1) {
    const file = await dataUrlToFile(imageParts[i].imageUrl.url, i + 1);
    formData.append("images", file);
  }

  return {
    formData,
    imageCount: imageParts.length,
  };
}

export function hasImageParts(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "imageUrl"),
  );
}

async function* parseOpenAiEventStream(
  response: Response,
): AsyncGenerator<ChatMessage[], PromptLog | undefined> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is not available");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), {
      stream: !done,
    });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const payload = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (payload && payload !== "[DONE]") {
        const chunk = JSON.parse(payload);
        const message = fromChatCompletionChunk(chunk);
        if (message) {
          yield [message];
        }
      }

      if (payload === "[DONE]") {
        return;
      }

      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      return;
    }
  }
}

export async function streamMultimodalChat(
  payload: MultimodalPayload,
  abortSignal: AbortSignal,
): Promise<AsyncGenerator<ChatMessage[], PromptLog | undefined>> {
  const { formData, imageCount } = await buildMultimodalFormData({
    ...payload,
    stream: true,
  });
  console.log("[MULTIMODAL_REQUEST]", {
    endpoint: MULTIMODAL_ENDPOINT,
    imageCount,
    messageCount: payload.messages.length,
    model: payload.model,
  });
  const response = await apiStreamRequest(MULTIMODAL_ENDPOINT, {
    method: "POST",
    body: formData,
    signal: abortSignal,
  });

  return parseOpenAiEventStream(response);
}
