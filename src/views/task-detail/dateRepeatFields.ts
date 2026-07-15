import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../../dateUtils";
import { getRepeatChipLabel, getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../../repeatUtils";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import type { RepeatRule } from "../../types";
import { renderCustomDatePicker } from "../datePicker";

export interface TaskDetailDateRepeatState {
  due?: string;
  deadline?: string;
  repeat?: RepeatRule;
}

export interface TaskDetailDateRepeatFieldsOptions {
  getState: () => TaskDetailDateRepeatState;
  onDueChange: (due: string | undefined) => void;
  onClearDueAndRepeat: () => void;
  onDeadlineChange: (deadline: string | undefined) => void;
  onRepeatChange: (repeat: RepeatRule | undefined) => void;
  onOpenCustomRepeat: (
    currentRepeat: RepeatRule | undefined,
    onSave: (rule: RepeatRule) => void
  ) => void;
}

export function renderTaskDetailDateRepeatFields(
  parent: HTMLElement,
  options: TaskDetailDateRepeatFieldsOptions
): void {
  renderDueDatePicker(parent, options);
  renderDeadlinePicker(parent, options);
}

function renderDueDatePicker(
  parent: HTMLElement,
  options: TaskDetailDateRepeatFieldsOptions
): void {
  const field = createField(parent, "Date");
  const wrap = field.createDiv({ cls: "belki-date-picker-wrap belki-date-picker-inline" });

  let detachOutside: (() => void) | undefined;

  const closePopover = () => {
    wrap.querySelector(".belki-date-popover-inline")?.addClass("is-hidden");
    detachOutside?.();
    detachOutside = undefined;
  };

  const renderPicker = () => {
    const state = options.getState();
    wrap.empty();
    const hasDate = Boolean(state.due);

    const btnRow = wrap.createDiv({ cls: "belki-date-btn-row" });
    const btn = btnRow.createEl("button", {
      cls: `belki-detail-date-btn${hasDate ? " is-active" : ""}`,
      attr: { type: "button" }
    });
    createBelkiIcon(btn, "calendar", { className: "belki-chip-icon" });
    btn.createSpan({ text: formatDueDateChip(state.due) });

    if (hasDate) {
      const clearBtn = btnRow.createEl("button", {
        cls: "belki-date-chip-clear",
        attr: { type: "button", "aria-label": "Clear date" }
      });
      createBelkiIcon(clearBtn, "close");
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onClearDueAndRepeat();
        closePopover();
        renderPicker();
      });
    }

    const popover = wrap.createDiv({ cls: "belki-date-popover belki-date-popover-inline is-hidden" });

    const selectDate = (value: string) => {
      options.onDueChange(value || undefined);
      closePopover();
      renderPicker();
    };

    const addPreset = (label: string, value: string) => {
      const presetBtn = popover.createEl("button", {
        cls: "belki-date-preset",
        text: label,
        attr: { type: "button" }
      });
      presetBtn.toggleClass("is-active", value === state.due);
      presetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectDate(value);
      });
    };

    addPreset("Today", todayIso());
    addPreset("Tomorrow", addDaysIso(1));
    addPreset("Next week", addDaysIso(7));
    addPreset("Next weekend", nextWeekdayIso(6));

    popover.createDiv({ cls: "belki-date-divider" });

    renderCustomDatePicker(popover, state.due, selectDate);

    popover.createDiv({ cls: "belki-date-divider" });
    const repeatHeader = popover.createDiv({ cls: "belki-repeat-header" });
    createBelkiIcon(repeatHeader, "recurring", { className: "belki-chip-icon" });
    repeatHeader.createSpan({ text: "Repeat" });

    const presetDue = state.due || todayIso();
    const presets = getRepeatPresets(presetDue);
    for (const preset of presets) {
      const presetBtn = popover.createEl("button", {
        cls: "belki-date-preset",
        attr: { type: "button" }
      });
      createBelkiIcon(presetBtn, "recurring", { className: "belki-chip-icon" });
      presetBtn.createSpan({ text: preset.label });
      presetBtn.toggleClass("is-active", repeatRulesEqual(preset.rule, state.repeat));
      presetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentState = options.getState();
        if (!currentState.due) options.onDueChange(todayIso());
        options.onRepeatChange(
          repeatRulesEqual(preset.rule, currentState.repeat) ? undefined : preset.rule
        );
        closePopover();
        renderPicker();
      });
    }
    const customRepeatBtn = popover.createEl("button", {
      cls: "belki-date-preset",
      text: "Custom...",
      attr: { type: "button" }
    });
    customRepeatBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentState = options.getState();
      if (!currentState.due) options.onDueChange(todayIso());
      closePopover();
      options.onOpenCustomRepeat(options.getState().repeat, (rule) => {
        options.onRepeatChange(rule);
        renderPicker();
      });
    });

    btn.addEventListener("click", () => {
      const isHidden = popover.hasClass("is-hidden");
      closePopover();
      if (isHidden) {
        popover.removeClass("is-hidden");
        const onOutside = (e: MouseEvent) => {
          if (!wrap.contains(e.target as Node)) {
            closePopover();
          }
        };
        activeDocument.addEventListener("click", onOutside, { capture: true });
        detachOutside = () => activeDocument.removeEventListener("click", onOutside, { capture: true });
      }
    });

    const repeatState = options.getState().repeat;
    if (repeatState) {
      const fullRepeatLabel = getRepeatLabel(repeatState);
      const repeatRow = wrap.createDiv({ cls: "belki-date-btn-row belki-detail-repeat-row" });
      const repeatChip = repeatRow.createEl("button", {
        cls: "belki-detail-date-btn is-active belki-repeat-active-btn",
        attr: { type: "button", title: fullRepeatLabel, "aria-label": fullRepeatLabel }
      });
      createBelkiIcon(repeatChip, "recurring", { className: "belki-chip-icon" });
      repeatChip.createSpan({ cls: "belki-repeat-chip-label", text: getRepeatChipLabel(repeatState) });
      repeatChip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentState = options.getState();
        if (!currentState.due) options.onDueChange(todayIso());
        closePopover();
        options.onOpenCustomRepeat(options.getState().repeat, (rule) => {
          options.onRepeatChange(rule);
          renderPicker();
        });
      });
      const clearRepeat = repeatRow.createEl("button", {
        cls: "belki-date-chip-clear",
        attr: { type: "button", "aria-label": "Clear repeat" }
      });
      createBelkiIcon(clearRepeat, "close");
      clearRepeat.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onRepeatChange(undefined);
        renderPicker();
      });
    }
  };

  renderPicker();
}

