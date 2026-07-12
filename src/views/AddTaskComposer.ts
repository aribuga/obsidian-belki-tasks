import { App, Platform } from "obsidian";
import { CreateTaskInput, PRIORITIES, Priority } from "../types";
import { dedupeLabels } from "../labels";
import {
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityDropdownLabel,
  hasVisiblePriority
} from "../priority";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";
import { createBelkiActionRow, createBelkiButton } from "../ui";
import { createBelkiIcon } from "../ui/components/BelkiIcon";
import { renderComposerAttachments } from "./composer/ComposerAttachments";
import { renderComposerDateRepeat } from "./composer/ComposerDateRepeat";
import type { ComposerDateRepeatController } from "./composer/ComposerDateRepeat";
import { renderComposerLabels } from "./composer/ComposerLabels";
import type { ComposerLabelsController } from "./composer/ComposerLabels";
import { renderComposerProjects } from "./composer/ComposerProjects";
import type { ComposerProjectsController } from "./composer/ComposerProjects";

interface ComposerOptions {
  app: App;
  projects: string[];
  labels: string[];
  labelColors: Record<string, string>;
  projectColors: Record<string, string>;
  defaultProject: string;
  defaultDue?: string;
  onCancel: () => void;
  onEnsureLabel: (label: string) => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  presentation?: "default" | "mobile-screen";
}

export class AddTaskComposer {
  private titleInput?: HTMLTextAreaElement;

  render(parent: HTMLElement, options: ComposerOptions): () => void {
    const form = parent.createEl("form", { cls: "belki-composer" });
    const isMobileScreen = options.presentation === "mobile-screen";
    form.toggleClass("is-mobile-screen", isMobileScreen);

    this.titleInput = form.createEl("textarea", {
      cls: "belki-composer-title",
      attr: {
        placeholder: "Task title",
        rows: "1"
      }
    });
    const resizeTitleInput = () => {
      if (!this.titleInput) return;
      const ownerWindow = this.titleInput.ownerDocument.defaultView || window;
      const styles = ownerWindow.getComputedStyle(this.titleInput);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
      const paddingY =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const maxHeight = Math.ceil(lineHeight * 2 + paddingY);
      this.titleInput.setCssStyles({
        height: "auto",
        overflowY: "hidden"
      });
      this.titleInput.setCssStyles({
        height: `${Math.min(this.titleInput.scrollHeight, maxHeight)}px`,
        overflowY: this.titleInput.scrollHeight > maxHeight ? "auto" : "hidden"
      });
    };
    this.titleInput.addEventListener("input", resizeTitleInput);
    resizeTitleInput();

    const descriptionInput = form.createEl("textarea", {
      cls: "belki-composer-description",
      attr: {
        placeholder: "Description"
      }
    });

    const closeWikilinkDropdown = attachWikilinkAutocomplete(descriptionInput, options.app);
    const closeQuickAddDropdown = attachQuickAddAutocomplete(
      this.titleInput,
      () => options.labels,
      () => options.projects
    );
    this.titleInput.addEventListener("keydown", (event) => {
      if (
        event.defaultPrevented ||
        event.key !== "Enter" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      form.requestSubmit();
    });

    const chipRow = form.createDiv({ cls: "belki-composer-chip-row" });
    const dueDateWrap = chipRow.createDiv({ cls: "belki-date-picker-wrap" });
    const repeatChipWrap = chipRow.createDiv({ cls: "belki-repeat-chip-wrap" });

    const priorityWrap = chipRow.createDiv({ cls: "belki-chip-select-wrap" });
    createIcon(priorityWrap, "priority");
    const priorityIndicator = priorityWrap.createSpan({ cls: "belki-priority-indicator" });
    const priorityDisplay = priorityWrap.createSpan({ cls: "belki-priority-display" });
    const prioritySelect = priorityWrap.createEl("select", {
      cls: "belki-chip-select",
      attr: {
        "aria-label": "Priority"
      }
    });
    for (const priority of PRIORITIES.filter((priority) => priority !== "none")) {
      prioritySelect.createEl("option", {
        text: getPriorityDropdownLabel(priority),
        value: priority
      });
    }
    prioritySelect.value = "P4";
    const updatePriorityStyle = () => {
      const priority = prioritySelect.value as Priority;
      const color = getPriorityColor(priority);
      priorityWrap.setCssProps({
        "--belki-priority-text": color.color,
        "--belki-priority-bg": color.light,
        "--belki-priority-border": color.color
      });
      priorityWrap.toggleClass("has-priority", hasVisiblePriority(priority));
      priorityIndicator.setCssStyles({ backgroundColor: color.color });
      priorityDisplay.setText(getPriorityDisplayLabel(priority));
    };
    prioritySelect.addEventListener("change", updatePriorityStyle);
    updatePriorityStyle();

    const attachments = renderComposerAttachments({ chipRow, form });

    const mobilePanelSide = Platform.isMobile ? "above" : "below";
    let detachOutsideListener = () => undefined;
    let dateRepeat: ComposerDateRepeatController = {
      close: () => undefined,
      isOpen: () => false,
      getSelectedDue: () => "",
      getSelectedDeadline: () => "",
      getSelectedRepeat: () => undefined
    };
    let labels: ComposerLabelsController = {
      close: () => undefined,
      isOpen: () => false,
      getSelectedLabels: () => []
    };
    let projects: ComposerProjectsController = {
      close: () => undefined,
      isOpen: () => false,
      getSelectedProject: () => undefined,
      remove: () => undefined
    };

    const clearOutsideListener = () => {
      detachOutsideListener();
      detachOutsideListener = () => undefined;
    };

    const closePanels = () => {
      labels.close();
      dateRepeat.close();
    };

    const closeComposerPopovers = () => {
      closePanels();
      projects.close();
      clearOutsideListener();
    };

    const watchLocalPopover = (
      wrapper: HTMLElement,
      popover: HTMLElement,
      options: LocalPopoverOptions = {}
    ) => {
      clearOutsideListener();
      alignLocalPopover(wrapper, popover, options);
      const ownerDocument = wrapper.ownerDocument;
      const handleOutsideClick = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          (wrapper.contains(event.target) || popover.contains(event.target))
        ) {
          return;
        }

        closeComposerPopovers();
      };

      ownerDocument.addEventListener("pointerdown", handleOutsideClick, true);
      detachOutsideListener = () => {
        ownerDocument.removeEventListener("pointerdown", handleOutsideClick, true);
      };
    };

