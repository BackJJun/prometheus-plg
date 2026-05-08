# Crux Continue 플러그인 (Custom IDE Plugin)

이 프로젝트는 오픈소스 IDE 플러그인인 [Continue](https://github.com/continuedev/continue)를 베이스로 하여, 사내 자체 LLM 처리 서버(AI Proxy)를 연동하도록 커스텀한 사내용 AI 어시스턴트 프로젝트입니다. VSCode와 IntelliJ IDEA 환경을 모두 지원하며, 외부 LLM 공급자의 API를 직접 호출하는 대신 모든 요청을 사내 연동 서버로 일원화하여 보안과 통제를 강화했습니다.

## 주요 스펙 및 특징

- **지원 IDE 환경:** Visual Studio Code, IntelliJ IDEA
- **핵심 연동:** 기존 플러그인의 직접적인 외부 LLM API 호출(OpenAI, Gemini 등) 로직을 제거 및 수정하고 사내 **AI Proxy 서버(`crux-prometheus-bridge`)**로 트래픽을 라우팅합니다.
- **주요 커스텀 사항:**
  - 사내망 연동을 위한 전용 로그인(Authentication) 처리 및 미니 대시보드 UI 연동
  - Context Manager 개편 및 Token 길이 조절 로직 변경
  - 코드 저장(Save) 시 백그라운드에서 동작하는 **보안 스캔 및 자동 수정 제안(`scan/fix`)** 기능 탑재
  - IDE 테마 및 사내 디자인 가이드에 맞춘 UI 디자인 세부 조정

## 핵심 아키텍처 흐름

```text
[ IDE 사용자 (VSCode/IntelliJ) ]
             ↓ (코드 컨텍스트 및 채팅 입력)
[ 플러그인 프론트엔드 (gui/) ] ↔ [ 플러그인 비즈니스 로직 (core/) ]
                                        ↓ (HTTP Request)
                         [ 사내 AI Proxy 서버 (crux-prometheus-bridge) ]
                                        ↓ (API Request)
                         [ 실제 LLM (OpenAI, Gemini, vLLM 등) ]
```

## 상세 문서

프로젝트를 처음 담당하는 분을 위한 상세 내용은 `wyhil_docs/` 폴더 내에 기능과 목적별로 분리되어 작성되어 있습니다. 프로젝트 구조, 로컬 개발/디버깅 방법, 빌드/배포 프로세스 등을 확인하려면 아래 문서들을 참고해 주세요.

1. [프로젝트 개요 및 아키텍처 (`01_project_overview.md`)](wyhil_docs/01_project_overview.md)
2. [디렉토리 구조 및 핵심 폴더 역할 (`02_directory_structure.md`)](wyhil_docs/02_directory_structure.md)
3. [플러그인 주요 커스텀 사항 요약 (`03_core_customizations.md`)](wyhil_docs/03_core_customizations.md)
4. [AI Proxy 서버 API 연동 규격 (`04_api_integration.md`)](wyhil_docs/04_api_integration.md)
5. [로컬 개발 환경 및 실행 가이드 (`05_local_development.md`)](wyhil_docs/05_local_development.md)
6. [플러그인 빌드 및 배포 방법 (`06_build_and_deployment.md`)](wyhil_docs/06_build_and_deployment.md)
7. [알려진 이슈 및 백로그 (`07_known_issues_and_todos.md`)](wyhil_docs/07_known_issues_and_todos.md)
