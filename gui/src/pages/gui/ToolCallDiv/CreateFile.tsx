import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { inferResolvedUriFromRelativePath } from "core/util/ideUtils";
import type { MouseEvent } from "react";
import { useContext, useMemo, useState } from "react";
import { CollapsibleContainer } from "../../../components/StyledMarkdownPreview/StepContainerPreToolbar/CollapsibleContainer";
import { CopyButton } from "../../../components/StyledMarkdownPreview/StepContainerPreToolbar/CopyButton";
import { FileInfo } from "../../../components/StyledMarkdownPreview/StepContainerPreToolbar/FileInfo";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppSelector } from "../../../redux/hooks";
import { cn } from "../../../util/cn";

interface CreateFileToolCallProps {
  relativeFilepath: string;
  fileContents: string;
  historyIndex: number;
}

export function CreateFile(props: CreateFileToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const ideMessenger = useContext(IdeMessengerContext);
  const config = useAppSelector((state) => state.config.config);

  const lines = useMemo(
    () => props.fileContents.split("\n"),
    [props.fileContents],
  );
  const addedLines = useMemo(
    () =>
      lines.length > 0 && lines[lines.length - 1] === ""
        ? lines.length - 1
        : lines.length,
    [lines],
  );

  if (!props.fileContents) {
    return null;
  }

  async function onClickFilename(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (!props.relativeFilepath) {
      return;
    }

    const filepath = await inferResolvedUriFromRelativePath(
      props.relativeFilepath,
      ideMessenger.ide,
    );

    ideMessenger.post("showFile", { filepath });
  }

  return props.relativeFilepath ? (
    <div className="outline-command-border -outline-offset-0.5 rounded-default bg-editor mx-2 my-1 flex min-w-0 flex-col outline outline-1">
      <div
        className={cn(
          "find-widget-skip bg-editor sticky -top-2 z-10 m-0 flex cursor-pointer items-center justify-between gap-3 px-1.5 py-1",
          isExpanded
            ? "rounded-t-default border-command-border border-b"
            : "rounded-default",
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex min-w-0 flex-1 flex-row items-center gap-2 text-xs">
          <div className="flex min-w-0 flex-row items-center">
            <ChevronDownIcon
              data-testid="toggle-create-file-diff"
              className={cn(
                "text-lightgray h-3.5 w-3.5 flex-shrink-0 cursor-pointer select-none transition-all hover:brightness-125",
                isExpanded ? "rotate-0" : "-rotate-90",
              )}
            />
            <FileInfo
              filepath={props.relativeFilepath}
              onClick={onClickFilename}
            />
          </div>
          <div className="flex items-center gap-1 font-mono text-xs">
            <span className="text-success">+{addedLines}</span>
          </div>
        </div>

        <div
          className="flex flex-shrink-0 items-center gap-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <CopyButton text={props.fileContents} />
        </div>
      </div>

      {isExpanded && (
        <CollapsibleContainer collapsible>
          <div
            className={`${config?.ui?.showChatScrollbar ? "thin-scrollbar" : "no-scrollbar"} max-h-72 overflow-auto`}
          >
            <pre
              className={`bg-editor m-0 w-fit min-w-full text-xs leading-tight ${config?.ui?.codeWrap ? "whitespace-pre-wrap" : "whitespace-pre"}`}
            >
              {lines.map((line, index) => {
                const isLastPartLine = index === lines.length - 1;
                if (line === "" && isLastPartLine) {
                  return null;
                }
                return (
                  <div
                    key={index}
                    className="text-foreground border-l-4 border-green-600 bg-green-600/20 px-3 py-px font-mono"
                  >
                    <span className="mr-2 select-none text-green-600">+</span>
                    {line}
                  </div>
                );
              })}
            </pre>
          </div>
        </CollapsibleContainer>
      )}
    </div>
  ) : null;
}