    labels = renderComposerLabels({
      chipRow,
      form,
      labels: options.labels,
      labelColors: options.labelColors,
      closePopovers: closeComposerPopovers,
      onEnsureLabel: options.onEnsureLabel,
      watchPopover: (wrapper, popover) => {
        watchLocalPopover(wrapper, popover, { preferredSide: mobilePanelSide });
      }
    });
    const deadlineWrap = chipRow.createDiv({ cls: "belki-composer-deadline-wrap" });
    dateRepeat = renderComposerDateRepeat({
      app: options.app,
      dueDateWrap,
      repeatChipWrap,
      deadlineWrap,
      defaultDue: options.defaultDue,
      popoverSide: mobilePanelSide,
      closePopovers: closeComposerPopovers,
      clearOutsideListener,
      watchPopover: (wrapper, popover, popoverOptions) => {
        watchLocalPopover(wrapper, popover, popoverOptions);
      }
    });

    const footer = form.createDiv({ cls: "belki-composer-footer" });
    projects = renderComposerProjects({
      footer,
      projects: options.projects,
      projectColors: options.projectColors,
      defaultProject: options.defaultProject,
      closePopovers: closeComposerPopovers,
      clearOutsideListener,
      watchPopover: (wrapper, popover, popoverOptions) => {
        watchLocalPopover(wrapper, popover, popoverOptions);
      }
    });

