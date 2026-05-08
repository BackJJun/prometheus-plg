// src/components/ThinkingBlockPeek.tsx
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ChevronUpIcon } from "@heroicons/react/24/solid";
import { ChatHistoryItem } from "core";
import { useEffect, useState } from "react";
import styled from "styled-components";

import { vscBackground } from "../..";
import { AnimatedEllipsis } from "../../AnimatedEllipsis";
import StyledMarkdownPreview from "../../StyledMarkdownPreview";

const ThinkingTextContainer = styled.span`
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  padding-right: 1em; /* Reserve space for the ellipsis animation */
`;

const ThinkingToggleButton = styled.button`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 8px 6px 0 2px;
  appearance: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  line-height: 1.2;
  text-align: left;
  box-shadow: none;

  &:hover {
    filter: brightness(1.08);
  }
`;

const ThinkingStatusBadge = styled.span<{ $inProgress?: boolean }>`
  max-width: min(60vw, 320px);
  min-width: 0;
  border-radius: 999px;
  padding: 2px 7px;
  background: ${({ $inProgress }) =>
    $inProgress ? "rgba(35, 134, 54, 0.16)" : "rgba(56, 139, 253, 0.16)"};
  color: ${({ $inProgress }) => ($inProgress ? "#3fb950" : "#58a6ff")};
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 1 auto;
  font-weight: 500;

  @media (max-width: 420px) {
    max-width: 55vw;
  }
`;

const ThinkingPreview = styled.span`
  min-width: 0;
  max-width: min(58vw, 42rem);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--vscode-descriptionForeground);
  flex: 1 1 auto;

  @media (max-width: 420px) {
    max-width: 40vw;
  }
`;

const MarkdownWrapper = styled.div`
  & > div > *:first-child {
    margin-top: 0 !important;
  }
`;

function buildThinkingPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

interface ThinkingBlockPeekProps {
  content: string;
  redactedThinking?: string;
  index: number;
  prevItem: ChatHistoryItem | null;
  inProgress?: boolean;
  signature?: string;
  tokens?: number;
}

function ThinkingBlockPeek({
  content,
  redactedThinking,
  index,
  prevItem,
  inProgress,
  signature,
  tokens,
}: ThinkingBlockPeekProps) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("");

  const duplicateRedactedThinkingBlock =
    prevItem &&
    prevItem.message.role === "thinking" &&
    redactedThinking &&
    prevItem.message.redactedThinking;
  const previewText = !redactedThinking ? buildThinkingPreview(content) : "";

  useEffect(() => {
    if (inProgress) {
      setStartTime(Date.now());
      setElapsedTime("");
    } else if (startTime) {
      const endTime = Date.now();
      const diff = endTime - startTime;
      const diffString = `${(diff / 1000).toFixed(1)}s`;
      setElapsedTime(diffString);
    }
  }, [inProgress]);

  return duplicateRedactedThinkingBlock ? null : (
    <div className="thread-message">
      <div className="" style={{ backgroundColor: vscBackground }}>
        <div
          className="flex items-center justify-start pl-2 text-xs text-gray-300"
          data-testid="thinking-block-peek"
        >
          <ThinkingToggleButton
            type="button"
            onClick={() => setOpen(!open)}
          >
            <ThinkingStatusBadge $inProgress={inProgress}>
              {inProgress ? (
                <ThinkingTextContainer>
                  {redactedThinking ? "Redacted Thinking" : "Thinking"}
                  <AnimatedEllipsis />
                </ThinkingTextContainer>
              ) : redactedThinking ? (
                <ThinkingTextContainer>Redacted Thinking</ThinkingTextContainer>
              ) : (
                <ThinkingTextContainer>
                  {"Thought" +
                    (elapsedTime ? ` for ${elapsedTime}` : "") +
                    (tokens ? ` (${tokens} tokens)` : "")}
                </ThinkingTextContainer>
              )}
              {open ? (
                <ChevronUpIcon className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
              )}
            </ThinkingStatusBadge>
            {!open && previewText && <ThinkingPreview>{previewText}</ThinkingPreview>}
          </ThinkingToggleButton>
        </div>
        {open && (
          <div
            className="thin-scrollbar mb-2 ml-2 mt-5 overflow-y-auto opacity-100"
            style={{
              borderLeft: redactedThinking
                ? "none"
                : "2px solid var(--vscode-input-border, #606060)",
            }}
          >
            {redactedThinking ? (
              <div className="text-description-muted pl-4 text-xs">
                Thinking content redacted due to safety reasons.
              </div>
            ) : (
              <MarkdownWrapper className="-mt-1 px-0 pl-1">
                <StyledMarkdownPreview
                  isRenderingInStepContainer
                  source={content}
                  itemIndex={index}
                />
              </MarkdownWrapper>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ThinkingBlockPeek;
