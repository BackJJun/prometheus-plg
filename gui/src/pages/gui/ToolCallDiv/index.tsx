import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { ToolCallState } from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import { useState } from "react";
import { useAppSelector } from "../../../redux/hooks";
import FunctionSpecificToolCallDiv from "./FunctionSpecificToolCallDiv";
import { GroupedToolCallHeader } from "./GroupedToolCallHeader";
import { SimpleToolCallUI } from "./SimpleToolCallUI";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { getIconByName, getStatusIcon } from "./utils";

interface ToolCallDivProps {
  toolCallStates: ToolCallState[];
  historyIndex: number;
}

export function ToolCallDiv({
  toolCallStates,
  historyIndex,
}: ToolCallDivProps) {
  const [open, setOpen] = useState(false);
  const availableTools = useAppSelector((state) => state.config.config.tools);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);

  if (!toolCallStates?.length) return null;

  const isPlanningOnlyStatus = (toolCall: ToolCallState) =>
    toolCall.status === "generating" ||
    (isStreaming && toolCall.status === "generated");

  const visibleToolCallStates = toolCallStates.filter(
    (toolCall) => !isPlanningOnlyStatus(toolCall),
  );
  const hasHiddenPlanningCalls =
    visibleToolCallStates.length !== toolCallStates.length;
  const shouldShowPlanningPlaceholder =
    hasHiddenPlanningCalls && visibleToolCallStates.length === 0;

  const shouldShowGroupedUI = visibleToolCallStates.length > 1;
  const activeCalls = visibleToolCallStates.filter(
    (call) => call.status !== "canceled",
  );

  const renderToolCall = (toolCallState: ToolCallState) => {
    const tool = availableTools.find(
      (tool) => toolCallState.toolCall.function?.name === tool.function.name,
    );
    const functionName = toolCallState.toolCall.function?.name;
    const icon =
      functionName && tool?.toolCallIcon
        ? getIconByName(tool.toolCallIcon)
        : undefined;

    if (icon) {
      const StatusIcon =
        toolCallState.status === "done"
          ? CheckCircleIcon
          : toolCallState.status === "errored"
            ? ExclamationTriangleIcon
            : toolCallState.status === "canceled"
              ? XCircleIcon
              : icon;

      return (
        <SimpleToolCallUI
          tool={tool}
          toolCallState={toolCallState}
          icon={StatusIcon}
          historyIndex={historyIndex}
        />
      );
    }

    // Trying this out while it's an experimental feature
    // Obviously missing the truncate and args buttons
    // All the info from args is displayed here
    // But we'd need a nicer place to put the truncate button and the X icon when tool call fails
    if (
      functionName === BuiltInToolNames.SingleFindAndReplace ||
      functionName === BuiltInToolNames.MultiEdit ||
      functionName === BuiltInToolNames.RunTerminalCommand
    ) {
      return (
        <ToolCallDisplay
          icon={getStatusIcon(toolCallState.status)}
          tool={tool}
          toolCallState={toolCallState}
          historyIndex={historyIndex}
        >
          <FunctionSpecificToolCallDiv
            toolCallState={toolCallState}
            historyIndex={historyIndex}
          />
        </ToolCallDisplay>
      );
    }

    return (
      <ToolCallDisplay
        icon={getStatusIcon(toolCallState.status)}
        tool={tool}
        toolCallState={toolCallState}
        historyIndex={historyIndex}
      >
        <FunctionSpecificToolCallDiv
          toolCallState={toolCallState}
          historyIndex={historyIndex}
        />
      </ToolCallDisplay>
    );
  };

  if (shouldShowPlanningPlaceholder) {
    return (
      <div className="text-description flex min-w-0 items-center gap-2 px-2 py-1 text-xs">
        <div className="h-4 w-4 flex-shrink-0">
          {getStatusIcon("generating")}
        </div>
        <span className="min-w-0 truncate">생각 중...</span>
      </div>
    );
  }

  if (shouldShowGroupedUI) {
    return (
      <div className="px-1 py-1">
        <GroupedToolCallHeader
          toolCallStates={visibleToolCallStates}
          activeCalls={activeCalls}
          open={open}
          onToggle={() => setOpen(!open)}
        />
        {open && (
          <div className="transition-opacity duration-300 ease-in-out">
            {visibleToolCallStates.map((toolCallState) => (
              <div className="py-0.5 pl-4" key={toolCallState.toolCallId}>
                {renderToolCall(toolCallState)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return visibleToolCallStates.map((toolCallState) => (
    <div className="py-0.5" key={toolCallState.toolCallId}>
      {renderToolCall(toolCallState)}
    </div>
  ));
}
