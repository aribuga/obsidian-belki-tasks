import type { App } from "obsidian";
import { Modal } from "obsidian";
import type { BelkiTask } from "../../types";
import { getDirectSubTaskCount, duplicateTaskModalDescription } from "./duplicateTaskText";

interface DuplicateTaskModalOptions {
  task: BelkiTask;
  tasks: BelkiTask[];
  onDuplicateTaskOnly: () => Promise<void>;
  onDuplicateWithSubtasks: () => Promise<void>;
}

export class DuplicateTaskModal extends Modal {
  constructor(
    app: App,
    private options: DuplicateTaskModalOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-task-duplicate-modal");
    contentEl.createEl("h2", { text: "Duplicate task?" });

    const subTaskCount = getDirectSubTaskCount(this.options.task, this.options.tasks);
    contentEl.createEl("p", {
      cls: "belki-modal-desc",
      text: duplicateTaskModalDescription(subTaskCount)
    });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    const cancelButton = actions.createEl("button", {
      cls: "belki-button",
      text: "Cancel",
      attr: { type: "button" }
    });
    const taskOnlyButton = actions.createEl("button", {
      cls: "belki-button",
      text: "Task only",
      attr: { type: "button" }
    });
    const includeSubtasksButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Include sub-tasks",
      attr: { type: "button" }
    });
    const buttons = [cancelButton, taskOnlyButton, includeSubtasksButton];

    cancelButton.addEventListener("click", () => this.close());
    taskOnlyButton.addEventListener("click", () => {
      void this.submit(buttons, this.options.onDuplicateTaskOnly);
    });
    includeSubtasksButton.addEventListener("click", () => {
      void this.submit(buttons, this.options.onDuplicateWithSubtasks);
    });

    cancelButton.focus();
  }

  private async submit(
    buttons: HTMLButtonElement[],
    action: () => Promise<void>
  ): Promise<void> {
    for (const button of buttons) {
      button.disabled = true;
    }

    await action();
    this.close();
  }
}
