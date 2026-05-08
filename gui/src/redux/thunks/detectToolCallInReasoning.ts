/**
 * GPT-OSS Tool Call 감지 유틸리티
 *
 * vLLM + GPT-OSS 모델에서 도구 호출 데이터가 tool_calls 대신
 * reasoning 필드에 담기는 버그를 감지합니다.
 */

/**
 * 재시도를 트리거하는 JSON 키 목록
 * 실제 경험상 filepath, query 두 키에서만 해당 현상 발생 확인됨
 */
export const TOOL_CALL_RETRY_KEYS = [
  "filepath",
  "path",
  "contents",
  "content",
  "command",
  "dirPath",
  "recursive",
  "query",
  "codeAbove",
  "codeBelow",
  "pattern",
] as const;

export interface ToolCallInReasoningResult {
  detected: boolean;
  suspectedToolName?: string;
  jsonData?: Record<string, unknown>;
}

/**
 * reasoning 필드 끝부분에서 JSON을 추출하고
 * 도구 호출 키가 포함되어 있는지 확인합니다.
 */
export function detectToolCallInReasoning(
  reasoningContent: string | undefined,
): ToolCallInReasoningResult {
  if (!reasoningContent?.trim()) {
    return { detected: false };
  }

  const text = reasoningContent.trim();

  // reasoning 끝부분에서 JSON 추출 시도
  const lastBraceIndex = text.lastIndexOf("{");

  if (lastBraceIndex === -1) {
    return { detected: false };
  }

  const potentialJson = text.slice(lastBraceIndex);

  try {
    // 닫는 중괄호 찾기 (중첩 고려)
    let braceCount = 0;
    let endIndex = -1;
    for (let i = 0; i < potentialJson.length; i++) {
      if (potentialJson[i] === "{") braceCount++;
      if (potentialJson[i] === "}") braceCount--;
      if (braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }

    if (endIndex === -1) {
      return { detected: false };
    }

    const jsonStr = potentialJson.slice(0, endIndex);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // 도구 호출 키 확인
    const matchedKey = TOOL_CALL_RETRY_KEYS.find((key) => key in parsed);

    if (matchedKey) {
      return {
        detected: true,
        jsonData: parsed,
        suspectedToolName: inferToolName(matchedKey, parsed),
      };
    }
  } catch {
    // JSON 파싱 실패 - 정상 reasoning으로 간주
  }

  return { detected: false };
}

/**
 * 감지된 키를 기반으로 도구명 추정
 */
function inferToolName(key: string, data: Record<string, unknown>): string {
  if (key === "filepath") {
    if ("contents" in data || "content" in data) {
      return "create_new_file";
    }
    return "read_file";
  }
  if (key === "query") {
    return "grep_search";
  }
  return "unknown";
}
