export type DescriptionFormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "quote"
  | "inline-code"
  | "code-block"
  | "bullet-list"
  | "numbered-list"
  | "link";

export interface DescriptionFormatResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function formatDescriptionMarkdown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: DescriptionFormatAction
): DescriptionFormatResult {
  switch (action) {
    case "bold":
      return wrapSelection(value, selectionStart, selectionEnd, "**", "**", "bold text");
    case "italic":
      return wrapSelection(value, selectionStart, selectionEnd, "*", "*", "italic text");
    case "strike":
      return wrapSelection(value, selectionStart, selectionEnd, "~~", "~~", "struck text");
    case "inline-code":
      return wrapSelection(value, selectionStart, selectionEnd, "`", "`", "code");
    case "code-block":
      return wrapSelection(value, selectionStart, selectionEnd, "```\n", "\n```", "code");
    case "link":
      return formatMarkdownLink(value, selectionStart, selectionEnd);
    case "quote":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line) =>
        `> ${line.replace(/^>\s?/, "")}`
      );
    case "bullet-list":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line) =>
        `- ${stripListMarker(line) || "List item"}`
      );
    case "numbered-list":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line, index) =>
        `${index + 1}. ${stripListMarker(line) || "List item"}`
      );
  }
}

export function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string
): DescriptionFormatResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const content = selected || placeholder;
  const replacement = `${prefix}${content}${suffix}`;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, replacement);
  const innerStart = selectionStart + prefix.length;

  return {
    value: nextValue,
    selectionStart: innerStart,
    selectionEnd: innerStart + content.length
  };
}

export function formatMarkdownLink(
  value: string,
  selectionStart: number,
  selectionEnd: number
): DescriptionFormatResult {
  const selected = value.slice(selectionStart, selectionEnd) || "link text";
  const replacement = `[${selected}](url)`;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, replacement);
  const urlStart = selectionStart + selected.length + 3;

  return {
    value: nextValue,
    selectionStart: urlStart,
    selectionEnd: urlStart + 3
  };
}

export function formatSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transform: (line: string, index: number) => string
): DescriptionFormatResult {
  const collapsed = selectionStart === selectionEnd;
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", effectiveEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const block = collapsed ? "" : value.slice(lineStart, lineEnd);
  const lines = block ? block.split("\n") : [""];
  const replacement = lines.map(transform).join("\n");
  const nextValue = replaceRange(
    value,
    collapsed ? selectionStart : lineStart,
    collapsed ? selectionEnd : lineEnd,
    replacement
  );
  const replacementStart = collapsed ? selectionStart : lineStart;

  return {
    value: nextValue,
    selectionStart: replacementStart,
    selectionEnd: replacementStart + replacement.length
  };
}

export function replaceRange(
  value: string,
  start: number,
  end: number,
  replacement: string
): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

export function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
}
