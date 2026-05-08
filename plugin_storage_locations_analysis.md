# 플러그인 데이터 저장 위치 전체 분석

## 📋 개요

IntelliJ 플러그인에서 로그인 데이터 외에 팝업 설정, 사용자 설정 등이 저장되는 모든 위치를 분석한 결과입니다.

---

## 🗂️ 데이터 저장 위치 요약

### 1. **IntelliJ PasswordSafe** (암호화된 저장소)

📁 **위치**: `C:\Users\hs_yoo\AppData\Roaming\JetBrains\IntelliJIdea2025.2\c.kdbx`

**저장 데이터**:

- Access Token (암호화)
- Refresh Token (암호화)

**소스 코드**: [ContinueAuthService.kt](file:///d:/temp/crux-continue-custom/extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthService.kt#L149-L189)

---

### 2. **PropertiesComponent** (IntelliJ 설정 파일)

📁 **위치**: `C:\Users\hs_yoo\AppData\Roaming\JetBrains\IntelliJIdea2025.2\options\other.xml`

**저장 데이터**:

- Account ID (평문)
- Account Label (평문)

**소스 코드**: [ContinueAuthService.kt](file:///d:/temp/crux-continue-custom/extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthService.kt#L192-L206)

**사용 예시**:

```kotlin
// 읽기
PropertiesComponent.getInstance().getValue(ACCOUNT_ID_KEY)

// 쓰기
PropertiesComponent.getInstance().setValue(ACCOUNT_ID_KEY, id)
```

---

### 3. **PersistentStateComponent** (플러그인 설정)

📁 **위치**: `C:\Users\hs_yoo\AppData\Roaming\JetBrains\IntelliJIdea2025.2\options\ContinueExtensionSettings.xml`

> [!IMPORTANT] > **이 파일이 팝업 "다시 보지 않기" 및 기타 설정이 저장되는 핵심 위치입니다!**

**저장 데이터**:

- `shownWelcomeDialog`: Boolean - 환영 다이얼로그 표시 여부
- `lastSelectedInlineEditModel`: String - 마지막 선택한 인라인 편집 모델
- `remoteConfigServerUrl`: String - 원격 설정 서버 URL
- `remoteConfigSyncPeriod`: Int - 원격 설정 동기화 주기
- `userToken`: String - 사용자 토큰
- `enableTabAutocomplete`: Boolean - 탭 자동완성 활성화
- `displayEditorTooltip`: Boolean - 에디터 툴팁 표시
- `showIDECompletionSideBySide`: Boolean - IDE 완성 나란히 표시
- `continueTestEnvironment`: String - 테스트 환경 설정

**소스 코드**: [ContinueExtensionSettingsService.kt](file:///d:/temp/crux-continue-custom/extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/services/ContinueExtensionSettingsService.kt#L75-L91)

**State 클래스 정의**:

```kotlin
@State(
    name = "com.github.continuedev.continueintellijextension.services.ContinueExtensionSettings",
    storages = [Storage("ContinueExtensionSettings.xml")]
)
open class ContinueExtensionSettings : PersistentStateComponent<ContinueExtensionSettings.ContinueState> {

    class ContinueState {
        var lastSelectedInlineEditModel: String? = null
        var shownWelcomeDialog: Boolean = false
        var remoteConfigServerUrl: String? = null
        var remoteConfigSyncPeriod: Int = 60
        var userToken: String? = null
        var enableTabAutocomplete: Boolean = true
        var displayEditorTooltip: Boolean = true
        var showIDECompletionSideBySide: Boolean = false
        var continueTestEnvironment: String = "production"
    }
}
```

---

### 4. **JCEF localStorage** (브라우저 캐시)

📁 **위치**: `C:\Users\hs_yoo\AppData\Local\JetBrains\IntelliJIdea2025.2\jcef_cache\Local Storage\leveldb\`

**저장 데이터** (LevelDB 바이너리 형식):

- `access_token`: 액세스 토큰
- `user_session`: 사용자 세션 정보
- `onboardingStatus`: "Started" | "Completed"
- `hasDismissedOnboardingCard`: Boolean
- `hasDismissedExploreDialog`: Boolean
- `hasDismissedCliInstallBanner`: Boolean
- `isExploreDialogOpen`: Boolean
- `showTutorialCard`: Boolean
- `shownProfilesIntroduction`: Boolean
- `hasExitedFreeTrial`: Boolean
- `fontSize`: Number
- `disableIndexing`: Boolean
- `inputHistory_${sessionId}`: JSONContent[]
- `ide`: "vscode" | "jetbrains"
- `vsCodeUriScheme`: String
- `extensionVersion`: String

**소스 코드**: [localStorage.ts](file:///d:/temp/crux-continue-custom/gui/src/util/localStorage.ts)

**LocalStorage 타입 정의**:

```typescript
type LocalStorageTypes = {
  isExploreDialogOpen: boolean;
  hasDismissedExploreDialog: boolean;
  onboardingStatus?: OnboardingStatus;
  hasDismissedOnboardingCard: boolean;
  ide: "vscode" | "jetbrains";
  vsCodeUriScheme: string;
  fontSize: number;
  [key: `inputHistory_${string}`]: JSONContent[];
  extensionVersion: string;
  showTutorialCard: boolean;
  shownProfilesIntroduction: boolean;
  disableIndexing: boolean;
  hasExitedFreeTrial: boolean;
  hasDismissedCliInstallBanner: boolean;
  access_token?: string;
  user_session?: {
    username: string;
    user_name: string;
  };
};
```

---

### 5. **Core GlobalContext** (전역 컨텍스트)

📁 **위치**: `C:\Users\hs_yoo\.continue\index\globalContext.json`

**저장 데이터**:

- `indexingPaused`: Boolean - 인덱싱 일시정지 상태
- `lastSelectedProfileForWorkspace`: Object - 워크스페이스별 마지막 선택 프로필
- `lastSelectedOrgIdForWorkspace`: Object - 워크스페이스별 마지막 선택 조직 ID
- `selectedModelsByProfileId`: Object - 프로필별 선택된 모델
- `cliSelectedModel`: String - CLI 선택 모델
- `hasDismissedConfigTsNoticeJetBrains`: Boolean - JetBrains 설정 알림 해제 여부
- `hasAlreadyCreatedAPromptFile`: Boolean - 프롬프트 파일 생성 여부
- `hasShownUnsupportedPlatformWarning`: Boolean - 지원되지 않는 플랫폼 경고 표시 여부
- `showConfigUpdateToast`: Boolean - 설정 업데이트 토스트 표시
- `isSupportedLanceDbCpuTargetForLinux`: Boolean - Linux용 LanceDB CPU 지원 여부
- `sharedConfig`: Object - 공유 설정
- `failedDocs`: Array - 실패한 문서 목록
- `shownDeprecatedProviderWarnings`: Object - 더 이상 사용되지 않는 프로바이더 경고
- `autoUpdateCli`: Boolean - CLI 자동 업데이트
- `mcpOauthStorage`: Object - MCP OAuth 저장소

**소스 코드**: [GlobalContext.ts](file:///d:/temp/crux-continue-custom/core/util/GlobalContext.ts#L22-L57)

**경로 결정 로직**: [paths.ts](file:///d:/temp/crux-continue-custom/core/util/paths.ts#L94-L96)

```typescript
export function getGlobalContextFilePath(): string {
  return path.join(getIndexFolderPath(), "globalContext.json");
}
// getIndexFolderPath() => ~/.continue/index/
```

---

## 🔍 팝업 "다시 보지 않기" 관련 설정 위치

### IntelliJ 측 (Kotlin)

**파일**: `ContinueExtensionSettings.xml`

- `shownWelcomeDialog`: 환영 팝업 다시 보지 않기

**코드 위치**: [ContinuePluginStartupActivity.kt](file:///d:/temp/crux-continue-custom/extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/activities/ContinuePluginStartupActivity.kt#L133-L135)

```kotlin
// 현재 주석 처리되어 있음
// if (!settings.continueState.shownWelcomeDialog) {
//     settings.continueState.shownWelcomeDialog = true
//     showTutorial(project)
// }
```

### GUI 측 (TypeScript/React)

**파일**: JCEF localStorage (LevelDB)

- `hasDismissedOnboardingCard`: 온보딩 카드 해제
- `hasDismissedExploreDialog`: 탐색 다이얼로그 해제
- `hasDismissedCliInstallBanner`: CLI 설치 배너 해제
- `onboardingStatus`: 온보딩 상태 ("Started" | "Completed")

**주요 컴포넌트**:

1. [OnboardingCard](file:///d:/temp/crux-continue-custom/gui/src/components/OnboardingCard/hooks/useOnboardingCard.ts#L52)

   ```typescript
   setLocalStorage("hasDismissedOnboardingCard", true);
   ```

2. [ExploreDialogWatcher](file:///d:/temp/crux-continue-custom/gui/src/pages/gui/ExploreDialogWatcher.tsx#L35)

   ```typescript
   if (!getLocalStorage(LocalStorageKey.HasDismissedExploreDialog)) {
     // 다이얼로그 표시
   }
   ```

3. [CliInstallBanner](file:///d:/temp/crux-continue-custom/gui/src/components/CliInstallBanner.tsx#L85)
   ```typescript
   setLocalStorage("hasDismissedCliInstallBanner", true);
   ```

### Core 측 (TypeScript)

**파일**: `globalContext.json`

- `hasDismissedConfigTsNoticeJetBrains`: JetBrains config.ts 알림 해제

---

## 📊 데이터 저장 위치별 특징

| 저장소                       | 파일 위치                       | 데이터 형식 | 암호화 | 주요 용도                      |
| ---------------------------- | ------------------------------- | ----------- | ------ | ------------------------------ |
| **PasswordSafe**             | `c.kdbx`                        | 바이너리    | ✅     | 민감한 인증 토큰               |
| **PropertiesComponent**      | `other.xml`                     | XML         | ❌     | 계정 ID/Label                  |
| **PersistentStateComponent** | `ContinueExtensionSettings.xml` | XML         | ❌     | **플러그인 설정 및 팝업 상태** |
| **JCEF localStorage**        | `leveldb/*.ldb`                 | LevelDB     | ❌     | **GUI 팝업 및 사용자 선호도**  |
| **GlobalContext**            | `globalContext.json`            | JSON        | ❌     | Core 전역 설정                 |

---

## 🎯 결론

### 팝업 "다시 보지 않기" 설정이 저장되는 위치:

1. **IntelliJ 네이티브 팝업** → `ContinueExtensionSettings.xml`

   - `shownWelcomeDialog`

2. **GUI 웹뷰 팝업** → JCEF localStorage (LevelDB)

   - `hasDismissedOnboardingCard`
   - `hasDismissedExploreDialog`
   - `hasDismissedCliInstallBanner`
   - `onboardingStatus`

3. **Core 알림** → `globalContext.json`
   - `hasDismissedConfigTsNoticeJetBrains`

### 로그인 데이터를 삭제해도 설정이 남아있는 이유:

로그인 관련 파일(`c.kdbx`, `other.xml`, JCEF localStorage의 `access_token`/`user_session`)을 삭제해도, **플러그인 설정과 팝업 상태는 별도의 파일에 저장**되어 있기 때문입니다:

- `ContinueExtensionSettings.xml` - IntelliJ 플러그인 설정
- JCEF localStorage - GUI 팝업 상태 (LevelDB 형식)
- `globalContext.json` - Core 전역 설정

이 파일들을 함께 삭제해야 완전히 초기화됩니다.
