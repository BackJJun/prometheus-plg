import { useMemo, useRef } from "react";
import { useAppSelector } from "../../redux/hooks";
import { ToolTip } from "../gui/Tooltip";

function formatTokenCount(tokens?: number) {
  if (tokens === undefined) {
    return "?";
  }

  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }

  return tokens.toLocaleString();
}

const ContextStatus = () => {
  const contextPercentage = useAppSelector(
    (state) => state.session.contextPercentage,
  );
  const selectedChatModel = useAppSelector(
    (state) => state.config.config.selectedModelByRole.chat?.model,
  );
  const contextLength = useAppSelector(
    (state) => state.config.config.selectedModelByRole.chat?.contextLength,
  );
  const previousHistoryLength = useRef<number | null>(null);
  const previousSelectedChatModel = useRef<string | null>(null);
  const history = useAppSelector((state) => state.session.history);
  const percent = Math.round((contextPercentage ?? 0) * 100);
  const isPruned = useAppSelector((state) => state.session.isPruned);
  const willAutoCompact = percent >= 80 && !isPruned;
  const usedTokens =
    contextLength && contextPercentage !== undefined
      ? Math.round(contextLength * contextPercentage)
      : undefined;

  const isDifferentModelAndSameHistory = useMemo(() => {
    if (!selectedChatModel) return false;

    if (previousHistoryLength.current !== history.length) {
      previousHistoryLength.current = history.length;
      previousSelectedChatModel.current = selectedChatModel;
      return false;
    }

    return previousSelectedChatModel.current !== selectedChatModel;
  }, [history.length, selectedChatModel]);

  if (contextPercentage === undefined) {
    return null;
  }

  if (isDifferentModelAndSameHistory) {
    return null;
  }

  const barColorClass = isPruned ? "bg-error" : "bg-description";

  return (
    <div>
      <ToolTip
        closeEvents={{
          mouseleave: true,
          click: true,
          mouseup: false,
        }}
        clickable
        content={
          <div className="flex min-w-[150px] flex-col items-center gap-0.5 text-center text-xs">
            <span className="text-description inline-block">컨텍스트 창:</span>
            <span className="text-description inline-block">{percent}% 참</span>
            <span className="inline-block">
              {formatTokenCount(usedTokens)}/{formatTokenCount(contextLength)}{" "}
              토큰 사용
            </span>
            {isPruned && (
              <span className="inline-block">
                오래된 메시지가 일부 제외되고 있습니다.
              </span>
            )}
            {willAutoCompact && (
              <span className="mt-1 inline-block font-semibold">
                Prometheus가 컨텍스트를 자동으로 압축합니다
              </span>
            )}
          </div>
        }
      >
        <div className="border-command-border relative h-[14px] w-[7px] rounded-[1px] border-[0.5px] border-solid md:h-[10px] md:w-[5px]">
          <div
            className={`transition-height absolute bottom-0 left-0 w-full duration-300 ease-in-out ${barColorClass}`}
            style={{ height: `${percent}%` }}
          />
        </div>
      </ToolTip>
    </div>
  );
};

export default ContextStatus;
