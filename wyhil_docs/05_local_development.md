# 5. 로컬 개발 환경 및 실행 가이드

Continue 플러그인 코드를 수정하고 로컬 IDE에 띄워서 테스트하는 방법입니다. 프로젝트 루트에서 기본적으로 `Node.js`가 깔려있어야 합니다 (버전은 `nvmrc` 혹은 최신 LTS 권장).

## 5.1 사전 준비 (공통)

1. 레포지토리를 Clone 받습니다.
2. 루트 디렉토리에서 NPM 패키지들을 설치합니다.
   ```bash
   npm install
   ```

## 5.2 전체 Background Build 스크립트 실행

Typescript 파일들을 지속적으로 컴파일 해주기 위해, IDE 디버그 세션을 띄우기 전에 아래 명령어를 터미널에 하나 띄워두세요.

```bash
npm run tsc:watch
```

_(수정된 코드가 실시간으로 `.js`로 변환되어 적용됩니다.)_

## 5.3 VSCode 플러그인 로컬 실행 방법

1. VSCode에서 `crux-continue-custom` 루트 디렉토리를 엽니다.
2. 좌측 `Run and Debug (Ctrl+Shift+D)` 패널로 이동합니다.
3. 드롭다운에서 **`Extension (VS Code)`** 또는 **`Run Extension`** 프로필을 선택하고 `F5`키를 누릅니다.
4. 새로운 VSCode 창(Extension Development Host)이 열리면, 우측 하단에서 Continue 아이콘을 열거나 명령 팔레트(`Ctrl+Shift+P`)에서 Continue를 실행해보며 테스트합니다.

## 5.4 IntelliJ 플러그인 로컬 실행 방법

IntelliJ 플러그인은 Kotlin/Java 기반이므로 `extensions/intellij` 폴더 하위를 중심으로 빌드됩니다.

1. `extensions/intellij/` 디렉토리를 IntelliJ IDEA로 엽니다. (혹은 루트에서 열고 해당 폴더를 Gradle 모듈로 인식시킵니다.)
2. 우측 `Gradle` 패널 안쪽 Task 리스트 ➡️ `intellij` ➡️ **`runIde`** 를 더블클릭 하거나, 터미널에서 아래 명령을 칩니다.
   ```bash
   cd extensions/intellij
   ./gradlew runIde
   ```
3. 테스트용 샌드박스 IntelliJ 창이 새로 열리고, 해당 인스턴스에 개발 중인 플러그인이 로드되어 나타납니다.

## 5.5 프론트엔드(GUI)만 빠르게 개발하기 (Hot Reload)

UI 수정을 할 때는 무거운 IDE 빌드를 전부 할 필요가 없습니다. (테마가 적용 안되어 보일 수는 있음)

1. `cd gui`
2. `npm run dev` (설정된 React/Vite/Webpack 서버 실행)
3. `http://localhost:5173` 등 주어진 포트로 들어가서 UI 컴포넌트 단위 테스트를 진행합니다.
