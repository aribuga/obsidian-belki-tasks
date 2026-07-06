import type { App } from "obsidian";
import { Modal } from "obsidian";
import { BELKI_COLOR_PALETTE, getProjectColor } from "../../colors";
import { isReservedInboxProject, normalizeTaskProject } from "../../projects";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export interface CreateProjectResult {
  name: string;
  colorOverride?: string;
}

export class RenameProjectModal extends Modal {
  constructor(
    app: App,
    private currentName: string,
    private existingProjects: string[],
    private onSubmit: (newName: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-project-rename-modal");
    contentEl.createEl("h2", { text: "Rename project" });

    const input = contentEl.createEl("input", {
      cls: "belki-label-prompt-input",
      attr: { type: "text", value: this.currentName }
    });
    input.select();

    let errorEl: HTMLElement | null = null;

    const showError = (msg: string) => {
      if (!errorEl) {
        errorEl = contentEl.createDiv({ cls: "belki-modal-error" });
        actions.before(errorEl);
      }
      errorEl.setText(msg);
    };

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions.createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } })
      .addEventListener("click", () => this.close());

    const submitButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Rename",
      attr: { type: "button" }
    });

    const submit = () => {
      const newName = input.value.trim();
      if (!newName) { showError("Project name cannot be empty."); return; }
      if (newName === this.currentName) { this.close(); return; }
      if (this.existingProjects.some((p) => p.toLowerCase() === newName.toLowerCase())) {
        showError("A project with that name already exists.");
        return;
      }
      void this.onSubmit(newName).then(() => this.close());
    };

    submitButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); submit(); }
    });
    input.focus();
  }
}

export class DeleteProjectModal extends Modal {
  constructor(
    app: App,
    private projectName: string,
    private taskCount: number,
    private onConfirm: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-project-delete-modal");
    contentEl.createEl("h2", { text: `Delete "${this.projectName}"?` });

    const desc = this.taskCount > 0
      ? `This will delete the project only. ${this.taskCount} task${this.taskCount === 1 ? "" : "s"} will be moved to Inbox. Tasks will not be deleted.`
      : "This will delete the project. It has no tasks.";
    contentEl.createEl("p", { text: desc, cls: "belki-modal-desc" });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions.createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } })
      .addEventListener("click", () => this.close());
    actions.createEl("button", {
      cls: "belki-button belki-button-destructive",
      text: "Delete project",
      attr: { type: "button" }
    }).addEventListener("click", () => {
      void this.onConfirm().then(() => this.close());
    });
  }
}

export class CreateProjectModal extends Modal {
  private selectedColor: string | null = null;
  private autoPreviewName = "New project";

  constructor(
    app: App,
    private existingProjects: string[],
    private onSubmit: (project: CreateProjectResult) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-project-rename-modal");
    contentEl.addClass("belki-project-create-modal");
    contentEl.createEl("h2", { text: "New project" });

    const input = contentEl.createEl("input", {
      cls: "belki-label-prompt-input",
      attr: { type: "text", placeholder: "Project name" }
    });

    const appearance = contentEl.createDiv({ cls: "belki-project-create-appearance" });
    const preview = appearance.createDiv({ cls: "belki-project-create-preview" });
    const previewChip = preview.createDiv({ cls: "belki-project-create-preview-chip" });
    const previewDot = previewChip.createSpan({ cls: "belki-project-dot" });
    const previewName = previewChip.createSpan({ cls: "belki-project-create-preview-name" });

    const colorControl = appearance.createDiv({ cls: "belki-project-create-color-control" });

    const autoButton = colorControl.createEl("button", {
      cls: "belki-project-color-auto is-selected",
      attr: { type: "button", "aria-label": "Automatic project color", "aria-pressed": "true" }
    });
    const autoDot = autoButton.createSpan({ cls: "belki-project-color-dot" });
    const autoText = autoButton.createSpan({ cls: "belki-project-color-auto-text", text: "✓ Auto" });

    const randomButton = colorControl.createEl("button", {
      cls: "belki-project-color-random",
      attr: { type: "button", "aria-label": "Choose another project color" }
    });
    createBelkiIcon(randomButton, "randomize");

    const customColor = colorControl.createEl("label", { cls: "belki-project-color-custom" });
    const customDot = customColor.createSpan({ cls: "belki-project-color-custom-dot" });
    const colorInput = customColor.createEl("input", {
      attr: { type: "color", "aria-label": "Custom project color" }
    });
    customColor.createSpan({ text: "Custom" });

    const selectColor = (color: string | null) => {
      this.selectedColor = color;
      autoButton.toggleClass("is-selected", color === null);
      autoButton.setAttribute("aria-pressed", String(color === null));
      autoText.setText(color === null ? "✓ Auto" : "Auto");
      customColor.toggleClass("is-selected", color !== null);
      updatePreview();
    };

    autoButton.addEventListener("click", () => {
      this.autoPreviewName = normalizeTaskProject(input.value) || "New project";
      selectColor(null);
    });
    randomButton.addEventListener("click", () => {
      const currentColor = (this.selectedColor || getProjectColor(this.autoPreviewName, {}).regular).toLowerCase();
      const candidates = BELKI_COLOR_PALETTE
        .map((color) => color.regular)
        .filter((color) => color.toLowerCase() !== currentColor);
      const nextColor = candidates[Math.floor(Math.random() * candidates.length)] || BELKI_COLOR_PALETTE[0].regular;
      selectColor(nextColor);
    });
    colorInput.addEventListener("input", () => selectColor(colorInput.value));
    colorInput.addEventListener("change", () => selectColor(colorInput.value));

    const updatePreview = () => {
      const previewProjectName = normalizeTaskProject(input.value) || "New project";
      const generatedColor = getProjectColor(this.autoPreviewName, {});
      const previewColor = this.selectedColor
        ? getProjectColor(previewProjectName, { [previewProjectName]: this.selectedColor })
        : generatedColor;
      previewChip.setCssProps({
        "--belki-project-bg": previewColor.light,
        "--belki-project-color": previewColor.regular
      });
      previewDot.setCssStyles({ backgroundColor: previewColor.regular });
      autoDot.setCssStyles({ backgroundColor: generatedColor.regular });
      customColor.setCssProps({ "--belki-custom-color": previewColor.regular });
      customDot.setCssStyles({ backgroundColor: previewColor.regular });
      colorInput.value = this.selectedColor || generatedColor.regular;
      previewName.setText(previewProjectName);
    };

    let errorEl: HTMLElement | null = null;
    const showError = (msg: string) => {
      if (!errorEl) {
        errorEl = contentEl.createDiv({ cls: "belki-modal-error" });
        actions.before(errorEl);
      }
      errorEl.setText(msg);
    };

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions.createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } })
      .addEventListener("click", () => this.close());

    const submitButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Create",
      attr: { type: "button" }
    });

    const submit = () => {
      const name = normalizeTaskProject(input.value);
      if (!name) { showError("Project name cannot be empty."); return; }
      if (isReservedInboxProject(name)) { showError('"Inbox" is reserved.'); return; }
      if (this.existingProjects.some((p) => p.toLowerCase() === name.toLowerCase())) {
        showError("A project with that name already exists.");
        return;
      }
      this.onSubmit({
        name,
        colorOverride: this.selectedColor || undefined
      });
      this.close();
    };

    submitButton.addEventListener("click", submit);
    input.addEventListener("input", () => {
      updatePreview();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); submit(); }
    });
    updatePreview();
    input.focus();
  }
}
