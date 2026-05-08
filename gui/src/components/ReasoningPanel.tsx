import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { type ReactNode } from "react";
import styled, { keyframes } from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscCommandCenterActiveBorder,
  vscCommandCenterInactiveBorder,
} from ".";
import { getFontSize } from "../util";

type StatusTone = "progress" | "complete" | "muted";

interface ReasoningPanelProps {
  open: boolean;
  onToggle: () => void;
  title?: string;
  hideTitle?: boolean;
  statusLabel: string;
  statusTone: StatusTone;
  previewText?: string;
  metaItems?: string[];
  contentId: string;
  children?: ReactNode;
}

const pulse = keyframes`
  0%,
  100% {
    transform: scale(1);
    opacity: 0.75;
  }

  50% {
    transform: scale(1.18);
    opacity: 1;
  }
`;

const Panel = styled.div`
  margin: 1px 0 2px 0;
  overflow: hidden;
  container-type: inline-size;
`;

const HeaderButton = styled.button<{ $tone: StatusTone }>`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: ${({ $tone }) =>
    $tone === "progress"
      ? "#3fb950"
      : $tone === "complete"
        ? "#58a6ff"
        : "var(--vscode-descriptionForeground)"};
  padding: 0;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  overflow: hidden;
  font-family: inherit;
  appearance: none;
  box-shadow: none;
  line-height: 1.2;

  &:hover {
    filter: brightness(1.08);
  }

  &:focus-visible {
    outline: 1px solid ${vscCommandCenterActiveBorder};
    outline-offset: -1px;
  }
`;

const HeaderRow = styled.div`
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const TitleGroup = styled.span`
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const Title = styled.span`
  font-size: ${getFontSize() - 2}px;
  font-weight: 500;
  letter-spacing: 0;
`;

const MetaGroup = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 4px;
`;

const StatusBadge = styled.span<{ $tone: StatusTone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 16px;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "progress"
      ? "rgba(35, 134, 54, 0.16)"
      : $tone === "complete"
        ? "rgba(56, 139, 253, 0.16)"
        : "rgba(127, 127, 127, 0.08)"};
  font-size: ${getFontSize() - 3}px;
  font-weight: 500;
  color: inherit;
`;

const StatusText = styled.span`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const StatusDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  animation: ${pulse} 1.2s ease-in-out infinite;
`;

const MetaChip = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 5px;
  border-radius: ${defaultBorderRadius};
  font-size: ${getFontSize() - 4}px;
  color: ${lightGray};
  background: transparent;
`;

const PreviewText = styled.span`
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: ${lightGray};
  font-size: ${getFontSize() - 3}px;
  line-height: 1.3;
`;

const ContentShell = styled.div`
  margin: 2px 0 8px 15px;
  padding-left: 9px;
  border-left: 1px solid ${vscCommandCenterInactiveBorder};
`;

const ContentInner = styled.div`
  max-height: min(22rem, 48vh);
  overflow: auto;
`;

const ContentRail = styled.div`
  padding: 4px 0;
`;

const UnavailableNote = styled.div`
  padding: 4px 0;
  color: ${lightGray};
  font-size: ${getFontSize() - 2}px;
  line-height: 1.5;
`;

export function buildReasoningPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export default function ReasoningPanel({
  open,
  onToggle,
  title = "Reasoning",
  hideTitle = false,
  statusLabel,
  statusTone,
  previewText,
  metaItems = [],
  contentId,
  children,
}: ReasoningPanelProps) {
  const hasContent = Boolean(children);
  const showPreview = !open && previewText;

  return (
    <Panel>
      <HeaderButton
        type="button"
        $tone={statusTone}
        aria-expanded={hasContent ? open : undefined}
        aria-controls={hasContent ? contentId : undefined}
        onClick={onToggle}
      >
        <HeaderRow>
          {!hideTitle && (
            <TitleGroup>
              <Title>{title}</Title>
            </TitleGroup>
          )}
          <MetaGroup>
            <StatusBadge $tone={statusTone}>
              {open ? (
                <ChevronUpIcon className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
              )}
              {statusTone === "progress" && <StatusDot />}
              <StatusText>{statusLabel}</StatusText>
            </StatusBadge>
            {metaItems.map((item) => (
              <MetaChip key={item}>{item}</MetaChip>
            ))}
          </MetaGroup>
        </HeaderRow>
        {showPreview && <PreviewText>{previewText}</PreviewText>}
      </HeaderButton>
      {open && hasContent && (
        <ContentShell id={contentId}>
          <ContentInner className="thin-scrollbar">
            {statusTone === "muted" ? (
              <UnavailableNote>{children}</UnavailableNote>
            ) : (
              <ContentRail>{children}</ContentRail>
            )}
          </ContentInner>
        </ContentShell>
      )}
    </Panel>
  );
}
