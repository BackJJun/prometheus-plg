# GPT-OSS Tool Call 자동 재시도 로직

## 문제

vLLM + GPT-OSS 모델에서 도구 호출 데이터가 `tool_calls` 필드 대신 `reasoning` 필드에 담기는 버그 발생.

## 감지 조건

**추론(reasoning) 필드의 마지막 데이터가 JSON이고 아래 키 중 하나를 포함하면 재시도:**

| 키         | 관련 도구                                   |
| ---------- | ------------------------------------------- |
| `filepath` | `read_file`, `create_new_file`, `edit_file` |
| `query`    | `grep_search`                               |

> **참고**: 실제 경험상 위 두 도구에서만 해당 현상 발생 확인됨

## 재시도 흐름

1. 스트림 완료 후 마지막 `thinking` 메시지 확인
2. 내용 끝부분에서 JSON 추출 시도
3. `filepath` 또는 `query` 키 포함 여부 확인
4. **감지 시**: 마지막 응답 삭제 → 자동 재시도 (최대 2회)

## 코드 상수

```typescript
// 재시도 트리거 키 (확장 가능)
export const TOOL_CALL_RETRY_KEYS = ["filepath", "query", "pattern"] as const;
```

## 예시

### 오류 케이스 (재시도 트리거)

```
reasoning_text=We need to modify main.py...{"filepath":"main.py"}
```

→ `filepath` 키 감지 → 재시도

### 정상 케이스

```
reasoning_text=Let me think about this approach...
tool_calls_list=[{'function': {'name': 'read_file', ...}}]
```

→ `tool_calls` 정상 → 재시도 안 함

## Request ID

재시도 시 서버에서 요약 반복을 방지하기 위해 `requestId`를 사용합니다:

1. 최초 요청 시 `crypto.randomUUID()`로 생성
2. 재시도 시 동일 `requestId` 전송
3. 서버에서 `requestId` 기반 캐시 활용

### 구현 위치

| 파일                                        | 내용                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `core/index.d.ts`                           | `LLMFullCompletionOptions`에 `requestId` 속성 정의 |
| `gui/src/redux/thunks/streamNormalInput.ts` | `requestId` 생성 및 서버 요청에 포함               |

> **서버 구현 필요**: 클라이언트에서 `requestId`를 전달하지만, 실제 캐시 로직은 자체 서버에서 구현해야 합니다.
