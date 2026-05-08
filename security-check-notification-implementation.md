# 파일 저장 시 시큐리티 검사 알림 구현

## 개요

파일 저장 시 오른쪽 하단에 시큐리티 검사 여부를 묻는 알림 팝업을 표시하는 기능을 구현했습니다.

---

## 구현 내용

### 1. VSCode 플러그인

#### 수정 파일

- [`extensions/vscode/src/extension/VsCodeExtension.ts`](file:///d:/temp/crux-continue-custom/extensions/vscode/src/extension/VsCodeExtension.ts#L495-L519)

#### 구현 코드

```typescript
vscode.workspace.onDidSaveTextDocument(async (event) => {
  this.core.invoke("files/changed", {
    uris: [event.uri.toString()],
  });

  // 파일 저장 시 시큐리티 검사 알림 표시
  const fileName = event.uri.fsPath.split(/[\\/]/).pop() || "파일";
  vscode.window
    .showInformationMessage(
      `저장되었습니다\n\nPrometheus\n시큐리티 검사를 하시겠습니까?`,
      "Yes",
      "No",
    )
    .then((selection) => {
      if (selection === "Yes") {
        // Yes 버튼 클릭 시 동작 (현재는 아무것도 하지 않음)
        console.log("Security check: Yes selected");
      } else if (selection === "No") {
        // No 버튼 클릭 시 동작 (현재는 아무것도 하지 않음)
        console.log("Security check: No selected");
      }
    });
});
```

#### 동작 방식

1. **파일 저장 감지**: `onDidSaveTextDocument` 이벤트로 파일 저장을 감지합니다
2. **알림 표시**: `vscode.window.showInformationMessage`로 오른쪽 하단에 알림을 표시합니다
3. **버튼 처리**:
   - "Yes" 버튼 클릭 시: 콘솔에 로그 출력
   - "No" 버튼 클릭 시: 콘솔에 로그 출력
   - 알림 무시 시: 자동으로 사라짐

---

### 2. IntelliJ 플러그인

#### 수정 파일

- [`extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/activities/ContinuePluginStartupActivity.kt`](file:///d:/temp/crux-continue-custom/extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/activities/ContinuePluginStartupActivity.kt#L165-L219)

#### 구현 코드

```kotlin
// Notify core of content changes
if (changedURIs.isNotEmpty()) {
    val data = mapOf("uris" to changedURIs)
    continuePluginService.coreMessenger?.request("files/changed", data, null) { _ -> }

    // 파일 저장 시 시큐리티 검사 알림 표시
    ApplicationManager.getApplication().invokeLater {
        val notification = com.intellij.notification.NotificationGroupManager.getInstance()
            .getNotificationGroup("Prometheus")
            .createNotification(
                "저장되었습니다",
                "Prometheus\n시큐리티 검사를 하시겠습니까?",
                com.intellij.notification.NotificationType.INFORMATION
            )
            .addAction(object : com.intellij.openapi.actionSystem.AnAction("Yes") {
                override fun actionPerformed(e: com.intellij.openapi.actionSystem.AnActionEvent) {
                    // Yes 버튼 클릭 시 동작 (현재는 아무것도 하지 않음)
                    println("Security check: Yes selected")
                    notification.expire()
                }
            })
            .addAction(object : com.intellij.openapi.actionSystem.AnAction("No") {
                override fun actionPerformed(e: com.intellij.openapi.actionSystem.AnActionEvent) {
                    // No 버튼 클릭 시 동작 (현재는 아무것도 하지 않음)
                    println("Security check: No selected")
                    notification.expire()
                }
            })

        notification.notify(project)
    }
}
```

#### 동작 방식

1. **파일 저장 감지**: `VFileContentChangeEvent`로 파일 변경(저장)을 감지합니다
2. **UI 스레드 실행**: `ApplicationManager.getApplication().invokeLater`로 UI 스레드에서 알림을 표시합니다
3. **알림 생성**: `NotificationGroupManager`를 사용하여 "Prometheus" 그룹의 알림을 생성합니다
4. **버튼 처리**:
   - "Yes" 버튼 클릭 시: 콘솔에 로그 출력 후 알림 닫기
   - "No" 버튼 클릭 시: 콘솔에 로그 출력 후 알림 닫기
   - 알림 무시 시: 자동으로 사라짐

---

## 알림 표시 내용

### 제목

```
저장되었습니다
```

### 본문

```
Prometheus
시큐리티 검사를 하시겠습니까?
```

### 버튼

- **Yes**: 시큐리티 검사 수행 (현재는 로그만 출력)
- **No**: 시큐리티 검사 건너뛰기 (현재는 로그만 출력)

---

## 테스트 방법

### VSCode

1. VSCode에서 프로젝트를 엽니다
2. 아무 파일이나 수정합니다
3. `Ctrl+S` (또는 `Cmd+S`)로 저장합니다
4. 오른쪽 하단에 알림이 표시됩니다
5. "Yes" 또는 "No" 버튼을 클릭하거나 무시합니다

### IntelliJ

1. IntelliJ에서 프로젝트를 엽니다
2. 아무 파일이나 수정합니다
3. `Ctrl+S` (또는 `Cmd+S`)로 저장합니다
4. 오른쪽 하단에 알림이 표시됩니다
5. "Yes" 또는 "No" 버튼을 클릭하거나 무시합니다

---

## 향후 확장 가능성

현재는 버튼 클릭 시 아무 동작도 하지 않지만, 다음과 같은 기능을 추가할 수 있습니다:

### 1. 실제 시큐리티 검사 수행

```typescript
// VSCode
if (selection === "Yes") {
  // 시큐리티 검사 로직 실행
  await performSecurityCheck(event.uri);
  vscode.window.showInformationMessage("시큐리티 검사가 완료되었습니다.");
}
```

```kotlin
// IntelliJ
override fun actionPerformed(e: AnActionEvent) {
    // 시큐리티 검사 로직 실행
    performSecurityCheck(changedURIs)
    notification.expire()
}
```

### 2. 검사 결과 표시

```typescript
const result = await performSecurityCheck(event.uri);
if (result.hasIssues) {
  vscode.window.showWarningMessage(
    `${result.issueCount}개의 보안 문제가 발견되었습니다.`,
    "자세히 보기",
  );
}
```

### 3. 설정 옵션 추가

```typescript
// 사용자가 알림을 비활성화할 수 있는 옵션
const config = vscode.workspace.getConfiguration("prometheus");
const showSecurityCheckPrompt = config.get<boolean>(
  "showSecurityCheckPrompt",
  true,
);

if (showSecurityCheckPrompt) {
  // 알림 표시
}
```

### 4. 특정 파일 타입만 검사

```typescript
// 특정 확장자만 검사
const fileExtension = event.uri.fsPath.split(".").pop();
const checkableExtensions = ["ts", "js", "py", "java", "kt"];

if (checkableExtensions.includes(fileExtension)) {
  // 알림 표시
}
```

---

## 주의사항

### 1. 알림 빈도

- 파일을 저장할 때마다 알림이 표시되므로, 사용자가 불편할 수 있습니다
- 필요에 따라 디바운싱(debouncing)을 적용하거나 설정 옵션을 추가하는 것을 권장합니다

### 2. 성능

- 파일 저장 이벤트는 매우 빈번하게 발생할 수 있습니다
- 알림 표시는 가벼운 작업이지만, 실제 시큐리티 검사를 추가할 경우 비동기로 처리해야 합니다

### 3. 사용자 경험

- 너무 많은 알림은 사용자를 방해할 수 있습니다
- "다시 보지 않기" 옵션을 추가하는 것을 고려하세요

---

## 빌드 및 실행

### VSCode 플러그인

```bash
cd extensions/vscode
npm run esbuild
# 또는
npm run esbuild-watch  # 개발 중 자동 빌드
```

### IntelliJ 플러그인

```bash
# PowerShell에서 실행
.\build-intellij-plugin.ps1
```

---

## 결론

두 IDE 모두에서 파일 저장 시 시큐리티 검사 알림을 표시하는 기능이 성공적으로 구현되었습니다. 현재는 버튼 클릭 시 로그만 출력하지만, 향후 실제 시큐리티 검사 로직을 추가하여 확장할 수 있습니다.
