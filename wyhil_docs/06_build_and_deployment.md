# 6. 플러그인 빌드 및 배포 방법

팀원들에게 배포하거나 사내 마켓/공유 폴더에 업로드할 빌드 결과물을 만드는 방법입니다.
프로젝트 루트 디렉토리에는 사용을 편하게 하기 위해 파워쉘(PowerShell) 등 스크립트가 준비되어 있습니다.

## 플러그인 빌드 및 배포 (.vsix, .zip)

수동 빌드(NPM, Gradle 등을 직접 호출)를 할 일은 거의 없으며, 프로젝트에 포함된 자동화 스크립트를 통해서 배포판을 생성합니다. 스크립트 실행을 위해 **파워쉘(PowerShell) 관리자 권한** 및 실행 권한 조치가 선행되어야 합니다.

### 권장 빌드 방식 (스크립트 실행)

아래 순서대로 진행하여 빌드 스크립트를 실행합니다.

1. **파워쉘(PowerShell) 관리자 권한 실행**

   - 윈도우 시작 메뉴에서 PowerShell을 검색한 후 `관리자 권한으로 실행`을 클릭합니다.

2. **프로젝트 경로로 이동 예시**

   ```powershell
   cd C:\workspace\crux-prometheus-plg
   ```

3. **스크립트 실행 권한 허용 (Execution Policy 설정)**

   - 파워쉘 스크립트(`.ps1`)가 시스템에서 정상적으로 실행되게끔 아래 명령어로 권한을 허용합니다.

   ```powershell
   Set-ExecutionPolicy RemoteSigned
   ```

4. ** npm i 목록 **

   - core, gui, binary, extensions/vscode 각각의 폴더에서 실행

   - gui에서 npm run build 실행

5. **빌드 스크립트 실행**

   - 이제 루트에 위치한 전용 스크립트로 사용할 타겟 IDE에 맞춰 빌드를 실행합니다. 내부적으로 패키징을 일괄 진행합니다.

   ```powershell
   # IntelliJ 플러그인 빌드 (.zip 생성)
   .\build-intellij-plugin.ps1
   => \extensions\intellij\build\distributions\ 에 생성

   # VSCode 플러그인 빌드 (.vsix 생성)
   .\build-vscode-plugin.ps1
   => \extensions\vscode\build\ 에 생성
   ```

6. ** 빌드 스크립트 시 메모리 이슈 **

   - 개인 pc 메모리는 남아 있는데 메모리 터짐 이슈가 생기는 이유.
   - Node(V8) 기본 old-space 한도(대략 2GB)근처 를 넘어서 터진 상황
     => vite build 프로세스의 힙 상한 도달

   해결 방안
   $env:NODE_OPTIONS="--max-old-space-size=8192"
   \*\* 그래도 이슈가 생긴다면 12288로 올려볼 것.

## 배포 시 주의점! (Versioning)

정식 배포를 하실 때는 루트 `package.json`과 `extensions/vscode/package.json`, 그리고 `extensions/intellij/gradle.properties` (또는 `build.gradle.kts`) 등에 기재된 버전 `x.y.z` 정보들이 통일되도록 Bump(버전업)를 해주는 것을 잊지 마세요.
