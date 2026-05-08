# 2. 디렉토리 구조 및 핵심 폴더 역할

이 프로젝트는 하나의 레포지토리 내에 다양한 패키지가 모인 **Monorepo** 형태를 유사하게 띄고 있습니다. 인수인계를 받은 후 코드를 수정할 때 가장 자주 보게 될 위치들을 설명합니다.

```text
crux-prometheus-plg/
├── binary/             # 독립 실행형 바이너리 파일들을 빌드하는 관련 코드
├── core/               # ✨ 비즈니스 로직의 핵심 (가장 중요)
│   ├── llm/            # LLM API 통신부 (OpenAIProvider, Gemini 등 래퍼 및 프록시 강제 설정)
│   ├── context/        # 컨텍스트 수집 (터미널, 파일, 활성화된 문서 등) 및 토큰 길이 관리
│   └── protocol/       # IDE 플러그인과 웹뷰(UI) 간의 통신 프로토콜/인터페이스 정의
├── gui/                # ✨ 프론트엔드 UI 부분 (React + Tailwind CSS)
│   ├── src/components/ # Chat 보드, 커스텀 Login UI, 설정 모달 등 UI 컴포넌트
│   └── src/hooks/      # 웹뷰(IDE)와의 메시지 버스 연동 훅
├── extensions/         # IDE 확장에 특화된 브릿지 코드
│   ├── vscode/         # VSCode 전용 API 연동부 (Extension Host, src/extension.ts)
│   └── intellij/       # IntelliJ 전용 플러그인 코드 (Java/Kotlin, JCEF를 통해 웹뷰 오픈)
├── scripts/            # 빌드, 패키징 스크립트 모음
├── build-*.ps1         # VSCode 및 IntelliJ 용 빠른 빌드 파워쉘 스크립트 (루트 디렉토리)
└── package.json        # 전체 의존성 관리 및 NPM 실행 스크립트 (tsc:watch 등)
```

## 핵심 폴더 수정 가이드

1. **"채팅 UI나 팝업 창, 버튼 색상을 바꾸고 싶어요"**
   👉 `gui/` 디렉토리를 확인하세요. `gui/src/components/` 경로에 Login UI, 보안 스캔 결과 창 등 커스텀 뷰 컴포넌트가 모여 있습니다.
2. **"사내 서버로 보내는 프롬프트나 파라미터를 수정해야 해요"**
   👉 `core/` 디렉토리 내부를 살펴보세요. (특히 API 호출 전후 데이터를 가공하는 Provider 패키지 및 Slash 커맨드 코드 등)
3. **"VSCode(혹은 IntelliJ)에서 특정한 파일 시스템 이벤트를 잡아서 기능을 띄우고 싶어요 (예: 파일 저장 시 보안 스캔)"**
   👉 `extensions/vscode/` 혹은 `extensions/intellij/` 에 있는 IDE 종속적 코드를 수정해야 합니다. 여기에서 이벤트를 캐치한 후 `core`로 요청을 보내는 브릿지 역할이 이뤄집니다.
