import { addDaysIso, todayIso } from "../../dateUtils";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import { BelkiTask } from "../../types";
import { renderCustomDatePicker } from "../datePicker";

interface RenderTaskActionsOptions {
  row: HTMLElement;
  task: BelkiTask;
  onOpenMenu: (button: HTMLElement) => void;
}

interface RenderTaskActionMenuOptions {
  container: HTMLElement;
  task: BelkiTask;
  trigger: HTMLElement;
  onMoveDue: (due: string | undefined) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function renderTaskActions(options: RenderTaskActionsOptions): void {
  const actions = options.row.createDiv({ cls: "belki-task-actions" });
  const actionButton = actions.createEl("button", {
    cls: "belki-task-actions-button",
    attr: {
      type: "button",
      "aria-label": "Task actions"
    }
  });
  createBelkiIcon(actionButton, "more");
  actionButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onOpenMenu(actionButton);
  });
}

export function renderTaskActionMenu(options: RenderTaskActionMenuOptions): HTMLElement {
  const menu = options.container.createDiv({ cls: "belki-task-action-menu" });
  menu.addEventListener("click", (event) => event.stopPropagation());

  if (!options.task.completed && options.task.due !== todayIso()) {
    createTaskActionMenuButton(menu, "Move to Today", () => {
      options.onMoveDue(todayIso());
    });
  }

  const tomorrow = addDaysIso(1);
  if (!options.task.completed && options.task.due !== tomorrow) {
    createTaskActionMenuButton(menu, "Move to Tomorrow", () => {
      options.onMoveDue(tomorrow);
    });
  }

  if (!options.task.completed) {
    const datePickerWrap = menu.createDiv({ cls: "belki-task-action-date-picker" });
    renderCustomDatePicker(datePickerWrap, options.task.due, (value) => {
      options.onMoveDue(value);
    }, {
      triggerLabel: "Pick date",
      triggerAriaLabel: "Pick task date",
      alwaysShowTriggerLabel: true
    });
    datePickerWrap.querySelector<HTMLElement>(".belki-cal-trigger")?.addEventListener("click", () => {
      const ownerWindow = menu.ownerDocument.defaultView || window;
      ownerWindow.requestAnimationFrame(() => {
        menu.toggleClass("is-calendar-open", datePickerWrap.hasClass("is-calendar-open"));
        positionTaskActionMenu(menu, options.trigger);
      });
    });
  }

  if (!options.task.completed && options.task.due) {
    createTaskActionMenuButton(menu, "Clear date", () => {
      options.onMoveDue(undefined);
    });
  }

  createTaskActionMenuButton(menu, "Duplicate task", () => {
    options.onDuplicate();
  });

  createTaskActionMenuButton(menu, "Delete task", () => {
    options.onDelete();
  });

  positionTaskActionMenu(menu, options.trigger);
  return menu;
}

function positionTaskActionMenu(menu: HTMLElement, trigger: HTMLElement): void {
  const ownerWindow = menu.ownerDocument.defaultView || window;
  const rect = trigger.getBoundingClientRect();
  const margin = 12;
  const gap = 6;
  menu.style.maxHeight = "";
  menu.style.overflowY = "";

  const menuWidth = menu.offsetWidth || 170;
  const menuHeight = menu.offsetHeight || 180;
  const maxLeft = ownerWindow.innerWidth - menuWidth - margin;
  const storedLeft = Number.parseFloat(menu.dataset.anchorLeft || "");
  const left =
    menu.hasClass("is-calendar-open") && Number.isFinite(storedLeft)
      ? Math.min(Math.max(margin, storedLeft), Math.max(margin, maxLeft))
      : Math.min(Math.max(margin, rect.right - menuWidth), Math.max(margin, maxLeft));

  const side =
    menu.dataset.anchorSide === "above" || menu.dataset.anchorSide === "below"
      ? menu.dataset.anchorSide
      : rect.bottom + gap + menuHeight > ownerWindow.innerHeight - margin &&
          rect.top - menuHeight - gap >= margin
        ? "above"
        : "below";
  menu.dataset.anchorSide = side;
  menu.dataset.anchorLeft = String(left);

  let top = side === "above" ? rect.top - menuHeight - gap : rect.bottom + gap;
  let maxHeight = side === "above" ? rect.top - gap - margin : ownerWindow.innerHeight - top - margin;

  if (side === "above" && top < margin) {
    top = margin;
    maxHeight = Math.max(160, rect.top - gap - margin);
  }

  if (side === "below" && top < margin) {
    top = margin;
    maxHeight = ownerWindow.innerHeight - top - margin;
  }

  if (menuHeight > maxHeight) {
    menu.style.maxHeight = `${Math.max(160, maxHeight)}px`;
    menu.style.overflowY = "auto";
  }

  menu.setCssStyles({
    left: `${left}px`,
    top: `${top}px`
  });
}

function createTaskActionMenuButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void
): void {
  parent
    .createEl("button", {
      cls: "belki-task-action-menu-item",
      text: label,
      attr: { type: "button" }
    })
    .addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
}
