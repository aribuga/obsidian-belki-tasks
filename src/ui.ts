import { createBelkiIcon } from "./ui/components/BelkiIcon";

export type BelkiButtonVariant = "default" | "primary" | "danger" | "destructive" | "ghost";
export type BelkiButtonSize = "sm" | "md";
export type BelkiChipVariant = "default" | "outline" | "muted";

type BelkiAttrs = Record<string, string>;

interface BelkiButtonOptions {
  text?: string;
  icon?: string;
  variant?: BelkiButtonVariant;
  size?: BelkiButtonSize;
  className?: string;
  attr?: BelkiAttrs;
  disabled?: boolean;
}

interface BelkiIconButtonOptions extends Omit<BelkiButtonOptions, "text"> {
  ariaLabel: string;
}

interface BelkiChipOptions {
  text?: string;
  icon?: string;
  variant?: BelkiChipVariant;
  className?: string;
  attr?: BelkiAttrs;
}

interface BelkiTextInputOptions {
  type?: string;
  value?: string;
  placeholder?: string;
  className?: string;
  attr?: BelkiAttrs;
}

interface BelkiActionRowOptions {
  className?: string;
}

const BUTTON_VARIANTS: Record<BelkiButtonVariant, string> = {
  default: "",
  primary: "belki-ui-button-primary belki-button-primary",
  danger: "belki-ui-button-danger belki-button-danger",
  destructive: "belki-ui-button-destructive belki-button-destructive",
  ghost: "belki-ui-button-ghost"
};

const BUTTON_SIZES: Record<BelkiButtonSize, string> = {
  sm: "belki-ui-button-sm",
  md: "belki-ui-button-md"
};

const CHIP_VARIANTS: Record<BelkiChipVariant, string> = {
  default: "",
  outline: "belki-ui-chip-outline",
  muted: "belki-ui-chip-muted"
};

export function createBelkiButton(
  parent: HTMLElement,
  options: BelkiButtonOptions = {}
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: classNames(
      "belki-ui-button",
      "belki-button",
      BUTTON_VARIANTS[options.variant || "default"],
      BUTTON_SIZES[options.size || "md"],
      options.className
    ),
    attr: {
      type: "button",
      ...(options.attr || {})
    }
  });

  if (options.icon) {
    createBelkiIcon(button, options.icon, { className: "belki-ui-icon" });
  }
  if (options.text) {
    button.createSpan({ cls: "belki-ui-button-label", text: options.text });
  }
  if (options.disabled) {
    button.setAttr("disabled", "true");
  }

  return button;
}

export function createBelkiIconButton(
  parent: HTMLElement,
  options: BelkiIconButtonOptions
): HTMLButtonElement {
  return createBelkiButton(parent, {
    ...options,
    className: classNames("belki-ui-icon-button", options.className),
    attr: {
      "aria-label": options.ariaLabel,
      ...(options.attr || {})
    }
  });
}

export function createBelkiChip(parent: HTMLElement, options: BelkiChipOptions): HTMLElement {
  const chip = parent.createSpan({
    cls: classNames(
      "belki-ui-chip",
      CHIP_VARIANTS[options.variant || "default"],
      options.className
    ),
    attr: options.attr
  });

  if (options.icon) {
    createBelkiIcon(chip, options.icon, { className: "belki-ui-icon" });
  }
  if (options.text) {
    chip.createSpan({ cls: "belki-ui-chip-label", text: options.text });
  }

  return chip;
}

export function createBelkiTextInput(
  parent: HTMLElement,
  options: BelkiTextInputOptions = {}
): HTMLInputElement {
  return parent.createEl("input", {
    cls: classNames("belki-ui-input", options.className),
    attr: {
      type: options.type || "text",
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      ...(options.value ? { value: options.value } : {}),
      ...(options.attr || {})
    }
  });
}

export function createBelkiActionRow(
  parent: HTMLElement,
  options: BelkiActionRowOptions = {}
): HTMLElement {
  return parent.createDiv({
    cls: classNames("belki-ui-actions", options.className)
  });
}

export function createBelkiBottomBar(
  parent: HTMLElement,
  options: BelkiActionRowOptions = {}
): HTMLElement {
  return parent.createDiv({
    cls: classNames("belki-ui-bottom-bar", options.className)
  });
}

function classNames(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}
