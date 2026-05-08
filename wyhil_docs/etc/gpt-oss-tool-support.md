# GPT OSS Tool Call Support

이 문서는 GPT OSS 모델의 네이티브 tool call 지원을 위한 수정 사항을 설명합니다.

## 문제 요약

`/crux-continue-custom`에서 GPT OSS 모델 사용 시 tool call이 제대로 동작하지 않았습니다.

### 원인

`PROVIDER_TOOL_SUPPORT` (`core/llm/toolSupport.ts`)에 `unified-api` provider가 정의되어 있지 않아, API 요청 시 네이티브 `tools` 파라미터가 포함되지 않았습니다.

### 증상

- API 요청에 `tools` 배열이 없음
- 시스템 메시지에만 tool 지침이 텍스트로 포함됨
- GPT OSS 모델이 비표준 형식으로 tool call 출력
- 클라이언트가 tool call을 파싱하지 못함

## 수정 내용

### 클라이언트 측 (완료)

**파일**: `core/llm/toolSupport.ts`

`PROVIDER_TOOL_SUPPORT`에 `unified-api` provider 추가:

```typescript
"unified-api": (model) => {
  const lower = model.toLowerCase();
  if (lower.includes("gpt-oss")) return true;
  if (lower.startsWith("gpt-4") || lower.startsWith("gpt-5") || lower.startsWith("o3")) return true;
  if (lower.includes("claude")) return true;
  return false;
},
```

### 서버 측 (TODO)

서버에서 tool call 응답을 처리할 때 다음 사항을 고려해야 합니다:

1. **요청 데이터 전달**: 클라이언트에서 받은 `tools` 배열을 vLLM/GPT OSS 서버에 그대로 전달
2. **응답 형식 처리**: GPT OSS의 tool call 응답을 OpenAI 호환 형식으로 변환
3. **parallel_tool_calls**: `false`로 설정하여 순차적 tool call 보장

#### 예상 요청 형식

```json
{
  "messages": [...],
  "model": "openai/gpt-oss-120b",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "...",
        "parameters": {...}
      }
    }
  ],
  "parallel_tool_calls": false,
  "stream": true
}
```

## 관련 파일

| 파일                                                        | 역할                           |
| ----------------------------------------------------------- | ------------------------------ |
| `core/llm/toolSupport.ts`                                   | Provider별 tool 지원 여부 결정 |
| `gui/src/redux/thunks/streamNormalInput.ts`                 | Tool 포함 여부 결정 로직       |
| `core/llm/llms/UnifiedApi.ts`                               | Unified API 엔드포인트 호출    |
| `core/tools/systemMessageTools/interceptSystemToolCalls.ts` | Tool call 파싱                 |

## 테스트 방법

1. GPT OSS 모델 선택
2. 파일 첨부 후 코드 수정 요청
3. 서버 로그에서 `tools` 배열 포함 확인
4. Tool call이 정상 실행되는지 확인
