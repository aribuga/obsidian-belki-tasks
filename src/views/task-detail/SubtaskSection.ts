import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../../dateUtils";
import {
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityDropdownLabel,
  hasVisiblePriority
} from "../../priority";
import type { TaskStore } from "../../taskStore";
import { PRIORITIES } from "../../types";
import type { BelkiTask, Priority } from "../../types";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export interface SubtaskSectionOptions {
  store: TaskStore;
  parentTask: BelkiTask;
  onChange: () => void;
  openTaskDetail: (task: BelkiTask, onChange: () => void) => void;
}

export function renderSubtaskSection(parent: HTMLElement, options: SubtaskSectionOptions): void {
  const allTasks = options.store.getTasks();
  const subTasks = allTasks.filter((t) => t.parentId === options.parentTask.id);
  const doneCount = subTasks.filter((t) => t.completed).length;

  const section = parent.createDiv({ cls: "belki-subtasks-section" });
  const header = section.createDiv({ cls: "belki-attachments-header" });
  const titleEl = header.createEl("h3", { cls: "belki-subtasks-title" });
  titleEl.createSpan({ text: "Sub-tasks" });
  const countEl = titleEl.createSpan({
    cls: "belki-subtasks-count",
    text: subTasks.length > 0 ? ` ${doneCount}/${subTasks.length}` : ""
  });

  const list = section.createDiv({ cls: "belki-subtasks-list" });
  let draggedSubTaskId: string | null = null;

  const clearDropState = () => {
    list
      .querySelectorAll<HTMLElement>(".is-dragging, .is-drop-before, .is-drop-after")
      .forEach((row) => {
        row.removeClass("is-dragging");
        row.removeClass("is-drop-before");
        row.removeClass("is-drop-after");
      });
  };

  const dropPlacementForEvent = (
    row: HTMLElement,
    event: DragEvent
  ): "before" | "after" => {
    const rect = row.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  };

  const updateHeader = () => {
    const current = options.store.getTasks().filter((t) => t.parentId === options.parentTask.id);
    const done = current.filter((t) => t.completed).length;
    countEl.setText(current.length > 0 ? ` ${done}/${current.length}` : "");
  };

  const renderList = () => {
    list.empty();
    const all = options.store.getTasks().filter((t) => t.parentId === options.parentTask.id);
    const current = [...all].sort((a, b) => a.order - b.order);
    current.forEach((sub) => {
      const row = list.createDiv({ cls: "belki-subtask-row" });
      row.dataset.subtaskId = sub.id;

      const dragHandle = row.createEl("button", {
        cls: "belki-subtask-drag-handle",
        attr: {
          type: "button",
          draggable: "true",
          "aria-label": `Reorder ${sub.title}`
        }
      });
      createBelkiIcon(dragHandle, "dragHandle");
      dragHandle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      dragHandle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        draggedSubTaskId = sub.id;
        row.addClass("is-dragging");
        const dragImage = createSubTaskDragImage(row);
        event.dataTransfer?.setData("application/x-belki-subtask-id", sub.id);
        event.dataTransfer?.setData("text/plain", sub.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(dragImage, 20, 18);
        }
        window.setTimeout(() => dragImage.remove(), 0);
      });
      dragHandle.addEventListener("dragend", () => {
        draggedSubTaskId = null;
        clearDropState();
      });

      row.addEventListener("dragover", (event) => {
        if (!draggedSubTaskId || draggedSubTaskId === sub.id) {
          return;
        }

        event.preventDefault();
        const placement = dropPlacementForEvent(row, event);
        row.toggleClass("is-drop-before", placement === "before");
        row.toggleClass("is-drop-after", placement === "after");
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      row.addEventListener("dragleave", (event) => {
        if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) {
          return;
        }

        row.removeClass("is-drop-before");
        row.removeClass("is-drop-after");
      });
      row.addEventListener("drop", (event) => {
        const taskId =
          draggedSubTaskId ||
          event.dataTransfer?.getData("application/x-belki-subtask-id") ||
          event.dataTransfer?.getData("text/plain");
        if (!taskId || taskId === sub.id) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const placement = dropPlacementForEvent(row, event);
        draggedSubTaskId = null;
        clearDropState();
        void options.store.reorderSubTask(taskId, sub.id, placement).then(() => {
          renderList();
          options.onChange();
        });
      });

      const checkbox = row.createEl("button", {
        cls: "belki-task-checkbox belki-subtask-checkbox",
        attr: { type: "button" }
      });
      checkbox.toggleClass("is-checked", sub.completed);
      checkbox.addEventListener("click", () => {
        void options.store.toggleComplete(sub.id).then(() => {
          renderList();
          updateHeader();
        });
      });

      const info = row.createDiv({ cls: "belki-subtask-info" });

      const titleLine = info.createDiv({ cls: "belki-subtask-title-line" });
      const titleEl2 = titleLine.createSpan({ cls: `belki-subtask-title${sub.completed ? " is-completed" : ""}`, text: sub.title });
      titleEl2.addEventListener("click", () => {
        options.openTaskDetail(sub, () => {
          renderList();
          options.onChange();
        });
      });

      const deleteBtn = titleLine.createSpan({
        cls: "belki-subtask-delete",
        attr: { role: "button", tabindex: "0", "aria-label": "Delete sub-task" }
      });
      createBelkiIcon(deleteBtn, "delete");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void options.store.deleteTask(sub.id).then(() => {
          renderList();
          updateHeader();
          options.onChange();
        });
      });

      const meta = info.createDiv({ cls: "belki-subtask-meta" });
      if (sub.due) {
        meta.createSpan({ cls: "belki-subtask-due", text: formatDueDateChip(sub.due) });
      }
      if (hasVisiblePriority(sub.priority)) {
        const pc = getPriorityColor(sub.priority);
        const badge = meta.createSpan({ cls: "belki-subtask-priority", text: getPriorityDisplayLabel(sub.priority) });
        badge.setCssStyles({ color: pc.color });
      }
    });
  };

  renderList();

  const addRow = section.createDiv({ cls: "belki-subtask-add-row" });

  const showComposer = () => {
    addRow.empty();

    let composerDue = "";
    let composerPriority: Priority = "P4";
    type ExpandedPanel = "date" | "priority" | null;
    let expandedPanel: ExpandedPanel = null;

    const input = addRow.createEl("input", {
      cls: "belki-subtask-input",
      attr: { type: "text", placeholder: "Sub-task title" }
    });

    const chipsRow = addRow.createDiv({ cls: "belki-subtask-chips" });
    const expandPanel = addRow.createDiv({ cls: "belki-subtask-expand-panel is-hidden" });

    const closePanel = () => {
      expandPanel.addClass("is-hidden");
      expandPanel.empty();
      expandedPanel = null;
      renderChips();
    };

    const openDatePanel = () => {
      expandedPanel = "date";
      expandPanel.empty();
      expandPanel.removeClass("is-hidden");

      const presets: [string, string][] = [
        ["Today", todayIso()],
        ["Tomorrow", addDaysIso(1)],
        ["Next week", addDaysIso(7)],
        ["Weekend", nextWeekdayIso(6)]
      ];
      for (const [label, value] of presets) {
        const btn = expandPanel.createEl("button", {
          cls: "belki-subtask-preset" + (value === composerDue ? " is-active" : ""),
          text: label,
          attr: { type: "button" }
        });
        btn.addEventListener("click", () => { composerDue = composerDue === value ? "" : value; closePanel(); });
      }

      const customInput = expandPanel.createEl("input", {
        cls: "belki-subtask-preset-date",
        attr: { type: "date", title: "Custom date" }
      });
      if (composerDue) customInput.value = composerDue;
      customInput.addEventListener("change", () => { if (customInput.value) { composerDue = customInput.value; closePanel(); } });
    };

    const openPriorityPanel = () => {
      expandedPanel = "priority";
      expandPanel.empty();
      expandPanel.removeClass("is-hidden");

      for (const p of PRIORITIES.filter((priority) => priority !== "none")) {
        const btn = expandPanel.createEl("button", {
          cls: "belki-subtask-preset" + (p === composerPriority ? " is-active" : ""),
          text: getPriorityDropdownLabel(p),
          attr: { type: "button" }
        });
        if (hasVisiblePriority(p)) btn.setCssStyles({ color: getPriorityColor(p).color });
        btn.addEventListener("click", () => { composerPriority = p; closePanel(); });
      }
    };

    const renderChips = () => {
      chipsRow.empty();

      const dateChip = chipsRow.createEl("button", {
        cls: "belki-subtask-chip" + (composerDue ? " is-active" : "") + (expandedPanel === "date" ? " is-open" : ""),
        attr: { type: "button" }
      });
      createBelkiIcon(dateChip, "calendar", { className: "belki-chip-icon" });
      dateChip.createSpan({ text: composerDue ? formatDueDateChip(composerDue) : "Date" });
      if (composerDue) {
        const clr = createBelkiIcon(dateChip, "close", { className: "belki-subtask-chip-clear" });
        clr.addEventListener("click", (e) => { e.stopPropagation(); composerDue = ""; closePanel(); renderChips(); });
      }
      dateChip.addEventListener("click", () => {
        if (expandedPanel === "date") { closePanel(); } else { openDatePanel(); renderChips(); }
      });

      const priChip = chipsRow.createEl("button", {
        cls: "belki-subtask-chip" + (hasVisiblePriority(composerPriority) ? " is-active" : "") + (expandedPanel === "priority" ? " is-open" : ""),
        attr: { type: "button" }
      });
      if (hasVisiblePriority(composerPriority)) {
        priChip.setCssStyles({ color: getPriorityColor(composerPriority).color });
      }
      createBelkiIcon(priChip, "priority", { className: "belki-chip-icon" });
      priChip.createSpan({ text: getPriorityDisplayLabel(composerPriority) });
      priChip.addEventListener("click", () => {
        if (expandedPanel === "priority") { closePanel(); } else { openPriorityPanel(); renderChips(); }
      });
    };

    renderChips();

    const btnRow = addRow.createDiv({ cls: "belki-subtask-btn-row" });
    const addBtn = btnRow.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Add task",
      attr: { type: "button" }
    });
    const cancelBtn = btnRow.createEl("button", {
      cls: "belki-button",
      text: "Cancel",
      attr: { type: "button" }
    });

    const submit = () => {
      const title = input.value.trim();
      if (!title) return;
      void options.store.createTask({
        title,
        project: options.parentTask.project,
        parentId: options.parentTask.id,
        due: composerDue || undefined,
        priority: composerPriority
      }).then(() => {
        renderList();
        updateHeader();
        input.value = "";
        composerDue = "";
        composerPriority = "P4";
        expandedPanel = null;
        expandPanel.addClass("is-hidden");
        expandPanel.empty();
        renderChips();
        input.focus();
      }).catch((err: unknown) => {
        console.error("[belki] Failed to create sub-task", err);
      });
    };

    addBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      if (e.key === "Escape") { e.preventDefault(); showAddButton(); }
    });
    cancelBtn.addEventListener("click", showAddButton);
    input.focus();
  };

  const showAddButton = () => {
    addRow.empty();
    const btn = addRow.createEl("button", {
      cls: "belki-subtask-add-btn",
      attr: { type: "button" }
    });
    createBelkiIcon(btn, "add");
    btn.createSpan({ text: "Add sub-task" });
    btn.addEventListener("click", showComposer);
  };

  showAddButton();
}

function createSubTaskDragImage(row: HTMLElement): HTMLElement {
  const dragImage = row.cloneNode(true) as HTMLElement;
  dragImage.addClass("belki-subtask-drag-preview");
  dragImage.setCssStyles({
    position: "absolute",
    top: "-9999px",
    left: "-9999px",
    width: `${row.offsetWidth}px`
  });
  activeDocument.body.appendChild(dragImage);
  return dragImage;
}
