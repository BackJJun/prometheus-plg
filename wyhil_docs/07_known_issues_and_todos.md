# 7. 알려진 이슈 및 백로그 (Known Issues / TODO)

이 프로젝트(특히 이전 담장자 작업 내역 기준)에 아직 남아있는 백로그 사항과 간헐적인 버그 리스트입니다. 후임자분이 추가 작업을 하실 때 참고하시기 바랍니다.

## 7.1 최근 해결된 주요 이슈

_(여기 적힌 항목들은 조치 완료 상태이므로, 코드가 어떻게 바뀌었는지 참고하는 용도로 쓰세요)_

- **[IntelliJ] 무한 Security Loop 버그 수정 완료:** 파일 저장(Save) 시 보안 검사를 돌리고, 보안 Fix를 적용한 후 다시 Save 이벤트가 발생해서 계속 무한 팝업이 뜨는 현상 수정 완료 (`Document.userData`에 마커를 달아 회피).
- **[UI] Security Check 창 Text Wrap 오류:** 긴 보안 결과가 박스를 뚫고 나가는 문제(Word Wrap 미적용) 스타일 코드 수정 완료.
- **[UI] 불필요한 초기화 모달 제거:** 초기 `Init / Initialize Codebase` 제안 카드가 북마크된 커맨드 때문에 강제 전시되던 로직 제외 처리.
- **[기능] gpt-4o Tool Prompts 지원 문제 해결:** Tool 파싱이 네이티브로 안되어 시스템 프롬프트에 직접 Tool Format을 주입하도록 강제하는 옵션이 `toolSupport.ts`에 분기 처리되어 있습니다.

## 7.2 앞으로 모니터링/개선해야 할 백로그 (TODO)

1. **Gemini Tool Call Failure 모니터링:**
   - `gpt-4o`, `Claude`와 달리 `scan_fix` API 통신 과정에서 `Gemini` 프로바이더가 간헐접으로 Tool Call Payload 파싱에 실패하거나 누락하는 현상이 있었습니다. 프록시 서버 단의 전처리 혹은 컨텍스트 사이즈 문제인지, `core/llm/` 내의 파서 로직 문제인지 추가 패치가 필요할 수 있습니다.
2. **보안 스캔 결과 파일명 (Temp Name)**:
   - 스캔(`/scan`) 진행 시 서버로 올라가는 파일명 필드가 원본 이름이 아닌 `temp_xyz123...` 처럼 표기되는 이슈가 있었습니다. 파일 자체 텍스트를 건드리지 않고 스캐너에 원본 파일명을 넘기는 파라미터가 정확하게 전달되는지 디버깅이 필요합니다.
3. **Docker 권한 디버깅 (Jenkins/CI 배포 시)**:
   - 사내 배포 젠킨스(Jenkins) 파이프라인 상에서 정적 분석기(Bearer 등) 바이너리 접근 중 `PermissionError: [Errno 13] Permission denied` 문제가 산발적으로 발생합니다. (보안 담당자/인프라 팀과 협조하여 Docker 런타임 내 권한 조정 필요 `chmod +x` 등)
4. **IntelliJ 다이얼로그 Depth 이슈**:
   - IntelliJ는 VSCode와 다르게 팝업(Dialog) 시스템이 강력해, 마크다운 결과 뷰가 떠 있는 상황에서 또 다른 Alert 팝업이 뜨면 이전 창이 가려져서 리포트 내용을 못보게 되는 현상이 있습니다. Z-index(윈도우 포커싱) 관련 구조 설계 리뷰가 필요할 수 있습니다.
