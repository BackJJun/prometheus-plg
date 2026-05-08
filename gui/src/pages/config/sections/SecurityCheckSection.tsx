import {
  ChevronDownIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "../../../components/ui";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import {
  SecurityCheckMode,
  SecurityDisplayMode,
  SecurityFixMode,
  setSecurityCheckMode,
  setSecurityDisplayMode,
  setSecurityFixMode,
} from "../../../redux/slices/uiSlice";
import { ConfigHeader } from "../components/ConfigHeader";

const SECURITY_CHECK_OPTIONS: {
  value: SecurityCheckMode;
  label: string;
  description: string;
}[] = [
  {
    value: "automatic",
    label: "Automatic",
    description: "파일 저장 시 자동으로 보안 검사를 실행합니다",
  },
  {
    value: "askFirst",
    label: "Ask First",
    description: "파일 저장 시 보안 검사 여부를 확인합니다",
  },
  {
    value: "off",
    label: "Off",
    description: "보안 검사를 사용하지 않습니다",
  },
];

const SECURITY_FIX_OPTIONS: {
  value: SecurityFixMode;
  label: string;
  description: string;
}[] = [
  {
    value: "automatic",
    label: "Automatic",
    description: "보안 문제 발견 시 자동으로 코드를 수정합니다",
  },
  {
    value: "manual",
    label: "Manual",
    description: "보안 문제 발견 시 채팅 UI에서 수정 내용을 확인 후 적용합니다",
  },
  {
    value: "off",
    label: "Off",
    description: "코드 자동 수정 기능을 사용하지 않습니다",
  },
];

const SECURITY_DISPLAY_OPTIONS: {
  value: SecurityDisplayMode;
  label: string;
  description: string;
}[] = [
  {
    value: "preview",
    label: "Markdown Preview",
    description: "보안 리포트 결과를 렌더링된 마크다운 미리보기로 보여줍니다",
  },
  {
    value: "editor",
    label: "Code Editor",
    description: "보안 리포트 결과를 텍스트 에디터로 보여줍니다",
  },
];

export function SecurityCheckSection() {
  const dispatch = useAppDispatch();
  const securityCheckMode = useAppSelector(
    (state) => state.ui.securityCheckMode,
  );
  const securityFixMode = useAppSelector((state) => state.ui.securityFixMode);
  const securityDisplayMode = useAppSelector(
    (state) => state.ui.securityDisplayMode,
  );

  const currentCheckOption = SECURITY_CHECK_OPTIONS.find(
    (opt) => opt.value === securityCheckMode,
  );
  const currentFixOption = SECURITY_FIX_OPTIONS.find(
    (opt) => opt.value === securityFixMode,
  );
  const currentDisplayOption = SECURITY_DISPLAY_OPTIONS.find(
    (opt) => opt.value === securityDisplayMode,
  );

  return (
    <>
      <ConfigHeader
        title="Security Check"
        subtext="파일 저장 시 소스코드 보안 검사 설정"
        className="mb-4"
      />
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="h-5 w-5 flex-shrink-0 text-green-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Security Scan Mode</span>
              <span className="text-description text-xs">
                {currentCheckOption?.description}
              </span>
            </div>
          </div>
          <Listbox
            value={securityCheckMode}
            onChange={(value) => dispatch(setSecurityCheckMode(value))}
          >
            <div className="relative">
              <ListboxButton className="border-command-border h-8 w-28 justify-between px-3">
                <span className="text-xs">{currentCheckOption?.label}</span>
                <ChevronDownIcon className="h-3 w-3" />
              </ListboxButton>
              <ListboxOptions className="min-w-0">
                {SECURITY_CHECK_OPTIONS.map((option) => (
                  <ListboxOption key={option.value} value={option.value}>
                    {option.label}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </Card>

      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WrenchScrewdriverIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Security Fix Mode</span>
              <span className="text-description text-xs">
                {currentFixOption?.description}
              </span>
            </div>
          </div>
          <Listbox
            value={securityFixMode}
            onChange={(value) => dispatch(setSecurityFixMode(value))}
          >
            <div className="relative">
              <ListboxButton className="border-command-border h-8 w-28 justify-between px-3">
                <span className="text-xs">{currentFixOption?.label}</span>
                <ChevronDownIcon className="h-3 w-3" />
              </ListboxButton>
              <ListboxOptions className="min-w-0">
                {SECURITY_FIX_OPTIONS.map((option) => (
                  <ListboxOption key={option.value} value={option.value}>
                    {option.label}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </Card>

      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="h-5 w-5 flex-shrink-0 text-purple-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Security Display Mode</span>
              <span className="text-description text-xs">
                {currentDisplayOption?.description}
              </span>
            </div>
          </div>
          <Listbox
            value={securityDisplayMode}
            onChange={(value) => dispatch(setSecurityDisplayMode(value))}
          >
            <div className="relative">
              <ListboxButton className="border-command-border h-8 w-36 justify-between px-3">
                <span className="text-xs">{currentDisplayOption?.label}</span>
                <ChevronDownIcon className="h-3 w-3" />
              </ListboxButton>
              <ListboxOptions className="min-w-0">
                {SECURITY_DISPLAY_OPTIONS.map((option) => (
                  <ListboxOption key={option.value} value={option.value}>
                    {option.label}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </Card>

      <div className="mt-4 rounded-lg bg-gray-50 bg-opacity-5 p-3">
        <p className="text-description text-xs">
          <strong>참고:</strong> 보안 검사 대상 파일 확장자는{" "}
          <code>config.yaml</code>의 <code>security_target</code> 필드에서
          설정할 수 있습니다.
        </p>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-900 p-2 text-xs text-gray-300">
          {`security_target: ["java", "py", "kt", "ts", "js"]`}
        </pre>
      </div>
    </>
  );
}
