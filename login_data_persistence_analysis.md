# 로그인 데이터 지속성 분석 (Login Data Persistence Analysis)

## 요약 (Summary)

플러그인을 언인스톨(uninstall)해도 로그인 데이터가 남아있는 이유는 **두 가지 저장소**에 데이터가 저장되기 때문입니다:

1. **IntelliJ 플러그인**: IntelliJ의 시스템 저장소 (PasswordSafe, PropertiesComponent)
2. **GUI (Webview)**: JCEF 브라우저의 localStorage

---

## 1. IntelliJ 플러그인 저장소

### 파일 위치

`extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthService.kt`

### 저장되는 데이터

#### A. PasswordSafe (암호화된 저장소)

- **Access Token** - Key: `ContinueAccessToken`
- **Refresh Token** - Key: `ContinueRefreshToken`

**저장 위치:**

```kotlin
// Line 149-174
private fun retrieveSecret(key: String): String? {
    val attributes = createCredentialAttributes(key, CREDENTIALS_USER)
    val passwordSafe: PasswordSafe = PasswordSafe.instance
    val credentials: Credentials? = passwordSafe[attributes!!]
    return credentials?.getPasswordAsString()
}

private fun storeSecret(key: String, secret: String) {
    val attributes = createCredentialAttributes(key, CREDENTIALS_USER)
    val passwordSafe: PasswordSafe = PasswordSafe.instance
    val credentials = Credentials(CREDENTIALS_USER, secret)
    passwordSafe.set(attributes!!, credentials)
}
```

**실제 저장 경로:**

- **Windows**: `%APPDATA%\JetBrains\<IDE_VERSION>\c.kdbx` (암호화된 데이터베이스)
- **macOS**: `~/Library/Application Support/JetBrains/<IDE_VERSION>/c.kdbx`
- **Linux**: `~/.config/JetBrains/<IDE_VERSION>/c.kdbx`

#### B. PropertiesComponent (일반 저장소)

- **Account ID** - Key: `ContinueAccountId`
- **Account Label** - Key: `ContinueAccountLabel`

**저장 위치:**

```kotlin
// Line 192-206
fun getAccountId(): String? {
    return PropertiesComponent.getInstance().getValue(ACCOUNT_ID_KEY)
}

fun setAccountId(id: String) {
    PropertiesComponent.getInstance().setValue(ACCOUNT_ID_KEY, id)
}

fun getAccountLabel(): String? {
    return PropertiesComponent.getInstance().getValue(ACCOUNT_LABEL_KEY)
}

fun setAccountLabel(label: String) {
    PropertiesComponent.getInstance().setValue(ACCOUNT_LABEL_KEY, label)
}
```

**실제 저장 경로:**

- **Windows**: `%APPDATA%\JetBrains\<IDE_VERSION>\options\other.xml`
- **macOS**: `~/Library/Application Support/JetBrains/<IDE_VERSION>/options/other.xml`
- **Linux**: `~/.config/JetBrains/<IDE_VERSION>/options/other.xml`

---

## 2. GUI (Webview) localStorage

### 파일 위치

- `gui/src/context/Auth.tsx` (Line 99, 153, 163)
- `gui/src/util/localStorage.ts`

### 저장되는 데이터

#### localStorage에 저장되는 항목:

1. **`access_token`** (plain string)

   ```typescript
   // Line 99 in Auth.tsx
   localStorage.setItem("access_token", accessToken);
   ```

2. **`user_session`** (JSON object)
   ```typescript
   // Line 101-104 in Auth.tsx
   setLocalStorage("user_session", {
     username,
     user_name: userName || "no user_name",
   });
   ```

### JCEF localStorage 저장 위치

JCEF (Java Chromium Embedded Framework)는 Chromium 기반 브라우저를 사용하므로, localStorage는 CEF의 cache_path에 저장됩니다.

**✅ 실제 확인된 저장 경로:**

- **Windows**: `%LOCALAPPDATA%\JetBrains\<IDE_VERSION>\jcef_cache\Local Storage\leveldb\`
  - 예시: `C:\Users\hs_yoo\AppData\Local\JetBrains\IdeaIC2025.2\jcef_cache\Local Storage\leveldb\`
  - localStorage 데이터는 LevelDB 형식으로 저장됨 (_.ldb, _.log 파일)
- **macOS**: `~/Library/Caches/JetBrains/<IDE_VERSION>/jcef_cache/Local Storage/leveldb/`
- **Linux**: `~/.cache/JetBrains/<IDE_VERSION>/jcef_cache/Local Storage/leveldb/`

**참고:**

- 현재 코드(`extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/browser/ContinueBrowser.kt`)에서는 명시적으로 cache_path를 설정하지 않고 있습니다.
- JBCefBrowser는 기본적으로 IntelliJ의 시스템 캐시 디렉토리 `jcef_cache`를 사용합니다.
- **이 디렉토리는 플러그인 언인스톨 시 삭제되지 않습니다.**
- localStorage 데이터는 Chromium의 LevelDB 형식으로 저장되어 바이너리 파일로 존재합니다.

---

## 3. 로그인 데이터 흐름

### 로그인 시:

```
1. 사용자가 LoginDialog에서 username/password 입력
   ↓
2. GUI에서 POST ${CONTINUE_API_URL}/login 요청
   ↓
