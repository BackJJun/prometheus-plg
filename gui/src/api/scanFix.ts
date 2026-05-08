import { apiRequest } from "./client";

/**
 * /scan/fix API 요청/응답 타입
 * 채팅 API(llm/streamChat)와 동일한 요청 구조를 사용하되,
 * filePath와 scanResult를 추가합니다.
 */
export interface ScanFixRequest {
  messages: any[];
  completionOptions: any;
  title: string;
  modelDescription?: any;
  filePath: string;
  scanResult: any;
  access_token?: string;
}

export interface ScanFixResponse {
  choices?: Array<{
    message?: {
      role: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  error?: string;
}

/**
 * POST /scan/fix (non-streaming)
 *
 * 보안 검사 결과를 기반으로 코드 수정을 요청합니다.
 * 채팅 API와 동일한 요청 데이터를 사용하며, 응답은 스트리밍 없이 JSON으로 반환됩니다.
 */
export async function scanFix(request: ScanFixRequest) {
  return apiRequest<ScanFixResponse>("/scan/fix", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
