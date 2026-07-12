import { App, Notice, Platform } from "obsidian";
import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../../dateUtils";
import { getRepeatChipLabel, getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../../repeatUtils";
import type { RepeatRule } from "../../types";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import { CustomRepeatModal } from "../CustomRepeatModal";

export interface ComposerDateRepeatPopoverOptions {
  preferredSide?: "above" | "below";
  useFixed?: boolean;
}

export interface ComposerDateRepeatOptions {
  app: App;
  dueDateWrap: HTMLElement;
  repeatChipWrap: HTMLElement;
  deadlineWrap: HTMLElement;
  defaultDue?: string;
  popoverSide: "above" | "below";
  closePopovers: () => void;
  clearOutsideListener: () => void;
  watchPopover: (
    wrapper: HTMLElement,
    popover: HTMLElement,
    options?: ComposerDateRepeatPopoverOptions
  ) => void;
}

export interface ComposerDateRepeatController {
  close: () => void;
  isOpen: () => boolean;
  getSelectedDue: () => string;
  getSelectedDeadline: () => string;
  getSelectedRepeat: () => RepeatRule | undefined;
}

export function renderComposerDateRepeat(
  options: ComposerDateRepeatOptions
): ComposerDateRepeatController {
  let selectedDue = options.defaultDue || "";
  let selectedRepeat: RepeatRule | undefined;
  let selectedDeadline = "";
  let closeDueDatePopover: () => void = () => undefined;
  let closeDeadlinePanel: () => void = () => undefined;

  const close = () => {
    closeDeadlinePanel();
    closeDueDatePopover();
  };

  const renderDeadlineButton = () => {
    options.deadlineWrap.empty();
    const hasDeadline = Boolean(selectedDeadline);
    const btn = options.deadlineWrap.createEl("button", {
      cls: `belki-chip-button${hasDeadline ? " belki-date-chip is-active is-selected" : ""}`,
      attr: { type: "button", "aria-label": "Set deadline" }
    });
    createBelkiIcon(btn, "deadline", { className: "belki-chip-icon" });
    btn.createSpan({
      cls: "belki-chip-label",
      text: hasDeadline ? formatDueDateChip(selectedDeadline) : "Deadline"
    });

    if (hasDeadline) {
      const clearSpan = createBelkiIcon(btn, "close", { className: "belki-deadline-clear" });
      clearSpan.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedDeadline = "";
        closeDeadlinePanel();
        renderDeadlineButton();
      });
    }

    const panel = options.deadlineWrap.createDiv({ cls: "belki-composer-popover belki-date-popover is-hidden" });
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
      options.clearOutsideListener();
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
      options.closePopovers();
      if (shouldOpen) {
        canSelectDeadline = !Platform.isMobile;
        const ownerWindow = btn.ownerDocument.defaultView || window;
        ownerWindow.setTimeout(() => {
          panel.removeClass("is-hidden");
          options.watchPopover(options.deadlineWrap, panel, { preferredSide: options.popoverSide });

          if (Platform.isMobile) {
            ownerWindow.setTimeout(() => {
              canSelectDeadline = true;
            }, 250);
          }
        }, 0);
      }
    });
  };

  const renderDueDateButton = () => {
    options.dueDateWrap.empty();
    const hasDate = Boolean(selectedDue);
    const dueDateButton = options.dueDateWrap.createEl("button", {
      cls: `belki-chip-button belki-date-chip${hasDate ? " is-active is-selected" : ""}`,
      attr: { type: "button", "aria-label": "Set due date" }
    });
    createBelkiIcon(dueDateButton, "calendar", { className: "belki-chip-icon" });
    dueDateButton.createSpan({ cls: "belki-chip-label", text: formatDueDateChip(selectedDue) });

    if (hasDate) {
      const clearBtn = options.dueDateWrap.createEl("button", {
        cls: "belki-date-chip-clear",
        attr: { type: "button", "aria-label": "Clear due date" }
      });
      createBelkiIcon(clearBtn, "close");
      clearBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (selectedRepeat) new Notice("Date and repeat rule removed.");
        selectedDue = "";
        selectedRepeat = undefined;
        closeDueDatePopover();
        renderDueDateButton();
        renderRepeatChip();
      });
    }

    const datePopover = options.dueDateWrap.createDiv({ cls: "belki-composer-popover belki-date-popover is-hidden" });
    closeDueDatePopover = () => {
      datePopover.addClass("is-hidden");
      datePopover.removeClass("is-calendar-open");
    };

    const selectDate = (value: string) => {
      selectedDue = value;
      closeDueDatePopover();
      options.clearOutsideListener();
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
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
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
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!selectedDue) selectedDue = todayIso();
        selectedRepeat = repeatRulesEqual(preset.rule, selectedRepeat) ? undefined : preset.rule;
        closeDueDatePopover();
        options.clearOutsideListener();
        renderDueDateButton();
        renderRepeatChip();
      });
    }
    const customRepeatBtn = datePopover.createEl("button", {
      cls: "belki-date-preset",
      text: "Custom...",
      attr: { type: "button" }
    });
    customRepeatBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!selectedDue) selectedDue = todayIso();
      closeDueDatePopover();
      options.clearOutsideListener();
      new CustomRepeatModal(options.app, selectedRepeat, (rule) => {
        selectedRepeat = rule;
        renderDueDateButton();
        renderRepeatChip();
      }).open();
    });

    dueDateButton.addEventListener("click", () => {
      const shouldOpen = datePopover.hasClass("is-hidden");
      options.closePopovers();
      if (shouldOpen) {
        datePopover.removeClass("is-hidden");
        options.watchPopover(options.dueDateWrap, datePopover, { preferredSide: options.popoverSide });
      }
    });
  };

  const renderRepeatChip = () => {
    options.repeatChipWrap.empty();
    if (!selectedRepeat) return;
    const fullLabel = getRepeatLabel(selectedRepeat);
    const chip = options.repeatChipWrap.createEl("button", {
      cls: "belki-chip-button belki-repeat-chip is-active is-selected",
      attr: { type: "button", title: fullLabel, "aria-label": fullLabel }
    });
    createBelkiIcon(chip, "recurring", { className: "belki-chip-icon" });
    chip.createSpan({ cls: "belki-chip-label", text: getRepeatChipLabel(selectedRepeat) });
    chip.addEventListener("click", () => {
      const shouldOpen = options.dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)") === null;
      options.closePopovers();
      if (shouldOpen) {
        const popover = options.dueDateWrap.querySelector<HTMLElement>(".belki-date-popover");
        if (popover) {
          popover.removeClass("is-hidden");
          options.watchPopover(options.dueDateWrap, popover, { preferredSide: options.popoverSide });
        }
      }
    });
    const clearRepeat = options.repeatChipWrap.createEl("button", {
      cls: "belki-date-chip-clear",
      attr: { type: "button", "aria-label": "Clear repeat" }
    });
    createBelkiIcon(clearRepeat, "close");
    clearRepeat.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedRepeat = undefined;
      renderRepeatChip();
      renderDueDateButton();
    });
  };

  renderDeadlineButton();
  renderDueDateButton();
  renderRepeatChip();

  return {
    close,
    isOpen: () =>
      Boolean(options.deadlineWrap.querySelector(".belki-composer-popover:not(.is-hidden)")) ||
      Boolean(options.dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)")),
    getSelectedDue: () => selectedDue,
    getSelectedDeadline: () => selectedDeadline,
    getSelectedRepeat: () => selectedRepeat
  };
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
      text: "\u2039",
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
      text: "\u203a",
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
