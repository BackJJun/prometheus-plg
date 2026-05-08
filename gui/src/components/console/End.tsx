import {
  LLMInteractionCancel,
  LLMInteractionError,
  LLMInteractionSuccess,
} from "core";
import Expander from "./Expander";
import Message from "./Message";

export interface StartProps {
  item: LLMInteractionSuccess | LLMInteractionError | LLMInteractionCancel;
}

export default function Start({ item }: StartProps) {
  //  <div className="border-0 border-b-2 border-solid border-[color:var(--vscode-panel-border)]">
  switch (item.kind) {
    case "success":
      return <></>;
    case "error":
    case "cancel":
      return <></>;
  }
}
