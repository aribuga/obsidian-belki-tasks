import { dueDateForBulkRescheduleShortcut } from "../../taskBulkActions";
import { renderCustomDatePicker } from "../datePicker";

interface RenderBulkReschedulePopoverOptions {
  parent: HTMLElement;
  count: number;
  onSelectDue: (due: string, label: string) => void;
}

export function renderBulkReschedulePopover(
  options: RenderBulkReschedulePopoverOptions
): () => void {
  const wrapper = options.parent.createDiv({ cls: "belki-bulk-reschedule" });
  const button = wrapper.createEl("button", {
    cls: "belki-reschedule",
    text: `Reschedule ${options.count}`,
    attr: {
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-label": `Reschedule ${options.count} overdue task${options.count === 1 ? "" : "s"}`
    }
  });
  let popover: HTMLElement | null = null;
  let detachOutside: (() => void) | null = null;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (popover) {
      closePopover(true);
    } else {
      openPopover();
    }
  });

  const openPopover = () => {
    closePopover(false);
    button.setAttr("aria-expanded", "true");
    popover = wrapper.createDiv({
      cls: "belki-bulk-reschedule-popover",
      attr: { role: "menu", "aria-label": "Reschedule overdue tasks" }
    });
    popover.addEventListener("click", (event) => event.stopPropagation());
    popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePopover(true);
      }
    });

    popover.createDiv({
      cls: "belki-bulk-reschedule-title",
      text: `Reschedule ${options.count} task${options.count === 1 ? "" : "s"}`
    });

    createPresetButton(popover, "Today", dueDateForBulkRescheduleShortcut("today"), selectDue);
    createPresetButton(popover, "Tomorrow", dueDateForBulkRescheduleShortcut("tomorrow"), selectDue);
    createPresetButton(popover, "Next week", dueDateForBulkRescheduleShortcut("nextWeek"), selectDue);

    popover.createDiv({ cls: "belki-date-divider" });
    renderCustomDatePicker(popover, undefined, (value) => {
      selectDue(value, value);
    }, {
      triggerLabel: "Pick a date...",
      triggerAriaLabel: "Pick bulk reschedule date",
      triggerRole: "menuitem"
    });

    const ownerDocument = wrapper.ownerDocument;
    const handleOutside = (event: MouseEvent) => {
      if (!wrapper.contains(event.target as Node)) {
        closePopover(false);
      }
    };
    ownerDocument.addEventListener("click", handleOutside, { capture: true });
    detachOutside = () => ownerDocument.removeEventListener("click", handleOutside, { capture: true });
  };

  const closePopover = (restoreFocus: boolean) => {
    popover?.remove();
    popover = null;
    button.setAttr("aria-expanded", "false");
    detachOutside?.();
    detachOutside = null;
    if (restoreFocus) {
      button.focus();
    }
  };

  const selectDue = (due: string, label: string) => {
    closePopover(false);
    options.onSelectDue(due, label);
  };

  return () => closePopover(false);
}

function createPresetButton(
  parent: HTMLElement,
  label: string,
  due: string,
  onSelectDue: (due: string, label: string) => void
): void {
  parent
    .createEl("button", {
      cls: "belki-bulk-reschedule-option",
      text: label,
      attr: { type: "button", role: "menuitem" }
    })
    .addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelectDue(due, label);
    });
}
