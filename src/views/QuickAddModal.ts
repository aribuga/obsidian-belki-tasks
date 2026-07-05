import { App, Modal } from "obsidian";

export class QuickAddModal extends Modal {
  private isSubmitting = false;

  constructor(
    app: App,
    private onSubmit: (title: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-quick-add-modal");

    contentEl.createEl("h2", { text: "Quick add task" });
    contentEl.createEl("p", {
      cls: "belki-quick-add-desc",
      text: "Capture a task now. It will appear in Inbox."
    });

    const input = contentEl.createEl("input", {
      cls: "belki-quick-add-input",
      attr: {
        type: "text",
        placeholder: "Task title"
      }
    });

    const actions = contentEl.createDiv({ cls: "belki-quick-add-actions" });
    actions
      .createEl("button", {
        cls: "belki-button",
        text: "Cancel",
        attr: { type: "button" }
      })
      .addEventListener("click", () => this.close());

    const addButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Add task",
      attr: { type: "button" }
    });

    const submit = async () => {
      const title = input.value.trim();
      if (!title || this.isSubmitting) {
        return;
      }

      this.isSubmitting = true;
      addButton.disabled = true;
      try {
        await this.onSubmit(title);
        this.close();
      } finally {
        this.isSubmitting = false;
        addButton.disabled = false;
      }
    };

    addButton.addEventListener("click", () => {
      void submit();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });

    input.focus();
  }
}