    const hasOpenComposerPopover = () =>
      labels.isOpen() ||
      dateRepeat.isOpen() ||
      projects.isOpen();

    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && hasOpenComposerPopover()) {
        event.preventDefault();
        event.stopPropagation();
        closeComposerPopovers();
      }
    });
    const actions = createBelkiActionRow(footer, { className: "belki-composer-actions" });
    const cancelButton = createBelkiButton(actions, { text: "Cancel" });
    const addButton = createBelkiButton(actions, {
      text: "Add task",
      variant: "primary",
      attr: {
        type: "submit"
      }
    });

    const cleanup = () => { projects.remove(); closeWikilinkDropdown(); closeQuickAddDropdown(); };
    cancelButton.addEventListener("click", () => { cleanup(); options.onCancel(); });
    form.addEventListener("submit", () => cleanup());
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const rawTitle = this.titleInput?.value || "";
      const parsed = parseQuickAddTokens(rawTitle);
      if (!parsed.title.trim()) {
        this.titleInput?.focus();
        return;
      }

      addButton.setAttr("disabled", "true");
      void (async () => {
        try {
          const explicitProject = projects.getSelectedProject();
          await options.onSubmit({
            title: parsed.title,
            description: descriptionInput.value,
            due: dateRepeat.getSelectedDue(),
            deadline: dateRepeat.getSelectedDeadline(),
            project: explicitProject || parsed.project || "",
            priority: prioritySelect.value as Priority,
            labels: dedupeLabels([...labels.getSelectedLabels(), ...parsed.labels]),
            pendingAttachments: attachments.getPendingAttachments(),
            repeat: dateRepeat.getSelectedRepeat()
          });
        } finally {
          addButton.removeAttribute("disabled");
        }
      })();
    });

    return cleanup;
  }

  focus(options?: FocusOptions): void {
    this.titleInput?.focus(options);
  }

  focusTitleForMobileCapture(): void {
    const input = this.titleInput;
    if (!input) return;

    const ownerWindow = input.ownerDocument.defaultView || window;
    input.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    input.focus();

    ownerWindow.setTimeout(() => {
      input.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 250);
  }
}

function createIcon(
  parent: HTMLElement,
  iconName: string,
  className = "belki-chip-icon"
): HTMLElement {
  return createBelkiIcon(parent, iconName, { className });
}

interface LocalPopoverOptions {
  preferredSide?: "above" | "below";
  useFixed?: boolean;
}

function alignLocalPopover(
  wrapper: HTMLElement,
  popover: HTMLElement,
  options: LocalPopoverOptions = {}
): void {
  const margin = 12;
  const preferredSide = options.preferredSide || "below";

  popover.removeClass("is-align-right");
  popover.removeClass("is-open-up");
  popover.removeClass("is-open-down");
  popover.setCssProps({ "--belki-popover-shift-x": "0px" });

  const wrapperRect = wrapper.getBoundingClientRect();

  if (options.useFixed) {
    // Fixed positioning — use viewport coordinates so containers with
    // overflow:hidden or transforms cannot clip the popover.
    popover.setCssStyles({
      top: "",
      bottom: "",
      left: "",
      right: ""
    });

    const popoverWidth = popover.offsetWidth || 240;
    const popoverHeight = popover.offsetHeight || 220;

    let left = wrapperRect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = wrapperRect.right - popoverWidth;
    }
    const fixedStyles: Partial<CSSStyleDeclaration> = {
      left: `${Math.max(margin, left)}px`
    };

    const fitsBelow = wrapperRect.bottom + popoverHeight + margin <= window.innerHeight;
    const fitsAbove = wrapperRect.top - popoverHeight - margin >= 0;
    if ((preferredSide === "above" && fitsAbove) || (preferredSide === "above" && !fitsBelow)) {
      fixedStyles.bottom = `${window.innerHeight - wrapperRect.top + 8}px`;
      popover.addClass("is-open-up");
    } else {
      fixedStyles.top = `${wrapperRect.bottom + 8}px`;
      popover.addClass("is-open-down");
    }
    popover.setCssStyles(fixedStyles);
    return;
  }

  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 240;
  const popoverHeight = popoverRect.height || 220;
  const ownerWindow = wrapper.ownerDocument.defaultView || window;

  let shiftX = 0;
  const rightOverflow = wrapperRect.left + popoverWidth - (ownerWindow.innerWidth - margin);
  if (rightOverflow > 0) {
    shiftX -= rightOverflow;
  }
  const shiftedLeft = wrapperRect.left + shiftX;
  if (shiftedLeft < margin) {
    shiftX += margin - shiftedLeft;
  }
  if (shiftX !== 0) {
    popover.setCssProps({ "--belki-popover-shift-x": `${Math.round(shiftX)}px` });
  }

  const fitsBelow = wrapperRect.bottom + popoverHeight + margin <= ownerWindow.innerHeight;
  const fitsAbove = wrapperRect.top - popoverHeight - margin >= 0;
  if (preferredSide === "above" && fitsAbove) {
    popover.addClass("is-open-up");
    return;
  }
  if (preferredSide === "above" && !fitsBelow) {
    popover.addClass("is-open-up");
    return;
  }
  if (preferredSide === "below" && !fitsBelow && fitsAbove) {
    popover.addClass("is-open-up");
    return;
  }

  popover.addClass("is-open-down");
}