function renderDeadlinePicker(
  parent: HTMLElement,
  options: TaskDetailDateRepeatFieldsOptions
): void {
  const field = createField(parent, "Deadline");
  const wrap = field.createDiv({ cls: "belki-date-picker-wrap belki-date-picker-inline" });

  let detachOutside: (() => void) | undefined;

  const closePopover = () => {
    wrap.querySelector(".belki-date-popover-inline")?.addClass("is-hidden");
    detachOutside?.();
    detachOutside = undefined;
  };

  const renderPicker = () => {
    const state = options.getState();
    wrap.empty();
    const hasDate = Boolean(state.deadline);

    const btnRow = wrap.createDiv({ cls: "belki-date-btn-row" });
    const btn = btnRow.createEl("button", {
      cls: `belki-detail-date-btn${hasDate ? " is-active" : ""}`,
      attr: { type: "button" }
    });
    createBelkiIcon(btn, "deadline", { className: "belki-chip-icon" });
    btn.createSpan({ text: hasDate ? formatDueDateChip(state.deadline) : "No deadline" });

    if (hasDate) {
      const clearBtn = btnRow.createEl("button", {
        cls: "belki-date-chip-clear",
        attr: { type: "button", "aria-label": "Clear deadline" }
      });
      createBelkiIcon(clearBtn, "close");
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onDeadlineChange(undefined);
        closePopover();
        renderPicker();
      });
    }

    const popover = wrap.createDiv({ cls: "belki-date-popover belki-date-popover-inline is-hidden" });

    const selectDate = (value: string) => {
      options.onDeadlineChange(value || undefined);
      closePopover();
      renderPicker();
    };

    const addPreset = (label: string, value: string) => {
      const presetBtn = popover.createEl("button", {
        cls: "belki-date-preset",
        text: label,
        attr: { type: "button" }
      });
      presetBtn.toggleClass("is-active", value === state.deadline);
      presetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectDate(value);
      });
    };

    addPreset("Today", todayIso());
    addPreset("Tomorrow", addDaysIso(1));
    addPreset("Next week", addDaysIso(7));
    addPreset("Next weekend", nextWeekdayIso(6));

    renderCustomDatePicker(popover, state.deadline, selectDate);

    btn.addEventListener("click", () => {
      const isHidden = popover.hasClass("is-hidden");
      closePopover();
      if (!isHidden) return;
      popover.removeClass("is-hidden");
      const handleOutside = (e: MouseEvent) => {
        if (!wrap.contains(e.target as Node)) closePopover();
      };
      activeDocument.addEventListener("click", handleOutside, { capture: true });
      detachOutside = () => activeDocument.removeEventListener("click", handleOutside, { capture: true });
    });
  };

  renderPicker();
}

function createField(parent: HTMLElement, label: string): HTMLElement {
  const field = parent.createDiv({ cls: "belki-detail-field" });
  field.createDiv({ cls: "belki-detail-label", text: label });
  return field;
}
