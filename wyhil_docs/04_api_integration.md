# 4. AI Proxy 서버 API 연동 규격

플러그인 자체에서 직접 백엔드 로직을 처리하지 않고, 무거운 LLM 연산과 사내 보안 정책 적용은 모두 **`ai_proxy`** 서버에서 담당합니다. 플러그인(`core/`)은 아래와 같은 API들을 주요하게 호출합니다.

## 4.1 기본 Chat / Autocomplete API (`/chat/completions`)

- **목적:** 사용자가 입력한 프롬프트 및 컨텍스트(파일 트리, 터미널 에러 등)를 LLM에 전송하고, Streaming Web Socket 혹은 HTTP Streaming 형태로 응답을 받아옵니다.
- **주요 파라미터:** `messages`, `model` (AI Proxy 내부에서 vllm, gpt-oss 등 결정), `temperature` 등 기본 OpenAI 호환 규격을 따릅니다.
- **플러그인 위치:** `core/llm/` 내부의 Provider 구현체들을 확인하세요.

## 4.2 Security Scan API (`/scan`)

- **목적:** 파일이 저장될 때나 커맨드를 통해 코드 스니펫(전체 파일 등)을 보안 서버로 보냅니다. 서버는 정적 분석(예: bearer, 자체 룰)을 통해 취약점 리포트를 마크다운 텍스트 폼으로 반환합니다.
- **Request Body:** `{ "file_name": string, "code": string }` 형태 (혹은 텍스트)
- **Response:** 취약점 내역이 담긴 마크다운 (Markdown) 데이터. 200 외의 응답 에러 핸들링이 플러그인 쪽에 추가로 구현되어 있습니다.

## 4.3 보안 자동 수정 API (`/scan/fix`)

- **목적:** `/scan`에서 탐지된 문제에 대해 LLM(`gpt-4o`, `gpt-oss-120b` 등 설정된 모델)이 Tool Call 방식으로 자동으로 수정안 제안(Diff)을 내려줍니다.
- **특징:** Streaming을 쓰지 않고 Single Response(`tool_calls` 배열 포함) 형태로 데이터를 받도록 개편되었으며, VSCode 및 IntelliJ 환경에서 이 Payload를 파싱하여 마치 IDE의 Refactor 기능을 쓰듯 **Suggestion UI**를 띄워줍니다.

## 4.4 사용자 인증 및 세션 관리 (Auth Flow)

사내 서버와 통신할 때는 보안을 위해 모든 API 요청에 **인증 토큰(Token)**을 담아서 보냅니다.

- **요청 시 토큰 포함:** 플러그인이 서버(`/chat/completions`, `/scan` 등)로 HTTP 요청을 보낼 때 헤더 등에 인증 토큰을 삽입합니다.
- **토큰 만료 처리 (401 Unauthorized):**
  - 서버에서 토큰 만료로 인해 `401` 에러 응답이 떨어지면, 플러그인은 즉시 **Refresh API**를 호출하여 토큰 갱신을 시도합니다.
  - Refresh가 성공하면 발급된 새 토큰을 저장하고, 방금 실패했던 이전 API 요청을 **자동으로 다시 전송(Retry)**하여 사용자 경험 단절을 막습니다.
  - 만약 Refresh API 호출마저 실패한다면, 토큰이 완전히 만료된 것으로 간주하여 **로그아웃(Logout)** 처리를 진행하고 사용자를 로그인 화면으로 돌려보냅니다.
- **관련 UI:** `gui/` 팝업 대시보드 쪽에서 상태를 전시하며, Health Check(확인전 등) 및 연결 유효성을 점검합니다.
