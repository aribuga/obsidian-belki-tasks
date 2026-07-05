import { App, Modal } from "obsidian";
import { displayLabel, normalizeLabelName } from "../labels";

export class RenameLabelModal extends Modal {
  constructor(
    app: App,
    private currentLabel: string,
    private existingLabels: string[],
    private onSubmit: (newLabel: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-label-prompt");
    contentEl.createEl("h2", { text: "Rename label" });

    const input = contentEl.createEl("input", {
      cls: "belki-label-prompt-input",
      attr: {
        type: "text",
        value: displayLabel(this.currentLabel)
      }
    });
    input.select();

    let errorEl: HTMLElement | null = null;
    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });

    const showError = (message: string) => {
      if (!errorEl) {
        errorEl = contentEl.createDiv({ cls: "belki-modal-error" });
        actions.before(errorEl);
      }
      errorEl.setText(message);
    };

    actions
      .createEl("button", {
        cls: "belki-button",
        text: "Cancel",
        attr: { type: "button" }
      })
      .addEventListener("click", () => this.close());

    const submitButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Rename",
      attr: { type: "button" }
    });

    const submit = () => {
      const current = normalizeLabelName(this.currentLabel);
      const next = normalizeLabelName(input.value);
      if (!next) {
        showError("Label name cannot be empty.");
        return;
      }
      if (next === current) {
        this.close();
        return;
      }
      if (
        this.existingLabels.some(
          (label) => normalizeLabelName(label) === next && normalizeLabelName(label) !== current
        )
      ) {
        showError("A label with that name already exists.");
        return;
      }

      void this.onSubmit(next).then(() => this.close());
    };

    submitButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    input.focus();
  }
}

export class DeleteLabelModal extends Modal {
  constructor(
    app: App,
    private label: string,
    private taskCount: number,
    private onConfirm: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-label-prompt");
    contentEl.createEl("h2", { text: `Delete ${displayLabel(this.label)}?` });

    const desc =
      this.taskCount > 0
        ? `This will remove ${displayLabel(this.label)} from ${this.taskCount} task${this.taskCount === 1 ? "" : "s"}. Tasks will not be deleted.`
        : "This label is not assigned to any tasks.";
    contentEl.createEl("p", { text: desc, cls: "belki-modal-desc" });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions
      .createEl("button", {
        cls: "belki-button",
        text: "Cancel",
        attr: { type: "button" }
      })
      .addEventListener("click", () => this.close());

    actions
      .createEl("button", {
        cls: "belki-button belki-button-destructive",
        text: "Delete label",
        attr: { type: "button" }
      })
      .addEventListener("click", () => {
        void this.onConfirm().then(() => this.close());
      });
  }
}
