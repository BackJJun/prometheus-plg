import { FolderIcon } from "@heroicons/react/24/outline";
import { ToolCallState } from "core";
import { ToggleWithIcon } from "./ToggleWithIcon";
import { getGroupedToolCallSummary } from "./utils";

interface GroupedToolCallHeaderProps {
  toolCallStates: ToolCallState[];
  activeCalls: ToolCallState[];
  open: boolean;
  onToggle: () => void;
}

export function GroupedToolCallHeader({
  toolCallStates,
  activeCalls,
  open,
  onToggle,
}: GroupedToolCallHeaderProps) {
  const summaryCalls = activeCalls.length > 0 ? activeCalls : toolCallStates;

  return (
    <div className="mb-2">
      <div
        className="text-description flex cursor-pointer items-center gap-1.5 transition-colors duration-200 ease-in-out hover:brightness-125"
        data-testid="performing-actions"
        onClick={onToggle}
      >
        <ToggleWithIcon
          isToggleable
          icon={FolderIcon}
          open={open}
          onClick={onToggle}
        />
        <span className="min-w-0 truncate">
          {getGroupedToolCallSummary(summaryCalls)}
        </span>
      </div>
    </div>
  );
}
