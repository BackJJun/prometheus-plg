# 1. 프로젝트 개요 및 아키텍처

## 개요 (Overview)

이 프로젝트(`crux-prometheus-plg`)는 사내 개발자들의 생산성과 코드 보안성을 높이기 위해 오픈 소스인 **Continue** 플러그인을 포크(Fork)하여 만들어진 커스텀 IDE 플러그인입니다.

기존의 Continue 플러그인은 개발자의 로컬 머신에서 OpenAI나 Anthropic, Gemini 등 외부 통신망의 API로 직접 코드를 전송합니다. 반면 본 커스텀 프로젝트에서는 모든 LLM 인터렉션을 **사내의 Proxy 처리 서버(`crux-prometheus-bridge`)**로 통과하도록 아키텍처를 변경했습니다. 이를 통해 사내 보안 검토를 거치거나 내부망 모델(vllm 등)을 유연하게 스위칭하여 사용할 수 있습니다.

### 사내 서버로의 요청 단일화

- 코어 폴더(`core/llm/`) 내의 프로바이더 설정 로직들이 수정되어, 기존 모델 프로바이더 세팅과 무관하게 `crux-prometheus-bridge` 서버의 주소를 향해 HTTP 통신을 하도록 고정되어 있습니다.
- 백엔드(`crux-prometheus-bridge`)의 주소는 사용자가 Config UI를 통해 설정하거나 기본 사내 환경 변수 등으로 덮어씌워져 사용됩니다.
