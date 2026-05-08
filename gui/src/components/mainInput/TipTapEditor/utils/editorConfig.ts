import { Editor, JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { Plugin } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { InputModifiers } from "core";
import { usePostHog } from "posthog-js/react";
import { useRef } from "react";
import { IIdeMessenger } from "../../../../context/IdeMessenger";
import { useSubmenuContextProviders } from "../../../../context/SubmenuContextProviders";
import { useInputHistory } from "../../../../hooks/useInputHistory";
import useUpdatingRef from "../../../../hooks/useUpdatingRef";
import { useAppSelector } from "../../../../redux/hooks";
import { selectUseActiveFile } from "../../../../redux/selectors";
import { AppDispatch } from "../../../../redux/store";
import { exitEdit } from "../../../../redux/thunks/edit";
import { getFontSize, isJetBrains } from "../../../../util";
import { CodeBlock, Mention, PromptBlock, SlashCommand } from "../extensions";
import { ImageAttachmentPreview } from "../extensions/ImageAttachment/ImageAttachmentPreview";
import { TipTapEditorProps } from "../TipTapEditor";
import {
  getContextProviderDropdownOptions,
  getSlashCommandDropdownOptions,
} from "./getSuggestion";
import { createImageAttachmentNode } from "./imageUtils";

export function getPlaceholderText(
  placeholder: TipTapEditorProps["placeholder"],
  historyLength: number,
) {
  if (placeholder) {
    return placeholder;
  }

  return historyLength === 0
    ? "Ask anything, '@' to add context"
    : "Ask a follow-up";
}

/**
 * Checks if the editor content is valid for submission.
 * A valid submission can contain either text content or prompt/code blocks
 *
 * @param json The editor JSON content
 * @returns true if the content is valid for submission, false otherwise
 */
export function hasValidEditorContent(json: JSONContent): boolean {
  // Check for prompt or code blocks
  const hasPromptOrCodeBlock = json.content?.some(
    (c) => c.type === PromptBlock.name || c.type === CodeBlock.name,
  );

  // Check for text content
  const hasTextContent = json.content?.some((c) => c.content);

  // Content is valid if it has either text or special blocks
  return hasTextContent || hasPromptOrCodeBlock || false;
}

/**
 * This function is called only once, so we need to use refs to pass in the latest values
 */
export function createEditorConfig(options: {
  props: TipTapEditorProps;
  ideMessenger: IIdeMessenger;
  dispatch: AppDispatch;
}) {
  const { props, ideMessenger, dispatch } = options;

  const posthog = usePostHog();

  const { getSubmenuContextItems, refreshSubmenuProvider } =
    useSubmenuContextProviders();
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const useActiveFile = useAppSelector(selectUseActiveFile);
  const historyLength = useAppSelector((store) => store.session.history.length);
  const codeToEdit = useAppSelector((store) => store.editModeState.codeToEdit);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);
  const isInEditRef = useUpdatingRef(isInEdit);

  const inSubmenuRef = useRef<string | undefined>(undefined);
  const inDropdownRef = useRef(false);
  const isStreamingRef = useUpdatingRef(isStreaming);
  const getSubmenuContextItemsRef = useUpdatingRef(getSubmenuContextItems);
  const availableContextProvidersRef = useUpdatingRef(
    props.availableContextProviders,
  );
  const historyLengthRef = useUpdatingRef(historyLength);
  const availableSlashCommandsRef = useUpdatingRef(
    props.availableSlashCommands,
  );
  const { prevRef, nextRef, addRef } = useInputHistory(props.historyKey);

  const enterSubmenu = async (editor: Editor, providerId: string) => {
    if (providerId === "reference") {
      try {
        await refreshSubmenuProvider("reference");
      } catch (error) {
        console.error(
          "Failed to refresh reference submenu items before opening submenu:",
          error,
        );
      }
    }

    const contents = editor.getText();
    const indexOfAt = contents.lastIndexOf("@");
    if (indexOfAt === -1) {
      return;
    }

    // Find the position of the last @ character
    // We do this because editor.getText() isn't a correct representation including node views
    let startPos = editor.state.selection.anchor;
    while (
      startPos > 0 &&
      editor.state.doc.textBetween(startPos, startPos + 1) !== "@"
    ) {
      startPos--;
    }
    startPos++;

    editor.commands.deleteRange({
      from: startPos,
      to: editor.state.selection.anchor,
    });
    inSubmenuRef.current = providerId;

    // to trigger refresh of suggestions
    editor.commands.insertContent(":");
    editor.commands.deleteRange({
      from: editor.state.selection.anchor - 1,
      to: editor.state.selection.anchor,
    });
  };

  const onClose = () => {
    inSubmenuRef.current = undefined;
    inDropdownRef.current = false;
  };

  const onOpen = () => {
    inDropdownRef.current = true;
  };

  const editor: Editor | null = useEditor({
    extensions: [
      Document,
      History,
      Image.extend({
        inline: true,
        group: "inline",
        addAttributes() {
          return {
            ...this.parent?.(),
            fileName: {
              default: "Image",
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(ImageAttachmentPreview, {
            as: "span",
          });
        },
        addProseMirrorPlugins() {
          const plugin = new Plugin({
            props: {
              handleDOMEvents: {
                paste(_view, _event) {
                  // Image paste attachment is temporarily disabled.
                  return false;
                },
              },
            },
          });
          return [plugin];
        },
      }),
      Placeholder.configure({
        placeholder: getPlaceholderText(
          props.placeholder,
          historyLengthRef.current,
        ),
      }),
      Paragraph.extend({
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (inDropdownRef.current) {
                return false;
              }

              onEnter({
                useCodebase: false,
                noContext: !useActiveFile,
              });
              return true;
            },

            "Mod-Enter": () => {
              posthog.capture("gui_use_active_file_enter");

              onEnter({
                useCodebase: false,
                noContext: !!useActiveFile,
              });

              return true;
            },
            "Alt-Enter": () => {
              posthog.capture("gui_use_active_file_enter");

              onEnter({
                useCodebase: false,
                noContext: !!useActiveFile,
              });

              return true;
            },
            "Mod-Backspace": () => {
              // If you press cmd+backspace wanting to cancel,
              // but are inside of a text box, it shouldn't
              // delete the text
              if (isStreamingRef.current) {
                return true;
              }
              return false;
            },
            "Shift-Enter": () =>
              this.editor.commands.first(({ commands }) => [
                () => commands.newlineInCode(),
                () => commands.createParagraphNear(),
                () => commands.liftEmptyBlock(),
                () => commands.splitBlock(),
              ]),

            ArrowUp: () => {
              if (this.editor.state.selection.anchor > 1) {
                return false;
              }

              const previousInput = prevRef.current(
                this.editor.state.toJSON().doc,
              );
              if (previousInput) {
                this.editor.commands.setContent(previousInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus("start");
                }, 0);
                return true;
              }
              return false;
            },
            Escape: () => {
              if (inDropdownRef.current) {
                return false;
              }
              // In JetBrains, this is how we close the sidebar when the input box is focused
              if (isJetBrains()) {
                ideMessenger.post("closeSidebar", undefined);
                return true;
              }

              if (isInEditRef.current) {
                void dispatch(
                  exitEdit({
                    openNewSession: false,
                  }),
                );
              }
              ideMessenger.post("focusEditor", undefined);

              return true;
            },
            ArrowDown: () => {
              if (
                this.editor.state.selection.anchor <
                this.editor.state.doc.content.size - 1
              ) {
                return false;
              }
              const nextInput = nextRef.current();
              if (nextInput) {
                this.editor.commands.setContent(nextInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus("end");
                }, 0);
                return true;
              }
              return false;
            },
          };
        },
      }).configure({
        HTMLAttributes: {
          class: "my-1",
        },
      }),
      Text,
      Mention.configure({
        suggestion: getContextProviderDropdownOptions(
          availableContextProvidersRef,
          getSubmenuContextItemsRef,
          enterSubmenu,
          onClose,
          onOpen,
          inSubmenuRef,
          ideMessenger,
        ),
      }),
      SlashCommand.configure({
        suggestion: getSlashCommandDropdownOptions(
          availableSlashCommandsRef,
          onClose,
          onOpen,
          ideMessenger,
          dispatch,
          props.inputId,
        ),
      }),
      PromptBlock,
      CodeBlock,
    ],
    editorProps: {
      attributes: {
        "data-testid": props.isMainInput
          ? "editor-input-main"
          : `editor-input-${props.inputId}`,
        class: "ProseMirror outline-none overflow-hidden",
        style: `font-size: ${getFontSize()}px;`,
      },
    },
    content: props.editorState,
    editable: !isStreaming || props.isMainInput,
  });

  const onEnter = (modifiers: InputModifiers) => {
    if (!editor) {
      return;
    }
    if (isStreamingRef.current || (codeToEdit.length === 0 && isInEdit)) {
      return;
    }

    const json = editor.getJSON();

    // Don't do anything if input box doesn't have valid content
    if (!hasValidEditorContent(json)) {
      return;
    }

    if (props.isMainInput) {
      addRef.current(json);
    }

    props.onEnter(json, modifiers, editor);
  };

  return { editor, onEnter };
}
