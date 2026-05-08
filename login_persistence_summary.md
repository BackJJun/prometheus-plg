# 로그인 데이터 지속성 분석 결과 요약

## 질문

플러그인을 재설치(언인스톨-인스톨)할 때 언인스톨 전에 로그인이 되어 있었으면 인스톨 후에도 로그인이 유지되는 이유는?

## 답변

플러그인 언인스톨 시 **3곳의 저장소**에 로그인 데이터가 남아있기 때문입니다.

---

## 📍 로그인 데이터가 저장되는 위치

### 1. **IntelliJ PasswordSafe** (암호화된 저장소)

- **경로**: `%APPDATA%\JetBrains\IdeaIC2025.2\c.kdbx`
- **저장 데이터**:
  - Access Token
  - Refresh Token
- **소스 코드**: `extensions/intellij/src/main/kotlin/.../auth/ContinueAuthService.kt` (Line 149-189)

### 2. **IntelliJ PropertiesComponent** (설정 파일)

- **경로**: `%APPDATA%\JetBrains\IdeaIC2025.2\options\other.xml`
- **저장 데이터**:
  - Account ID
  - Account Label
- **소스 코드**: `extensions/intellij/src/main/kotlin/.../auth/ContinueAuthService.kt` (Line 192-206)

### 3. **JCEF localStorage** (브라우저 캐시)

- **경로**: `%LOCALAPPDATA%\JetBrains\IdeaIC2025.2\jcef_cache\Local Storage\leveldb\`
- **저장 데이터**:
  - `access_token` (plain string)
  - `user_session` (JSON: username, user_name)
  - 기타 모든 localStorage 항목
- **소스 코드**: `gui/src/context/Auth.tsx` (Line 99, 101-104, 163-164)

---

## 🔄 로그인 복원 흐름

```
플러그인 재시작
    ↓
Auth.tsx useEffect 실행 (Line 159-183)
    ↓
localStorage에서 access_token, user_session 확인
    ↓
데이터가 있으면 → 자동 로그인 (setSession 호출)
데이터가 없으면 → 강제 로그인 다이얼로그 표시
```

---

## ❌ 왜 언인스톨 시 삭제되지 않는가?

IntelliJ는 플러그인 언인스톨 시 다음만 삭제합니다:

- ✅ 플러그인 JAR 파일
- ✅ 플러그인 전용 디렉토리

**삭제하지 않는 것:**

- ❌ IDE 레벨 설정 (PasswordSafe, PropertiesComponent)
- ❌ 시스템 캐시 (JCEF cache)
- ❌ 사용자 데이터

이는 IntelliJ의 의도된 동작으로, 사용자가 플러그인을 재설치할 때 설정을 유지하기 위함입니다.

---

## 💡 해결 방안

### 옵션 1: 로그아웃 시 모든 데이터 삭제 (권장)

`ContinueAuthService.kt`의 `signOut()` 메서드에서 이미 구현됨:

```kotlin
fun signOut() {
    setAccessToken("")
    setRefreshToken("")
    setAccountId("")
    setAccountLabel("")
    // ... localStorage도 GUI에서 삭제됨
}
```

### 옵션 2: 플러그인 Dispose 시 데이터 정리

```kotlin
override fun dispose() {
    setAccessToken("")
    setRefreshToken("")
    setAccountId("")
    setAccountLabel("")
}
```

### 옵션 3: 수동 삭제 안내

사용자에게 다음 경로를 수동으로 삭제하도록 안내:

- `%APPDATA%\JetBrains\<IDE_VERSION>\c.kdbx`
- `%APPDATA%\JetBrains\<IDE_VERSION>\options\other.xml`
- `%LOCALAPPDATA%\JetBrains\<IDE_VERSION>\jcef_cache\`

---

## 📄 상세 분석 문서

전체 분석 내용은 다음 파일을 참조하세요:

- [login_data_persistence_analysis.md](./.gemini/login_data_persistence_analysis.md)

---

## 🔍 관련 소스 코드

1. **IntelliJ 인증 서비스**:

   - `extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthService.kt`

2. **GUI 인증 컨텍스트**:

   - `gui/src/context/Auth.tsx`
   - `gui/src/util/localStorage.ts`

3. **JCEF 브라우저**:
   - `extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/browser/ContinueBrowser.kt`
