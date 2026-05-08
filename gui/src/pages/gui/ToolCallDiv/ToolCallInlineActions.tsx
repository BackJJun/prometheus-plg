import { ToolCallState } from "core";
import { type MouseEvent } from "react";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { callToolById } from "../../../redux/thunks/callToolById";
import { cancelToolCallThunk } from "../../../redux/thunks/cancelToolCall";
import { Button } from "../../../components/ui";

interface ToolCallInlineActionsProps {
  toolCallState: ToolCallState;
}

export function ToolCallInlineActions({
  toolCallState,
}: ToolCallInlineActionsProps) {
  const dispatch = useAppDispatch();
  const isStreaming = useAppSelector((state) => state.session.isStreaming);

  if (isStreaming || toolCallState.status !== "generated") {
    return null;
  }

  function handleReject(event: MouseEvent) {
    event.stopPropagation();
    void dispatch(cancelToolCallThunk({ toolCallId: toolCallState.toolCallId }));
  }

  function handleAccept(event: MouseEvent) {
    event.stopPropagation();
    void dispatch(callToolById({ toolCallId: toolCallState.toolCallId }));
  }

  return (
    <div className="ml-auto flex flex-shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-description-muted h-6 px-2 text-xs"
        onClick={handleReject}
      >
        Reject
      </Button>
      <Button
        variant="primary"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={handleAccept}
      >
        Accept
      </Button>
    </div>
  );
}
