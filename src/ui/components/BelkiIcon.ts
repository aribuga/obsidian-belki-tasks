import { setIcon } from "obsidian";
import { BelkiIconInput, resolveBelkiIcon } from "../icons/belkiIcons";

interface BelkiIconOptions {
  ariaLabel?: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function createBelkiIcon(
  parent: HTMLElement,
  icon: BelkiIconInput,
  options: BelkiIconOptions = {}
): HTMLElement {
  const iconEl = parent.createSpan({
    cls: classNames("belki-icon", options.className),
    attr: options.ariaLabel
      ? { "aria-label": options.ariaLabel, role: "img" }
      : { "aria-hidden": "true" }
  });

  setIcon(iconEl, resolveBelkiIcon(icon));
  applyIconOptions(iconEl, options);
  return iconEl;
}

export function setBelkiIcon(
  el: HTMLElement,
  icon: BelkiIconInput,
  options: BelkiIconOptions = {}
): void {
  el.empty();
  createBelkiIcon(el, icon, options);
}

function applyIconOptions(el: HTMLElement, options: BelkiIconOptions): void {
  const props: Record<string, string> = {};
  if (options.size) {
    props["--belki-icon-size"] = `${options.size}px`;
  }
  if (options.strokeWidth) {
    props["--belki-icon-stroke-width"] = String(options.strokeWidth);
  }
  if (Object.keys(props).length > 0) {
    el.setCssProps(props);
  }
}

function classNames(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}
