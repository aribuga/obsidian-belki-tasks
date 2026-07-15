import type { App } from "obsidian";
import { Modal } from "obsidian";
import type { BelkiTask } from "../../types";
import {
  getDirectSubTaskCount,
  taskDeleteConfirmationDescription
} from "./deleteTaskConfirmationText";

interface DeleteTaskConfirmationModalOptions {
  task: BelkiTask;
  tasks: BelkiTask[];
  onConfirm: () => Promise<void>;
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
    contentEl.createEl("h2", { text: "Delete task?" });

    const subTaskCount = getDirectSubTaskCount(this.options.task, this.options.tasks);
    contentEl.createEl("p", {
      cls: "belki-modal-desc",
      text: taskDeleteConfirmationDescription(subTaskCount)
    });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    const cancelButton = actions.createEl("button", {
      cls: "belki-button",
      text: "Cancel",
      attr: { type: "button" }
    });
    cancelButton.addEventListener("click", () => this.close());

    const deleteButton = actions.createEl("button", {
      cls: "belki-button belki-button-destructive",
      text: "Delete task",
      attr: { type: "button" }
    });
    deleteButton.addEventListener("click", () => {
      deleteButton.disabled = true;
      void this.options.onConfirm().then(() => this.close());
    });

    cancelButton.focus();
  }
}
