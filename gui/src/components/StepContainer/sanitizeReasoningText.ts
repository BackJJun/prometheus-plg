const TOOL_TRANSCRIPT_NOTICE =
  "_Tool transcript hidden from reasoning view. The action is handled separately._";
const CODE_BLOCK_NOTICE =
  "_Code block hidden from reasoning view. The generated content is handled separately._";

function collapseReasoningParagraphs(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const collapsed: Array<{ raw: string; normalized: string }> = [];

  for (const paragraph of paragraphs) {
    const normalized = paragraph.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }

    const last = collapsed[collapsed.length - 1];
    if (!last) {
      collapsed.push({ raw: paragraph, normalized });
      continue;
    }

    if (normalized === last.normalized) {
      continue;
    }

    if (normalized.startsWith(last.normalized)) {
      collapsed[collapsed.length - 1] = {
        raw: paragraph,
        normalized,
      };
      continue;
    }

    if (last.normalized.startsWith(normalized)) {
      continue;
    }

    collapsed.push({ raw: paragraph, normalized });
  }

  return collapsed.map((paragraph) => paragraph.raw).join("\n\n");
}

export function sanitizeReasoningText(text: string): string {
  let sanitized = text;

  const toolIndex = sanitized.search(/\bTool call [A-Za-z0-9_.-]+\(/);
  const resultIndex = sanitized.search(/\bTool [A-Za-z0-9_.-]+ result:/);
  const indexes = [toolIndex, resultIndex].filter((index) => index >= 0);

  if (indexes.length > 0) {
    const firstToolTranscript = Math.min(...indexes);
    const visiblePrefix = sanitized.slice(0, firstToolTranscript).trim();
    sanitized = visiblePrefix
      ? `${visiblePrefix}\n\n${TOOL_TRANSCRIPT_NOTICE}`
      : TOOL_TRANSCRIPT_NOTICE;
  }

  if (/```[\s\S]*?```/.test(sanitized)) {
    sanitized = sanitized.replace(/```[\s\S]*?```/g, CODE_BLOCK_NOTICE);
  }

  sanitized = collapseReasoningParagraphs(sanitized);

  return sanitized.trim();
}

export { CODE_BLOCK_NOTICE, TOOL_TRANSCRIPT_NOTICE };
