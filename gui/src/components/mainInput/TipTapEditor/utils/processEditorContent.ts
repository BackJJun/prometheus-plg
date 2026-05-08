import Image from "@tiptap/extension-image";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { JSONContent } from "@tiptap/react";
import {
  ContextItemWithId,
  MessagePart,
  RangeInFile,
  TextMessagePart,
} from "core";
import { ctxItemToRifWithContents } from "core/commands/util";
import { getUriDescription } from "core/util/uri";
import { CodeBlock, Mention, PromptBlock } from "../extensions";
import { GetContextRequest } from "./types";

interface MentionAttrs {
  label: string;
  id: string;
  itemType?: string;
  query?: string;
  description?: string;
}

function resolvePromptBlock(p: JSONContent): string | undefined {
  return p.attrs?.item.name;
}

function appendTextPart(parts: MessagePart[], text: string) {
  if (!text) {
    return;
  }

  if (parts[parts.length - 1]?.type === "text") {
    (parts[parts.length - 1] as TextMessagePart).text += text;
  } else {
    parts.push({ type: "text", text });
  }
}

function resolveParagraph(
  p: JSONContent,
): [MessagePart[], GetContextRequest[]] {
  const contextRequests: GetContextRequest[] = [];
  const parts: MessagePart[] = [];
  let isFirstTextSegment = true;

  for (const child of p.content || []) {
    switch (child.type) {
      case Text.name: {
        const text = child.text ?? "";
        appendTextPart(parts, isFirstTextSegment ? text.trimStart() : text);
        isFirstTextSegment = false;
        break;
      }
      case Mention.name: {
        const attrs = child.attrs as MentionAttrs;
        console.log("[processEditorContent] Found Mention:", {
          itemType: attrs.itemType,
          id: attrs.id,
          query: attrs.query,
          label: attrs.label,
        });
        if (attrs.itemType === "reference" && attrs.query) {
          contextRequests.push({
            provider: "reference",
            query: attrs.query,
            resolvedContextItem: {
              id: {
                providerTitle: "reference",
                itemId: attrs.query,
              },
              name: attrs.label ?? attrs.id,
              description: attrs.description || "Code reference",
              content: "",
            },
          });
        } else {
          contextRequests.push({
            provider:
              attrs.itemType === "contextProvider" ? attrs.id : attrs.itemType!,
            query: attrs.query,
          });
        }

        appendTextPart(
          parts,
          (child.attrs?.renderInlineAs ?? child.attrs?.label ?? "").trimStart(),
        );
        isFirstTextSegment = false;
        break;
      }
      case Image.name:
        parts.push({
          type: "imageUrl",
          imageUrl: { url: child.attrs?.src },
        });
        isFirstTextSegment = false;
        break;
      default:
        console.warn("Unexpected child type", child.type);
    }
  }

  return [parts, contextRequests];
}

export function processEditorContent(editorState: JSONContent) {
  const contextRequests: GetContextRequest[] = [];
  const selectedCode: RangeInFile[] = [];
  let slashCommandName: string | undefined;

  const parts: MessagePart[] = [];
  for (const p of editorState?.content || []) {
    switch (p.type) {
      case PromptBlock.name:
        slashCommandName = resolvePromptBlock(p);
        break;
      case Paragraph.name: {
        const [paragraphParts, ctxItems] = resolveParagraph(p);

        contextRequests.push(...ctxItems);

        for (const paragraphPart of paragraphParts) {
          if (paragraphPart.type === "text") {
            const text = paragraphPart.text;
            if (!text) {
              continue;
            }

            if (parts[parts.length - 1]?.type === "text") {
              (parts[parts.length - 1] as TextMessagePart).text += "\n" + text;
            } else {
              parts.push({ type: "text", text });
            }
          } else {
            parts.push(paragraphPart);
          }
        }
        break;
      }
      case CodeBlock.name:
        if (!p.attrs?.item) {
          console.warn("codeBlock has no item attribute");
          break;
        }

        const contextItem = p.attrs.item as ContextItemWithId;
        const rif = ctxItemToRifWithContents(contextItem, true);
        selectedCode.push(rif);

        // If editing, only include in selectedCode
        if (contextItem.editing) {
          break;
        }

        const { extension, relativePathOrBasename } = getUriDescription(
          rif.filepath,
          window.workspacePaths ?? [],
        );
        const codeText = `\n\`\`\`${extension} ${relativePathOrBasename} (${rif.range.start.line + 1}-${rif.range.end.line + 1})\n${contextItem.content}\n\`\`\`\n`;

        if (parts[parts.length - 1]?.type === "text") {
          (parts[parts.length - 1] as TextMessagePart).text += "\n" + codeText;
        } else {
          parts.push({ type: "text", text: codeText });
        }
        break;
      case Image.name:
        parts.push({
          type: "imageUrl",
          imageUrl: { url: p.attrs?.src },
        });
        break;
      default: {
        console.warn("Unexpected content type", p.type);
      }
    }
  }

  return { parts, contextRequests, selectedCode, slashCommandName };
}