3. 서버에서 access_token, user_name 응답
   ↓
4. GUI localStorage에 저장:
   - localStorage.setItem("access_token", accessToken)
   - setLocalStorage("user_session", {username, user_name})
   ↓
5. IntelliJ에서 sessionUpdate 이벤트 수신 (선택적)
   ↓
6. ContinueAuthService에 저장:
   - PasswordSafe: access_token, refresh_token
   - PropertiesComponent: account_id, account_label
```

### 앱 재시작 시:

```
1. Auth.tsx useEffect (Line 159-183) 실행
   ↓
2. localStorage에서 access_token, user_session 확인
   ↓
3. 데이터가 있으면 → 자동 로그인
4. 데이터가 없으면 → login(false, true) 강제 실행
```

---

## 4. 언인스톨 시 남는 데이터

### 삭제되지 않는 항목:

#### IntelliJ 플러그인:

✅ **PasswordSafe 데이터** (c.kdbx)

- Access Token
- Refresh Token

✅ **PropertiesComponent 데이터** (other.xml)

- Account ID
- Account Label

#### GUI (JCEF):

✅ **localStorage 데이터** (jcef-cache/)

- access_token
- user_session
- 기타 모든 localStorage 항목

### 이유:

IntelliJ는 플러그인을 언인스톨할 때 다음만 삭제합니다:

- 플러그인 JAR 파일
- 플러그인 전용 디렉토리 (있는 경우)

**삭제하지 않는 것:**

- IDE 레벨의 설정 파일 (PasswordSafe, PropertiesComponent)
- 시스템 캐시 (JCEF cache)
- 사용자 데이터

### 실제 확인된 파일 경로 (Windows 예시):

#### 1. PasswordSafe 암호화 데이터베이스:

```
C:\Users\hs_yoo\AppData\Roaming\JetBrains\IdeaIC2025.2\c.kdbx
```

- 크기: 약 1.4 KB
- 포함 데이터: Access Token, Refresh Token (암호화됨)

#### 2. PropertiesComponent 설정 파일:

```
C:\Users\hs_yoo\AppData\Roaming\JetBrains\IdeaIC2025.2\options\other.xml
```

- 포함 데이터: Account ID, Account Label (평문)

#### 3. JCEF localStorage (LevelDB):

```
C:\Users\hs_yoo\AppData\Local\JetBrains\IdeaIC2025.2\jcef_cache\Local Storage\leveldb\
```

- 파일 목록:
  - `000005.ldb`, `000088.ldb`, `000090.ldb` (데이터 파일)
  - `000091.log` (현재 로그)
  - `MANIFEST-000001` (데이터베이스 메타데이터)
  - `CURRENT`, `LOCK` (제어 파일)
- 포함 데이터: access_token, user_session 및 모든 localStorage 항목 (LevelDB 바이너리 형식)

---

## 5. 해결 방안

### 옵션 1: 플러그인 비활성화/언인스톨 시 데이터 정리

플러그인 Disposable 또는 uninstall 이벤트에서 데이터를 삭제:

```kotlin
// ContinueAuthService.kt에 추가
override fun dispose() {
    // Clear all stored credentials
    setAccessToken("")
    setRefreshToken("")
    setAccountId("")
    setAccountLabel("")
}
```

### 옵션 2: JCEF localStorage 초기화

플러그인 시작 시 또는 로그아웃 시 localStorage 초기화:

```kotlin
// ContinueBrowser.kt에서 JavaScript 실행
fun clearLocalStorage() {
    val jsCode = """
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_session');
    """.trimIndent()
    browser.executeJavaScriptAsync(jsCode)
}
```

### 옵션 3: 사용자에게 수동 정리 안내

README 또는 문서에 언인스톨 후 수동으로 삭제해야 할 경로 안내:

**Windows:**

```
%APPDATA%\JetBrains\<IDE_VERSION>\c.kdbx
%APPDATA%\JetBrains\<IDE_VERSION>\options\other.xml
%LOCALAPPDATA%\JetBrains\<IDE_VERSION>\jcef_cache\
```

**macOS:**

```
~/Library/Application Support/JetBrains/<IDE_VERSION>/c.kdbx
~/Library/Application Support/JetBrains/<IDE_VERSION>/options/other.xml
~/Library/Caches/JetBrains/<IDE_VERSION>/jcef_cache/
```

**Linux:**

```
~/.config/JetBrains/<IDE_VERSION>/c.kdbx
~/.config/JetBrains/<IDE_VERSION>/options/other.xml
~/.cache/JetBrains/<IDE_VERSION>/jcef_cache/
```

---

## 6. 권장 사항

1. **즉시 구현**: 로그아웃 시 모든 저장소 데이터 삭제
2. **중기 구현**: 플러그인 dispose 시 데이터 정리
3. **장기 구현**: 사용자에게 데이터 관리 옵션 제공 (설정에서 "로그인 정보 삭제" 버튼)

---

## 참고 자료

- IntelliJ Platform SDK: PasswordSafe
  https://plugins.jetbrains.com/docs/intellij/persisting-sensitive-data.html

- IntelliJ Platform SDK: PropertiesComponent
  https://plugins.jetbrains.com/docs/intellij/persisting-state-of-components.html

- JCEF localStorage persistence
  https://stackoverflow.com/questions/tagged/jcef+localstorage
