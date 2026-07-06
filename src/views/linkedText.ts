import type { App } from "obsidian";

// Groups: 1=wikilink full, 2=note path, 3=heading, 4=alias | 5=md link full, 6=md text, 7=md target | 8=https url | 9=www url
const LINK_RE = /(\[\[([^\]|#\n]+?)(?:#([^\]|\n]+?))?(?:\|([^\]\n]+?))?\]\])|(\[([^\]]+)\]\(([^)\n]+)\))|(https?:\/\/[^\s<>"')\]]+)|(www\.[a-zA-Z0-9][^\s<>"')\]]*)/g;

interface RenderLinkedTextOptions {
  app: App;
  sourcePath?: string;
}

export function renderLinkedText(
  text: string,
  el: HTMLElement,
  options?: RenderLinkedTextOptions
): void {
  LINK_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) el.appendText(text.slice(last, match.index));
    if (match[1]) {
      const notePath = match[2];
      const heading = match[3];
      const alias = match[4];
      const displayText = alias || notePath.split("/").pop() || notePath;
      const linkTarget = heading ? `${notePath}#${heading}` : notePath;
      if (options?.app) {
        createInternalLink(el, displayText, linkTarget, options);
      } else {
        el.appendText(displayText);
      }
      last = match.index + match[1].length;
    } else if (match[5]) {
      const target = match[7].trim();
      if (options?.app && !isExternalLinkTarget(target)) {
        createInternalLink(el, match[6], target, options);
      } else {
        createExternalLink(el, match[6], normalizeExternalHref(target));
      }
      last = match.index + match[5].length;
    } else {
      const full = match[0];
      const url = full.replace(/[.,;:!?)\]]+$/, "");
      const trailing = full.slice(url.length);
      const href = url.startsWith("www.") ? `https://${url}` : url;
      createExternalLink(el, url, href);
      if (trailing) el.appendText(trailing);
      last = match.index + full.length;
    }
  }
  if (last < text.length) el.appendText(text.slice(last));
}

export function stripInlineMarkdownPreservingLinks(text: string): string {
  return transformTextOutsideLinks(text, stripInlineMarkdownSegment);
}

function transformTextOutsideLinks(
  text: string,
  transform: (value: string) => string
): string {
  LINK_RE.lastIndex = 0;
  let output = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) {
      output += transform(text.slice(last, match.index));
    }
    output += match[0];
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    output += transform(text.slice(last));
  }

  return output;
}

function stripInlineMarkdownSegment(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1$2");
}

function createInternalLink(
  parent: HTMLElement,
  text: string,
  linkTarget: string,
  options: RenderLinkedTextOptions
): void {
  const link = parent.createEl("a", {
    text,
    cls: "internal-link",
    href: linkTarget
  });
  link.setAttribute("data-href", linkTarget);
  const open = (event: MouseEvent | TouchEvent, openInNewLeaf = false) => {
    event.preventDefault();
    event.stopPropagation();
    void options.app.workspace.openLinkText(
      linkTarget,
      options.sourcePath || "",
      openInNewLeaf
    );
  };
  link.addEventListener("pointerdown", (event) => event.stopPropagation());
  link.addEventListener("touchstart", (event) => event.stopPropagation());
  link.addEventListener("touchend", (event) => open(event));
  link.addEventListener("click", (event) => {
    open(event, event.metaKey || event.ctrlKey || event.button === 1);
  });
  link.addEventListener("auxclick", (event) => {
    if (event.button === 1) open(event, true);
  });
}

function createExternalLink(parent: HTMLElement, text: string, href: string): void {
  const link = parent.createEl("a", { text, href, cls: "external-link" });
  link.setAttribute("rel", "noopener noreferrer");
  link.addEventListener("pointerdown", (event) => event.stopPropagation());
  link.addEventListener("touchstart", (event) => event.stopPropagation());
  link.addEventListener("click", (event) => event.stopPropagation());
  link.addEventListener("auxclick", (event) => event.stopPropagation());
}

function isExternalLinkTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("www.");
}

function normalizeExternalHref(target: string): string {
  return target.startsWith("www.") ? `https://${target}` : target;
}
