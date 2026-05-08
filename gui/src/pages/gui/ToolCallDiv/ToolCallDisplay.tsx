import { Tool, ToolCallState } from "core";
import { useContext, useMemo, useState } from "react";
import { openContextItem } from "../../../components/mainInput/belowMainInput/ContextItemsPeek";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ToolCallStatusMessage } from "./ToolCallStatusMessage";
import { ToolCallInlineActions } from "./ToolCallInlineActions";
import { toolCallStateToContextItems } from "./utils";
import { ToolTruncateHistoryIcon } from "./ToolTruncateHistoryIcon";

interface ToolCallDisplayProps {
  children: React.ReactNode;
  icon: React.ReactNode;
  tool: Tool | undefined;
  toolCallState: ToolCallState;
  historyIndex: number;
}

export function ToolCallDisplay({
  tool,
  toolCallState,
  children,
  icon,
  historyIndex,
}: ToolCallDisplayProps) {
  const ideMessenger = useContext(IdeMessengerContext);
  const [open, setOpen] = useState(false);
  const shownContextItems = useMemo(() => {
    const contextItems = toolCallStateToContextItems(toolCallState);
    return contextItems.filter((item) => !item.hidden);
  }, [toolCallState]);

  const hasDetails = !!children;
  const isClickable = hasDetails || shownContextItems.length > 0;

  function handleClick() {
    if (hasDetails) {
      setOpen((prev) => !prev);
    } else if (shownContextItems.length > 0) {
      openContextItem(shownContextItems[0], ideMessenger);
    }
  }

  return (
    <div className="flex min-w-0 flex-col px-2 py-1">
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 flex-row items-center justify-between gap-2">
          <div
            className={`text-description flex min-w-0 flex-1 flex-row items-center gap-2 text-xs transition-colors duration-200 ease-in-out ${
              isClickable ? "cursor-pointer hover:brightness-125" : ""
            }`}
            onClick={isClickable ? handleClick : undefined}
          >
            <div className="h-4 w-4 flex-shrink-0 font-semibold">
              {icon}
            </div>
            {tool?.faviconUrl && (
              <img src={tool.faviconUrl} className="h-4 w-4 rounded-sm" />
            )}
            <ToolCallStatusMessage tool={tool} toolCallState={toolCallState} />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {!!toolCallState.output?.length && (
              <ToolTruncateHistoryIcon historyIndex={historyIndex} />
            )}
            <ToolCallInlineActions toolCallState={toolCallState} />
          </div>
        </div>
      </div>
      {hasDetails && open && <div className="mt-2 pl-5">{children}</div>}
    </div>
  );
}
