import { Tool, ToolCallState } from "core";
import { ComponentType, useContext, useMemo, useState } from "react";
import {
  ContextItemsPeekItem,
  openContextItem,
} from "../../../components/mainInput/belowMainInput/ContextItemsPeek";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ToggleWithIcon } from "./ToggleWithIcon";
import { ToolCallInlineActions } from "./ToolCallInlineActions";
import { ToolCallStatusMessage } from "./ToolCallStatusMessage";
import { ToolTruncateHistoryIcon } from "./ToolTruncateHistoryIcon";
import { toolCallStateToContextItems } from "./utils";

interface SimpleToolCallUIProps {
  toolCallState: ToolCallState;
  tool: Tool | undefined;
  icon?: ComponentType<React.SVGProps<SVGSVGElement>>;
  historyIndex: number;
}

export function SimpleToolCallUI({
  icon: Icon,
  toolCallState,
  tool,
  historyIndex,
}: SimpleToolCallUIProps) {
  const ideMessenger = useContext(IdeMessengerContext);
  const shownContextItems = useMemo(() => {
    const contextItems = toolCallStateToContextItems(toolCallState);
    return contextItems.filter((item) => !item.hidden);
  }, [toolCallState]);

  const [open, setOpen] = useState(false);

  const isToggleable = shownContextItems.length > 1;
  const isSingleItem = shownContextItems.length === 1;
  const shouldShowContent = isToggleable ? open : false;
  const isClickable = isToggleable || isSingleItem;
  const iconClassName =
    toolCallState.status === "done"
      ? "text-[#3fb950] drop-shadow-[0_0_4px_rgba(63,185,80,0.45)]"
      : toolCallState.status === "errored"
        ? "text-red-500"
        : "text-description";

  function handleClick() {
    if (isToggleable) {
      setOpen((prev) => !prev);
    } else if (isSingleItem) {
      openContextItem(shownContextItems[0], ideMessenger);
    }
  }

  return (
    <div className="flex min-w-0 flex-col px-2 py-1">
      <div className="flex min-w-0 flex-row items-center justify-between gap-2">
        <div
          className={`text-description flex min-w-0 flex-1 flex-row items-center gap-1.5 text-xs transition-colors duration-200 ease-in-out ${
            isClickable ? "cursor-pointer hover:brightness-125" : ""
          }`}
          onClick={isClickable ? handleClick : undefined}
          data-testid="context-items-peek"
        >
          <ToggleWithIcon
            icon={Icon}
            isToggleable={isToggleable}
            open={shouldShowContent}
            isClickable={isSingleItem}
            iconClassName={iconClassName}
          />
          <ToolCallStatusMessage tool={tool} toolCallState={toolCallState} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {!!toolCallState.output?.length && (
            <ToolTruncateHistoryIcon historyIndex={historyIndex} />
          )}
          <ToolCallInlineActions toolCallState={toolCallState} />
        </div>
      </div>

      {isToggleable && (
        <div
          className={`thin-scrollbar mt-2 overflow-y-auto transition-all duration-300 ease-in-out ${
            shouldShowContent ? "max-h-[50vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {shownContextItems.length > 0 ? (
            shownContextItems.map((contextItem, idx) => (
              <ContextItemsPeekItem key={idx} contextItem={contextItem} />
            ))
          ) : (
            <div className="text-description pl-5 text-xs italic">
              No tool call output
            </div>
          )}
        </div>
      )}
    </div>
  );
}
