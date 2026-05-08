import { ChatHistoryItem } from "core";
import { stripImages } from "core/util/messageContent";
import { useState } from "react";
import ReasoningPanel, { buildReasoningPreview } from "../ReasoningPanel";
import StyledMarkdownPreview from "../StyledMarkdownPreview";
import { sanitizeReasoningText } from "./sanitizeReasoningText";

interface ReasoningProps {
  item: ChatHistoryItem;
  index: number;
  isLast: boolean;
}

function formatReasoningTime(
  startAt?: number | null,
  endAt?: number | null,
): string | null {
  if (!startAt || !endAt || endAt <= startAt) {
    return null;
  }

  return `${((endAt - startAt) / 1000).toFixed(1)}s`;
}

function shouldShowReasoningDetails() {
  try {
    return localStorage.getItem("prometheus:show-reasoning") === "true";
  } catch {
    return false;
  }
}

export default function Reasoning(props: ReasoningProps) {
  const [open, setOpen] = useState(false);

  if (!props.item.reasoning?.text) {
    return null;
  }

  const visibleReasoningText = sanitizeReasoningText(props.item.reasoning.text);
  const isThinking = !props.item.reasoning?.endAt;
  const showDetails = shouldShowReasoningDetails();

  const reasoningTime = formatReasoningTime(
    props.item.reasoning.startAt,
    props.item.reasoning.endAt,
  );
  const statusLabel = isThinking
    ? "Thinking..."
    : reasoningTime
      ? `Thought for ${reasoningTime}`
      : "Thought";

  return (
    <ReasoningPanel
      open={open}
      onToggle={() => setOpen(!open)}
      title={isThinking ? "Thinking" : "Reasoning"}
      hideTitle
      statusLabel={statusLabel}
      statusTone={isThinking ? "progress" : "complete"}
      previewText={
        showDetails ? buildReasoningPreview(visibleReasoningText) : undefined
      }
      contentId={`reasoning-panel-${props.index}`}
    >
      {showDetails ? (
        <StyledMarkdownPreview
          isRenderingInStepContainer
          source={stripImages(visibleReasoningText)}
          itemIndex={props.index}
          useParentBackgroundColor
        />
      ) : undefined}
    </ReasoningPanel>
  );
}
