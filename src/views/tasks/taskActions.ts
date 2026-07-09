import { addDaysIso, todayIso } from "../../dateUtils";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import { BelkiTask } from "../../types";

interface RenderTaskActionsOptions {
  row: HTMLElement;
  task: BelkiTask;
  onOpenMenu: (button: HTMLElement) => void;
  onDelete: () => void;
}

interface RenderTaskActionMenuOptions {
  container: HTMLElement;
  task: BelkiTask;
  trigger: HTMLElement;
  onMoveDue: (due: string | undefined) => void;
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

  const deleteButton = actions.createEl("button", {
    cls: "belki-task-delete",
    attr: {
      type: "button",
      "aria-label": "Delete task"
    }
  });
  createBelkiIcon(deleteButton, "delete");
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onDelete();
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
    const pickDateItem = menu.createEl("label", { cls: "belki-task-action-menu-item" });
    pickDateItem.createSpan({ text: "Pick date" });
    const dateInput = pickDateItem.createEl("input", {
      cls: "belki-task-action-date-input",
      attr: {
        type: "date",
        value: options.task.due || todayIso(),
        "aria-label": "Pick task date"
      }
    });
    dateInput.addEventListener("click", (event) => event.stopPropagation());
    dateInput.addEventListener("change", () => {
      options.onMoveDue(dateInput.value || undefined);
    });
  }

  if (!options.task.completed && options.task.due) {
    createTaskActionMenuButton(menu, "Clear date", () => {
      options.onMoveDue(undefined);
    });
  }

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
  const menuWidth = menu.offsetWidth || 170;
  const menuHeight = menu.offsetHeight || 180;
  const maxLeft = ownerWindow.innerWidth - menuWidth - margin;
  const left = Math.min(Math.max(margin, rect.right - menuWidth), Math.max(margin, maxLeft));
  let top = rect.bottom + gap;

  if (top + menuHeight > ownerWindow.innerHeight - margin) {
    top = rect.top - menuHeight - gap;
  }

  if (top < margin) {
    top = margin;
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
