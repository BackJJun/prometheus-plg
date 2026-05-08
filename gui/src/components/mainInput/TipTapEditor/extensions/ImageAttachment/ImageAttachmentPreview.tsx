import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";

export function ImageAttachmentPreview({
  node,
  deleteNode,
  selected,
}: NodeViewProps) {
  const fileName = node.attrs.fileName || node.attrs.alt || "Image";
  const src = node.attrs.src;

  return (
    <NodeViewWrapper
      as="span"
      className={`group my-1 mr-2 inline-flex max-w-[180px] items-center gap-2 rounded-full border px-2 py-1 align-top ${selected ? "border-border-focus" : "border-command-border"} bg-vsc-editor-background`}
    >
      <img
        src={src}
        alt={fileName}
        className="h-5 w-5 rounded-full object-cover"
        data-image-attachment-preview="true"
        draggable={false}
      />
      <span className="max-w-[110px] truncate text-[11px]">{fileName}</span>
      <button
        type="button"
        className="text-foreground invisible flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent opacity-0 shadow-none outline-none transition-all hover:bg-black/15 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 group-hover:visible group-hover:bg-black/10 group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteNode();
        }}
        aria-label={`Remove ${fileName}`}
      >
        <span className="-mt-px text-[14px] leading-none">x</span>
      </button>
    </NodeViewWrapper>
  );
}
