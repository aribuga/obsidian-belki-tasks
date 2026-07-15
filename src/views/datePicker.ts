import { formatDueDateChip, todayIso } from "../dateUtils";

interface RenderCustomDatePickerOptions {
  triggerLabel?: string;
  triggerAriaLabel?: string;
  triggerRole?: string;
  alwaysShowTriggerLabel?: boolean;
}

export function renderCustomDatePicker(
  parent: HTMLElement,
  currentValue: string | undefined,
  onSelect: (value: string) => void,
  options: RenderCustomDatePickerOptions = {}
): void {
  const todayStr = todayIso();
  const initDate = currentValue ? new Date(currentValue + "T00:00:00") : new Date();
  let viewYear = initDate.getFullYear();
  let viewMonth = initDate.getMonth();

  const container = parent.createDiv({ cls: "belki-date-custom-wrap" });

  const trigger = container.createEl("button", {
    cls: "belki-date-preset belki-cal-trigger",
    attr: {
      type: "button",
      ...(options.triggerRole ? { role: options.triggerRole } : {}),
      ...(options.triggerAriaLabel ? { "aria-label": options.triggerAriaLabel } : {})
    }
  });
  const triggerText =
    options.alwaysShowTriggerLabel && options.triggerLabel
      ? options.triggerLabel
      : currentValue
        ? formatDueDateChip(currentValue)
        : options.triggerLabel || "Custom date\u2026";
  trigger.createSpan({
    text: triggerText
  });
  if (currentValue) trigger.addClass("is-active");

  const calWrap = container.createDiv({ cls: "belki-cal-wrap is-hidden" });

  function renderCal() {
    calWrap.empty();

    const header = calWrap.createDiv({ cls: "belki-cal-header" });
    const prevBtn = header.createEl("button", { cls: "belki-cal-nav", attr: { type: "button" } });
    prevBtn.setText("\u2039");
    header.createSpan({
      cls: "belki-cal-title",
      text: new Date(viewYear, viewMonth, 1)
        .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    });
    const nextBtn = header.createEl("button", { cls: "belki-cal-nav", attr: { type: "button" } });
    nextBtn.setText("\u203A");

    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      prevBtn.blur();
      if (--viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderCal();
    });
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      nextBtn.blur();
      if (++viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderCal();
    });

    const grid = calWrap.createDiv({ cls: "belki-cal-grid" });
    for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
      grid.createSpan({ cls: "belki-cal-day-hdr", text: d });
    }

    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const leadingEmpties = firstDow === 0 ? 6 : firstDow - 1;
    for (let i = 0; i < leadingEmpties; i++) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cell = grid.createEl("button", {
        cls: "belki-cal-day",
        text: String(d),
        attr: { type: "button" }
      });
      if (iso === todayStr) cell.addClass("is-today");
      if (iso === currentValue) cell.addClass("is-selected");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(iso);
      });
    }

    const renderedCells = leadingEmpties + daysInMonth;
    const trailingEmpties = 42 - renderedCells;
    for (let i = 0; i < trailingEmpties; i++) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = calWrap.hasClass("is-hidden");
    parent.toggleClass("is-calendar-open", opening);
    calWrap.toggleClass("is-hidden", !opening);
    if (opening) renderCal();
  });
}
