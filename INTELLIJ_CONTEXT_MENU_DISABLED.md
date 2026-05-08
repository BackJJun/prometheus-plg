# IntelliJ Context Menu Disabled

## 개요

IntelliJ 플러그인에서 파일에 오른쪽 버튼 클릭 시 나타나는 **"Continue"** 컨텍스트 메뉴가 비활성화되었습니다.

## 비활성화된 기능

- **위치**: 파일 탐색기 (Project View) → 파일 우클릭 → ~~Continue~~ → ~~Add to Chat~~
- **주석 처리된 코드**: `extensions/intellij/src/main/resources/META-INF/plugin.xml` (라인 183-192)

## 복원 방법

`plugin.xml`에서 아래 XML 코드의 주석을 해제하세요:

```xml
<group id="ContinueProjectViewPopUpMenuGroup" popup="true" text="Continue" icon="/icons/continue.svg">
    <action id="com.github.continuedev.continueintellijextension.actions.AddToChatAction"
            class="com.github.continuedev.continueintellijextension.actions.AddToChatAction"
            text="Add to Chat">
    </action>
    <add-to-group group-id="ProjectViewPopupMenu" anchor="last"/>
</group>
```

## 관련 파일

- `extensions/intellij/src/main/resources/META-INF/plugin.xml`
- `extensions/intellij/src/main/kotlin/.../actions/AddToChatAction.kt`

## 변경 일자

2026-01-28
