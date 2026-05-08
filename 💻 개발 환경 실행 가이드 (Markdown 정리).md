# 💻 개발 환경 실행 가이드 (Markdown 정리)

## 🧪 터미널 1: GUI 개발 서버

```powershell
cd d:\temp\crux-continue-custom\gui
npm run dev
```

- GUI 실행 주소: **[http://localhost:5173](http://localhost:5173/)**

- 코드 변경 시 자동 리로드됩니다.

---

## 🧪 터미널 2: Core 개발 서버

.env 파일에서

```powershell
cd d:\temp\crux-continue-custom\binary
```

### 🔧 처음 한 번만 (또는 Core 코드 변경 시) 실행

```powershell
npm run rebuild
```

### ▶ Core 서버 실행

```powershell
#$env:PROJECT_DIR="d:\temp\crux-continue-custom"
$env:PROJECT_DIR="c:\workspace\Prometheus\crux-prometheus-plg(플러그인)"
($env:DEBUG_RAW_CHAT_STREAM="1" 터미널에서 스트리밍 데이터 어떻게 넘어오는지 보고싶을때 사용)
node core-dev-server.js
```

- Core 로직 실행

- `extensions/.continue-debug` 디렉토리를 설정 폴더로 사용

---

## 🧪 터미널 3: IntelliJ 플러그인 실행

```powershell
 cd d:\temp\crux-continue-custom\extensions\intellij

```

### ▶ 환경변수 설정 후 IntelliJ 실행

```powershell
$env:GUI_URL="http://localhost:5173/jetbrains_index.html"
$env:USE_TCP="true"
.\gradlew runIde
```

- 새 IntelliJ 인스턴스가 실행됨

- `manual-testing-sandbox` 프로젝트가 자동으로 열림

---

# 🔄 코드 변경 시 리로드 방법

## 🎨 GUI 코드 변경

- **자동 리로드됨 → 추가 작업 필요 없음**

## ⚙ Core 코드 변경

```powershell
# 터미널 2에서 Ctrl + C 후 다시 실행
cd d:\temp\crux-continue-custom\binary
npm run rebuild
$env:PROJECT_DIR="d:\temp\crux-continue-custom"
node core-dev-server.js
```

## 🧩 IntelliJ Extension 코드 변경

- 실행 중 IntelliJ에서:  
  **Ctrl + Shift + A → "Reload Changed Classes" 실행**

- 또는 터미널 3에서:

  ```powershell
  Ctrl + C 후 다시 .\gradlew runIde
  ```

---

# 💡 간편 스크립트 (선택사항)

## ▶ run-core-dev.ps1

(binary 폴더에 생성)

```powershell
$env:PROJECT_DIR = "d:\temp\crux-continue-custom"
node core-dev-server.js
```

## ▶ run-plugin-dev.ps1

(extensions/intellij 폴더에 생성)

```powershell
$env:GUI_URL = "http://localhost:5173/jetbrains_index.html"
$env:USE_TCP = "true"
.\gradlew runIde
```

### 실행 방법

```powershell
.\run-core-dev.ps1
.\run-plugin-dev.ps1
```

---

# ✅ 요약

각 터미널에서 다음 명령 실행:

| 터미널 | 위치                | 실행                                                          |
| ------ | ------------------- | ------------------------------------------------------------- |
| **1**  | gui                 | `npm run dev`                                                 |
| **2**  | binary              | `npm run rebuild` → `node core-dev-server.js` (환경변수 필요) |
| **3**  | extensions/intellij | `.\gradlew runIde` (환경변수 필요)                            |

---

이제 **IntelliJ 설정 없이도 CLI만으로 개발 환경을 실행**할 수 있습니다! 🚀
