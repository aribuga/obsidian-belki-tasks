import { App, Notice, Platform } from "obsidian";
import { CreateTaskInput, PRIORITIES, Priority, RepeatRule } from "../types";
import { dedupeLabels } from "../labels";
import {
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityDropdownLabel,
  hasVisiblePriority
} from "../priority";
import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../dateUtils";
import { getRepeatChipLabel, getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../repeatUtils";
import { CustomRepeatModal } from "./CustomRepeatModal";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";
import { createBelkiActionRow, createBelkiButton } from "../ui";
import { createBelkiIcon } from "../ui/components/BelkiIcon";
import { renderComposerAttachments } from "./composer/ComposerAttachments";
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
    let selectedDue = options.defaultDue || "";
    let selectedRepeat: RepeatRule | undefined;
    let selectedDeadline = "";

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
    let closeDueDatePopover: () => void = () => undefined;
    let closeDeadlinePanel: () => void = () => undefined;
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
      closeDeadlinePanel();
    };

    const closeComposerPopovers = () => {
      closePanels();
      projects.close();
      closeDueDatePopover();
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

    const renderDeadlineButton = () => {
      deadlineWrap.empty();
      const hasDeadline = Boolean(selectedDeadline);
      const btn = deadlineWrap.createEl("button", {
        cls: `belki-chip-button${hasDeadline ? " belki-date-chip is-active is-selected" : ""}`,
        attr: { type: "button", "aria-label": "Set deadline" }
      });
      createIcon(btn, "deadline");
      btn.createSpan({
        cls: "belki-chip-label",
        text: hasDeadline ? formatDueDateChip(selectedDeadline) : "Deadline"
      });

      if (hasDeadline) {
        const clearSpan = createBelkiIcon(btn, "close", { className: "belki-deadline-clear" });
        clearSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedDeadline = "";
          closeDeadlinePanel();
          renderDeadlineButton();
        });
      }

      const panel = deadlineWrap.createDiv({ cls: "belki-composer-popover belki-date-popover is-hidden" });
      panel.createDiv({ cls: "belki-popover-title", text: "Deadline" });
      closeDeadlinePanel = () => {
        panel.addClass("is-hidden");
        panel.removeClass("is-calendar-open");
      };
      let canSelectDeadline = !Platform.isMobile;

      const selectDeadline = (value: string) => {
        if (!canSelectDeadline) {
          return;
        }

        selectedDeadline = value;
        closeDeadlinePanel();
        clearOutsideListener();
        renderDeadlineButton();
      };

      const addPreset = (label: string, value: string) => {
        const presetBtn = panel.createEl("button", {
          cls: "belki-date-preset",
          text: label,
          attr: { type: "button" }
        });
        presetBtn.toggleClass("is-active", value === selectedDeadline);
        presetBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          selectDeadline(value);
        });
      };

      addPreset("Today", todayIso());
      addPreset("Tomorrow", addDaysIso(1));
      addPreset("Next week", addDaysIso(7));
      addPreset("Next weekend", nextWeekdayIso(6));
      renderComposerCustomDatePicker(panel, selectedDeadline, selectDeadline);

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = panel.hasClass("is-hidden");
        closeComposerPopovers();
        if (shouldOpen) {
          canSelectDeadline = !Platform.isMobile;
          const ownerWindow = btn.ownerDocument.defaultView || window;
          ownerWindow.setTimeout(() => {
            panel.removeClass("is-hidden");
            watchLocalPopover(deadlineWrap, panel, { preferredSide: mobilePanelSide });

            if (Platform.isMobile) {
              ownerWindow.setTimeout(() => {
                canSelectDeadline = true;
              }, 250);
            }
          }, 0);
        }
      });
    };
    renderDeadlineButton();

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
      Boolean(deadlineWrap.querySelector(".belki-composer-popover:not(.is-hidden)")) ||
      projects.isOpen() ||
      Boolean(dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)"));

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
            due: selectedDue,
            deadline: selectedDeadline,
            project: explicitProject || parsed.project || "",
            priority: prioritySelect.value as Priority,
            labels: dedupeLabels([...labels.getSelectedLabels(), ...parsed.labels]),
            pendingAttachments: attachments.getPendingAttachments(),
            repeat: selectedRepeat
          });
        } finally {
          addButton.removeAttribute("disabled");
        }
      })();
    });

    const renderDueDateButton = () => {
      dueDateWrap.empty();
      const hasDate = Boolean(selectedDue);
      const dueDateButton = dueDateWrap.createEl("button", {
        cls: `belki-chip-button belki-date-chip${hasDate ? " is-active is-selected" : ""}`,
        attr: { type: "button", "aria-label": "Set due date" }
      });
      createBelkiIcon(dueDateButton, "calendar", { className: "belki-chip-icon" });
      dueDateButton.createSpan({ cls: "belki-chip-label", text: formatDueDateChip(selectedDue) });

      if (hasDate) {
        const clearBtn = dueDateWrap.createEl("button", {
          cls: "belki-date-chip-clear",
          attr: { type: "button", "aria-label": "Clear due date" }
        });
        createBelkiIcon(clearBtn, "close");
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selectedRepeat) new Notice("Date and repeat rule removed.");
          selectedDue = "";
          selectedRepeat = undefined;
          closeDueDatePopover();
          renderDueDateButton();
          renderRepeatChip();
        });
      }

      const datePopover = dueDateWrap.createDiv({ cls: "belki-composer-popover belki-date-popover is-hidden" });
      closeDueDatePopover = () => {
        datePopover.addClass("is-hidden");
        datePopover.removeClass("is-calendar-open");
      };

      const selectDate = (value: string) => {
        selectedDue = value;
        closeDueDatePopover();
        clearOutsideListener();
        renderDueDateButton();
        renderRepeatChip();
      };

      const addPreset = (label: string, value: string) => {
        const btn = datePopover.createEl("button", {
          cls: "belki-date-preset",
          text: label,
          attr: { type: "button" }
        });
        btn.toggleClass("is-active", value === selectedDue);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectDate(value);
        });
      };

      addPreset("Today", todayIso());
      addPreset("Tomorrow", addDaysIso(1));
      addPreset("Next week", addDaysIso(7));
      addPreset("Next weekend", nextWeekdayIso(6));

      renderComposerCustomDatePicker(datePopover, selectedDue, selectDate);

      datePopover.createDiv({ cls: "belki-date-divider" });
      const repeatHeader = datePopover.createDiv({ cls: "belki-repeat-header" });
      createBelkiIcon(repeatHeader, "recurring", { className: "belki-chip-icon" });
      repeatHeader.createSpan({ text: "Repeat" });

      const presetDue = selectedDue || todayIso();
      const presets = getRepeatPresets(presetDue);
      for (const preset of presets) {
        const btn = datePopover.createEl("button", {
          cls: "belki-date-preset",
          attr: { type: "button" }
        });
        createBelkiIcon(btn, "recurring", { className: "belki-chip-icon" });
        btn.createSpan({ text: preset.label });
        btn.toggleClass("is-active", repeatRulesEqual(preset.rule, selectedRepeat));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!selectedDue) selectedDue = todayIso();
          selectedRepeat = repeatRulesEqual(preset.rule, selectedRepeat) ? undefined : preset.rule;
          closeDueDatePopover();
          clearOutsideListener();
          renderDueDateButton();
          renderRepeatChip();
        });
      }
      const customRepeatBtn = datePopover.createEl("button", {
        cls: "belki-date-preset",
        text: "Custom...",
        attr: { type: "button" }
      });
      customRepeatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!selectedDue) selectedDue = todayIso();
        closeDueDatePopover();
        clearOutsideListener();
        new CustomRepeatModal(options.app, selectedRepeat, (rule) => {
          selectedRepeat = rule;
          renderDueDateButton();
          renderRepeatChip();
        }).open();
      });

      dueDateButton.addEventListener("click", () => {
        const shouldOpen = datePopover.hasClass("is-hidden");
        closeComposerPopovers();
        if (shouldOpen) {
          datePopover.removeClass("is-hidden");
          watchLocalPopover(dueDateWrap, datePopover, { preferredSide: mobilePanelSide });
        }
      });
    };

    const renderRepeatChip = () => {
      repeatChipWrap.empty();
      if (!selectedRepeat) return;
      const fullLabel = getRepeatLabel(selectedRepeat);
      const chip = repeatChipWrap.createEl("button", {
        cls: "belki-chip-button belki-repeat-chip is-active is-selected",
        attr: { type: "button", title: fullLabel, "aria-label": fullLabel }
      });
      createBelkiIcon(chip, "recurring", { className: "belki-chip-icon" });
      chip.createSpan({ cls: "belki-chip-label", text: getRepeatChipLabel(selectedRepeat) });
      chip.addEventListener("click", () => {
        const shouldOpen = dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)") === null;
        closeComposerPopovers();
        if (shouldOpen) {
          const popover = dueDateWrap.querySelector<HTMLElement>(".belki-date-popover");
          if (popover) {
            popover.removeClass("is-hidden");
            watchLocalPopover(dueDateWrap, popover, { preferredSide: mobilePanelSide });
          }
        }
      });
      const clearRepeat = repeatChipWrap.createEl("button", {
        cls: "belki-date-chip-clear",
        attr: { type: "button", "aria-label": "Clear repeat" }
      });
      createBelkiIcon(clearRepeat, "close");
      clearRepeat.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedRepeat = undefined;
        renderRepeatChip();
        renderDueDateButton();
      });
    };

    renderDueDateButton();
    renderRepeatChip();
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

