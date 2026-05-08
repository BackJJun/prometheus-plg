import { Tool, ToolCallState } from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import Mustache from "mustache";
import { getStatusIntro } from "./utils";

interface ToolCallStatusMessageProps {
  tool: Tool | undefined;
  toolCallState: ToolCallState;
}

function getPrimaryTarget(toolCallState: ToolCallState): string | undefined {
  const args = {
    ...toolCallState.parsedArgs,
    ...toolCallState.processedArgs,
  } as Record<string, unknown>;

  const target =
    args.command ??
    args.filepath ??
    args.relativeFilePath ??
    args.path ??
    args.query ??
    args.url;

  return typeof target === "string" && target.trim().length > 0
    ? target.trim()
    : undefined;
}

function getCompactStatusLabel(
  tool: Tool | undefined,
  toolCallState: ToolCallState,
): string | undefined {
  const target = getPrimaryTarget(toolCallState);
  const toolName = tool?.function.name;
  const isCreateFile = toolName === BuiltInToolNames.CreateNewFile;
  const isEditFile =
    toolName === BuiltInToolNames.EditExistingFile ||
    toolName === BuiltInToolNames.SingleFindAndReplace ||
    toolName === BuiltInToolNames.MultiEdit;
  const displayTarget = target ?? tool?.displayTitle ?? toolName ?? "tool";

  switch (toolCallState.status) {
    case "generated":
      if (isCreateFile) {
        return `생성 승인 대기 ${displayTarget}`;
      }
      if (isEditFile) {
        return `수정 승인 대기 ${displayTarget}`;
      }
      return `실행 승인 대기 ${displayTarget}`;
    case "generating":
      if (isCreateFile) {
        return `생성 준비 중 ${displayTarget}`;
      }
      if (isEditFile) {
        return `수정 준비 중 ${displayTarget}`;
      }
      return `실행 준비 중 ${displayTarget}`;
    case "calling":
      if (isCreateFile) {
        return `생성 중인 ${displayTarget}`;
      }
      if (isEditFile) {
        return `수정 중인 ${displayTarget}`;
      }
      return `실행 중인 ${displayTarget}`;
    case "done":
      if (isCreateFile) {
        return `파일 생성됨 ${displayTarget}`;
      }
      if (isEditFile) {
        return `파일 수정됨 ${displayTarget}`;
      }
      return `실행됨 ${displayTarget}`;
    case "errored":
      if (isCreateFile) {
        return `파일 생성 실패 ${displayTarget}`;
      }
      if (isEditFile) {
        return `파일 수정 실패 ${displayTarget}`;
      }
      return `실행 실패 ${displayTarget}`;
    case "canceled":
      if (isCreateFile) {
        return `파일 생성 취소 ${displayTarget}`;
      }
      if (isEditFile) {
        return `파일 수정 취소 ${displayTarget}`;
      }
      return `실행 취소 ${displayTarget}`;
    default:
      return undefined;
  }
}

export function ToolCallStatusMessage({
  tool,
  toolCallState,
}: ToolCallStatusMessageProps) {
  const compactStatusLabel = getCompactStatusLabel(tool, toolCallState);
  if (compactStatusLabel) {
    return (
      <div
        className="text-description min-w-0 truncate"
        data-testid="tool-call-title"
      >
        {compactStatusLabel}
      </div>
    );
  }

  if (!tool) return "Agent tool use";

  const toolName = tool.displayTitle ?? tool.function.name;
  const defaultToolDescription = `${toolName} tool`;

  const futureMessage: string = tool.wouldLikeTo
    ? Mustache.render(tool.wouldLikeTo, toolCallState.parsedArgs)
    : `use the ${defaultToolDescription}`;
  // TODO go back and replace arg string values and tool names with <code> tags
  // to make them more readable

  let intro = getStatusIntro(toolCallState.status, tool.isInstant);
  let message = "";
  const isCompletedState =
    toolCallState.status === "done" ||
    toolCallState.status === "errored" ||
    toolCallState.status === "canceled" ||
    (tool.isInstant && toolCallState.status === "calling");

  // Handle the special case for "done" status or instant tools that are calling
  if (isCompletedState) {
    message = tool.hasAlready
      ? Mustache.render(tool.hasAlready, toolCallState.parsedArgs)
      : `used the ${defaultToolDescription}`;
  } else {
    switch (toolCallState.status) {
      case "generating":
      case "generated":
      case "canceled":
      case "errored":
        message = futureMessage;
        break;
      case "calling":
        message = tool.isCurrently
          ? Mustache.render(tool.isCurrently, toolCallState.parsedArgs)
          : `calling the ${defaultToolDescription}`;
        break;
      default:
        message = defaultToolDescription;
    }
  }

  return (
    <div
      className="text-description min-w-0 truncate"
      data-testid="tool-call-title"
    >
      {["Prometheus", intro, message].filter(Boolean).join(" ")}
    </div>
  );
}
