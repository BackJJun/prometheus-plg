import * as Icons from "@heroicons/react/24/outline";
import {
  ContextItem,
  ContextItemWithId,
  ToolCallState,
  ToolStatus,
} from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import { ComponentType, SVGProps } from "react";
import Spinner from "../../../components/gui/Spinner";

// Helper function to determine the intro verb based on tool call status
export function getStatusIntro(
  status: ToolCallState["status"],
  isInstant?: boolean,
): string {
  if (
    status === "done" ||
    status === "errored" ||
    status === "canceled" ||
    (isInstant && status === "calling")
  ) {
    return "";
  }

  switch (status) {
    case "generating":
      return "will";
    case "generated":
      return "will";
    case "calling":
      return "is";
    default:
      return "";
  }
}

// Helper function to get the appropriate verb for group actions
export function getGroupActionVerb(toolCallStates: ToolCallState[]): string {
  if (toolCallStates.length === 0) return "Performing";

  // Get the most "active" status from all tool calls
  const statuses = toolCallStates.map((state) => state.status);

  // Priority order: calling > generating > generated > done > errored/canceled
  if (statuses.includes("calling")) {
    return "Performing";
  } else if (statuses.includes("generating")) {
    return "Generating";
  } else if (statuses.includes("generated")) {
    return "Pending";
  } else if (statuses.some((s) => s === "done")) {
    return "Performed";
  } else if (statuses.some((s) => s === "errored" || s === "canceled")) {
    return "Attempted";
  }

  return "Performing";
}

type IconName = keyof typeof Icons;

type Icon = ComponentType<SVGProps<SVGSVGElement>> | undefined;

export function getIconByName(name: string): Icon | null {
  if (name in Icons) {
    return Icons[name as IconName] as Icon;
  }
  return null;
}

export function getStatusIcon(state: ToolStatus) {
  switch (state) {
    case "generating":
    case "calling":
      return <Spinner />;
    case "generated":
      return <Icons.ClockIcon className="text-description" />;
    case "done":
      return <Icons.CheckCircleIcon className="text-[#3fb950]" />;
    case "errored":
      return <Icons.ExclamationTriangleIcon className="text-red-500" />;
    case "canceled":
      return <Icons.XCircleIcon className="text-description" />;
  }
}

function getToolCallName(toolCallState: ToolCallState): string | undefined {
  return toolCallState.toolCall.function?.name;
}

function getToolCallGroupType(
  toolCallState: ToolCallState,
): "command" | "create" | "edit" | "other" {
  const toolName = getToolCallName(toolCallState);

  if (toolName === BuiltInToolNames.RunTerminalCommand) {
    return "command";
  }
  if (toolName === BuiltInToolNames.CreateNewFile) {
    return "create";
  }
  if (
    toolName === BuiltInToolNames.EditExistingFile ||
    toolName === BuiltInToolNames.SingleFindAndReplace ||
    toolName === BuiltInToolNames.MultiEdit
  ) {
    return "edit";
  }

  return "other";
}

export function getGroupedToolCallSummary(
  toolCallStates: ToolCallState[],
): string {
  const count = toolCallStates.length;
  if (count === 0) {
    return "작업 0개 실행";
  }

  const groupTypes = toolCallStates.map(getToolCallGroupType);
  const firstGroupType = groupTypes[0];
  const hasSingleGroupType = groupTypes.every((type) => type === firstGroupType);

  if (hasSingleGroupType) {
    switch (firstGroupType) {
      case "command":
        return `명령어 ${count}개 실행`;
      case "create":
        return `파일 ${count}개 생성`;
      case "edit":
        return `파일 ${count}개 수정`;
      default:
        break;
    }
  }

  return `작업 ${count}개 실행`;
}

export function toolCallStateToContextItems(
  toolCallState: ToolCallState | undefined,
): ContextItemWithId[] {
  if (!toolCallState) {
    return [];
  }
  return (
    toolCallState.output?.map((ctxItem) =>
      toolCallCtxItemToCtxItemWithId(ctxItem, toolCallState.toolCallId),
    ) ?? []
  );
}

export function toolCallCtxItemToCtxItemWithId(
  ctxItem: ContextItem,
  toolCallId: string,
): ContextItemWithId {
  return {
    ...ctxItem,
    id: {
      providerTitle: "toolCall",
      itemId: toolCallId,
    },
  };
}