function renderComposerCustomDatePicker(
  parent: HTMLElement,
  currentValue: string | undefined,
  onSelect: (value: string) => void
): void {
  const today = todayIso();
  const initialDate = currentValue ? new Date(`${currentValue}T00:00:00`) : new Date();
  let viewYear = initialDate.getFullYear();
  let viewMonth = initialDate.getMonth();

  const container = parent.createDiv({ cls: "belki-date-custom-wrap" });
  const trigger = container.createEl("button", {
    cls: "belki-date-preset belki-cal-trigger",
    attr: { type: "button" }
  });
  trigger.createSpan({ text: currentValue ? formatDueDateChip(currentValue) : "Custom date..." });
  trigger.toggleClass("is-active", Boolean(currentValue));

  const calendarWrap = container.createDiv({ cls: "belki-cal-wrap is-hidden" });

  const renderCalendar = () => {
    calendarWrap.empty();

    const header = calendarWrap.createDiv({ cls: "belki-cal-header" });
    const previousButton = header.createEl("button", {
      cls: "belki-cal-nav",
      text: "‹",
      attr: { type: "button" }
    });
    header.createSpan({
      cls: "belki-cal-title",
      text: new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
      })
    });
    const nextButton = header.createEl("button", {
      cls: "belki-cal-nav",
      text: "›",
      attr: { type: "button" }
    });

    previousButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      previousButton.blur();
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      renderCalendar();
    });
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nextButton.blur();
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      renderCalendar();
    });

    const grid = calendarWrap.createDiv({ cls: "belki-cal-grid" });
    for (const dayName of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
      grid.createSpan({ cls: "belki-cal-day-hdr", text: dayName });
    }

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const leadingEmptyDays = firstDay === 0 ? 6 : firstDay - 1;
    for (let index = 0; index < leadingEmptyDays; index += 1) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayButton = grid.createEl("button", {
        cls: "belki-cal-day",
        text: String(day),
        attr: { type: "button" }
      });
      dayButton.toggleClass("is-today", iso === today);
      dayButton.toggleClass("is-selected", iso === currentValue);
      dayButton.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect(iso);
      });
    }

    const renderedCells = leadingEmptyDays + daysInMonth;
    const trailingEmptyDays = 42 - renderedCells;
    for (let index = 0; index < trailingEmptyDays; index += 1) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opening = calendarWrap.hasClass("is-hidden");
    parent.toggleClass("is-calendar-open", opening);
    calendarWrap.toggleClass("is-hidden", !opening);
    if (opening) {
      renderCalendar();
      const ownerWindow = parent.ownerDocument.defaultView || window;
      ownerWindow.requestAnimationFrame(() => clampPopoverToViewport(parent));
    }
  });
}

function clampPopoverToViewport(popover: HTMLElement): void {
  const ownerWindow = popover.ownerDocument.defaultView || window;
  const margin = 12;
  const currentShift = Number.parseFloat(
    ownerWindow.getComputedStyle(popover).getPropertyValue("--belki-popover-shift-x") || "0"
  ) || 0;
  const rect = popover.getBoundingClientRect();
  let nextShift = currentShift;

  if (rect.right > ownerWindow.innerWidth - margin) {
    nextShift -= rect.right - (ownerWindow.innerWidth - margin);
  }

  const adjustedLeft = rect.left + (nextShift - currentShift);
  if (adjustedLeft < margin) {
    nextShift += margin - adjustedLeft;
  }

  if (nextShift !== currentShift) {
    popover.setCssProps({ "--belki-popover-shift-x": `${Math.round(nextShift)}px` });
  }
}
