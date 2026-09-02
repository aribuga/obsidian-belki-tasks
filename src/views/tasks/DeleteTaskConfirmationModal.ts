import type { App } from "obsidian";
import { Modal } from "obsidian";
import type { BelkiTask } from "../../types";
import {
  getDirectSubTaskCount,
  taskDeleteConfirmationDescription
} from "./deleteTaskConfirmationText";
import { t } from "../../i18n";

interface DeleteTaskConfirmationModalOptions {
  task: BelkiTask;
  tasks: BelkiTask[];
  onDeleteTaskOnly: () => Promise<void>;
  onDeleteWithSubtasks?: () => Promise<void>;
}

export class DeleteTaskConfirmationModal extends Modal {
  constructor(
    app: App,
    private options: DeleteTaskConfirmationModalOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-task-delete-modal");
    contentEl.createEl("h2", { text: t("modal.deleteTask") });

    const subTaskCount = getDirectSubTaskCount(this.options.task, this.options.tasks);
    contentEl.createEl("p", {
      cls: "belki-modal-desc",
      text: taskDeleteConfirmationDescription(subTaskCount)
    });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    const cancelButton = actions.createEl("button", {
      cls: "belki-button",
      text: t("common.cancel"),
      attr: { type: "button" }
    });
    cancelButton.addEventListener("click", () => this.close());

    if (subTaskCount > 0 && this.options.onDeleteWithSubtasks) {
      const deleteTaskOnlyButton = actions.createEl("button", {
        cls: "belki-button belki-button-destructive",
        text: t("task.deleteTaskOnly"),
        attr: { type: "button" }
      });
      deleteTaskOnlyButton.addEventListener("click", () => {
        this.disableButtons(actions);
        void this.options.onDeleteTaskOnly().then(() => this.close());
      });

      const deleteWithSubtasksButton = actions.createEl("button", {
        cls: "belki-button belki-button-destructive",
        text: t("task.deleteTaskAndSubtasks"),
        attr: { type: "button" }
      });
      deleteWithSubtasksButton.addEventListener("click", () => {
        this.disableButtons(actions);
        void this.options.onDeleteWithSubtasks?.().then(() => this.close());
      });
    } else {
      const deleteButton = actions.createEl("button", {
        cls: "belki-button belki-button-destructive",
        text: t("task.deleteTask"),
        attr: { type: "button" }
      });
      deleteButton.addEventListener("click", () => {
        this.disableButtons(actions);
        void this.options.onDeleteTaskOnly().then(() => this.close());
      });
    }

    cancelButton.focus();
  }

  private disableButtons(actions: HTMLElement): void {
    for (const button of Array.from(actions.querySelectorAll("button"))) {
      button.disabled = true;
    }
  }
}
