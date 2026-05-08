import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { IIdeMessenger } from "../../../../context/IdeMessenger";

const IMAGE_RESOLUTION = 1024;
export const MAX_IMAGE_ATTACHMENTS = 3;

export function getDataUrlForFile(
  file: File,
  img: HTMLImageElement,
): string | undefined {
  const targetWidth = IMAGE_RESOLUTION;
  const targetHeight = IMAGE_RESOLUTION;
  const scaleFactor = Math.min(
    targetWidth / img.width,
    targetHeight / img.height,
  );

  const canvas = document.createElement("canvas");
  canvas.width = img.width * scaleFactor;
  canvas.height = img.height * scaleFactor;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Error getting image data url: 2d context not found");
    return;
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const downsizedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return downsizedDataUrl;
}

export async function handleImageFile(
  ideMessenger: IIdeMessenger,
  file: File,
): Promise<[HTMLImageElement, string] | undefined> {
  let filesize = file.size / 1024 / 1024; // filesize in MB
  // check image type and size
  if (
    [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/svg",
      "image/webp",
    ].includes(file.type) &&
    filesize < 10
  ) {
    // check dimensions
    let _URL = window.URL || window.webkitURL;
    let img = new window.Image();
    img.src = _URL.createObjectURL(file);

    return await new Promise((resolve) => {
      img.onload = function () {
        const dataUrl = getDataUrlForFile(file, img);
        if (!dataUrl) {
          return;
        }

        let image = new window.Image();
        image.src = dataUrl;
        image.onload = function () {
          resolve([image, dataUrl]);
        };
      };
    });
  } else {
    ideMessenger.post("showToast", [
      "error",
      "Images need to be in jpg or png format and less than 10MB in size.",
    ]);
  }
}

export function countImageAttachments(doc: ProseMirrorNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "image") {
      count += 1;
    }
  });
  return count;
}

export function ensureImageAttachmentLimit(
  doc: ProseMirrorNode,
  ideMessenger: IIdeMessenger,
): boolean {
  if (countImageAttachments(doc) >= MAX_IMAGE_ATTACHMENTS) {
    ideMessenger.post("showToast", [
      "error",
      `You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`,
    ]);
    return false;
  }

  return true;
}

export function getRemainingImageAttachmentSlots(doc: ProseMirrorNode): number {
  return Math.max(0, MAX_IMAGE_ATTACHMENTS - countImageAttachments(doc));
}

export function getNextImageInsertPosition(doc: ProseMirrorNode): number {
  const firstNode = doc.firstChild;

  if (firstNode?.type.name === "paragraph") {
    let insertPos = 1;

    firstNode.forEach((node, offset) => {
      if (node.type.name === "image") {
        insertPos = 1 + offset + node.nodeSize;
      }
    });

    return insertPos;
  }

  return 1;
}

export function createImageAttachmentNode(
  schema: Schema,
  src: string,
  fileName: string,
) {
  return schema.nodes.image.create({
    src,
    fileName,
    alt: fileName,
  });
}

export function insertImageAttachment(
  editor: Editor,
  src: string,
  fileName: string,
) {
  const node = createImageAttachmentNode(editor.state.schema, src, fileName);
  const insertPos = getNextImageInsertPosition(editor.state.doc);

  editor.commands.command(({ tr }) => {
    tr.insert(insertPos, node);
    return true;
  });

  ensureTextParagraphAfterAttachments(editor);
}

export function ensureTextParagraphAfterAttachments(editor: Editor) {
  const { doc, schema } = editor.state;
  const firstNode = doc.firstChild;

  if (firstNode?.type.name !== "paragraph") {
    editor.commands.focus("end");
    return;
  }

  const secondNode = doc.childCount > 1 ? doc.child(1) : null;
  const secondNodeExists = secondNode?.type.name === "paragraph";

  if (!secondNodeExists) {
    editor.commands.command(({ tr }) => {
      tr.insert(doc.content.size, schema.nodes.paragraph.create());
      return true;
    });
  }

  editor.commands.focus("end");
}
