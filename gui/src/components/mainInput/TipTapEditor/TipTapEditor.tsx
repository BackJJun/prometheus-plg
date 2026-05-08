import { Editor, EditorContent, JSONContent } from "@tiptap/react";
import { ContextProviderDescription, InputModifiers } from "core";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import useIsOSREnabled from "../../../hooks/useIsOSREnabled";
import useUpdatingRef from "../../../hooks/useUpdatingRef";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import InputToolbar, { ToolbarOptions } from "../InputToolbar";
import { ComboBoxItem } from "../types";
import { InputBoxDiv } from "./components/StyledComponents";
import { useMainEditor } from "./MainEditorProvider";
import "./TipTapEditor.css";
import { createEditorConfig, getPlaceholderText } from "./utils/editorConfig";
import { useEditorEventHandlers } from "./utils/keyHandlers";

export interface TipTapEditorProps {
  availableContextProviders: ContextProviderDescription[];
  availableSlashCommands: ComboBoxItem[];
  isMainInput: boolean;
  onEnter: (
    editorState: JSONContent,
    modifiers: InputModifiers,
    editor: Editor,
  ) => void;
  editorState?: JSONContent;
  toolbarOptions?: ToolbarOptions;
  placeholder?: string;
  historyKey: string;

  // TODO: This isn't actually used anywhere in this component, but it appears
  // to be pulled into some of our TipTap extensions.
  inputId: string;
}

export const TIPPY_DIV_ID = "tippy-js-div";

function TipTapEditorInner(props: TipTapEditorProps) {
  const dispatch = useAppDispatch();
  const mainEditorContext = useMainEditor();

  const isOSREnabled = useIsOSREnabled();

  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const historyLength = useAppSelector((store) => store.session.history.length);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);

  const { editor, onEnter } = createEditorConfig({
    props,
    ideMessenger: useContext(IdeMessengerContext),
    dispatch,
  });

  useEffect(() => {
    if (props.isMainInput && editor) {
      mainEditorContext.setMainEditor(editor);
      mainEditorContext.setInputId(props.inputId);
      mainEditorContext.onEnterRef.current = onEnter;
    }
  }, [
    editor,
    props.isMainInput,
    props.inputId,
    mainEditorContext,
    onEnter,
    isStreaming,
  ]);

  const [shouldHideToolbar, setShouldHideToolbar] = useState(true);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const placeholder = getPlaceholderText(props.placeholder, historyLength);
    const placeholderExt = editor.extensionManager.extensions.find(
      (e) => e.name === "placeholder",
    ) as any;
    if (placeholderExt) {
      placeholderExt.options["placeholder"] = placeholder;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, props.placeholder, historyLength]);

  useEffect(() => {
    if (props.isMainInput) {
      editor?.commands.clearContent(true);
    }
  }, [editor, props.isMainInput]);

  useEffect(() => {
    if (isInEdit) {
      setShouldHideToolbar(false);
    }
  }, [isInEdit]);

  const editorFocusedRef = useUpdatingRef(editor?.isFocused, [editor]);

  useEffect(() => {
    if (props.isMainInput) {
      editor?.commands.focus();
    }
  }, [props.isMainInput, editor]);

  useEffect(() => {
    if (editor && !isStreaming && props.isMainInput && document.hasFocus()) {
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }, [props.isMainInput, isStreaming, editor]);

  useEffect(() => {
    if (!isStreaming && !props.isMainInput && editor) {
      const timeoutId = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.setOptions({ editable: true });
          editor.view.dispatch(editor.state.tr);
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, props.isMainInput, editor]);

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const insertCharacterWithWhitespace = useCallback(
    (char: string) => {
      if (!editor) {
        return;
      }
      const text = editor.getText();
      if (!text.endsWith(char)) {
        if (text.length > 0 && !text.endsWith(" ")) {
          editor.commands.insertContent(` ${char}`);
        } else {
          editor.commands.insertContent(char);
        }
      }
    },
    [editor],
  );

  const { handleKeyUp, handleKeyDown } = useEditorEventHandlers({
    editor,
    isOSREnabled,
    editorFocusedRef,
    setActiveKey,
  });

  const blurTimeout = useRef<NodeJS.Timeout | null>(null);
  const cancelBlurTimeout = useCallback(() => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      if (isInEdit) {
        return;
      }

      const currentTarget = e.currentTarget;
      const relatedTarget = e.relatedTarget as Node | null;

      if (relatedTarget && currentTarget?.contains(relatedTarget)) {
        return;
      }

      blurTimeout.current = setTimeout(() => {
        setShouldHideToolbar(true);
      }, 100);
    },
    [isInEdit],
  );

  const handleFocus = useCallback(() => {
    cancelBlurTimeout();
    setShouldHideToolbar(false);
  }, [cancelBlurTimeout]);

  return (
    <InputBoxDiv
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className={
        !props.isMainInput && shouldHideToolbar
          ? "cursor-pointer"
          : "cursor-text"
      }
      onClick={() => {
        editor?.commands.focus();
      }}
      // Image drag and drop is temporarily disabled.
    >
      <div className="px-2.5 pb-1 pt-2">
        <EditorContent
          className={`scroll-container overflow-y-scroll ${props.isMainInput ? "max-h-[70vh]" : ""}`}
          spellCheck={false}
          editor={editor}
          onClick={(event) => {
            event.stopPropagation();
          }}
        />
        <InputToolbar
          isMainInput={props.isMainInput}
          toolbarOptions={props.toolbarOptions}
          activeKey={activeKey}
          hidden={shouldHideToolbar && !props.isMainInput}
          onAddContextItem={() => insertCharacterWithWhitespace("@")}
          onEnter={onEnter}
          disabled={isStreaming}
        />
      </div>
      <div id={TIPPY_DIV_ID} className="fixed z-50" />
    </InputBoxDiv>
  );
}

function toolbarOptionsEqual(a?: ToolbarOptions, b?: ToolbarOptions) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.hideAddContext === b.hideAddContext &&
    a.hideImageUpload === b.hideImageUpload &&
    a.hideUseCodebase === b.hideUseCodebase &&
    a.hideSelectModel === b.hideSelectModel &&
    a.enterText === b.enterText
  );
}

const MemoInner = memo(
  TipTapEditorInner,
  (prev, next) =>
    prev.isMainInput === next.isMainInput &&
    prev.placeholder === next.placeholder &&
    prev.historyKey === next.historyKey &&
    prev.inputId === next.inputId &&
    toolbarOptionsEqual(prev.toolbarOptions, next.toolbarOptions) &&
    (prev.availableContextProviders?.length || 0) ===
      (next.availableContextProviders?.length || 0) &&
    (prev.availableSlashCommands?.length || 0) ===
      (next.availableSlashCommands?.length || 0),
);

export function TipTapEditor(props: TipTapEditorProps) {
  return (
    <div className="relative w-full">
      <MemoInner {...props} />
    </div>
  );
}
