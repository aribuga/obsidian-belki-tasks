import { App, Modal, TFile, setIcon } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import { todayIso } from "../dateUtils";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { applyBelkiFontSettings, BelkiSettings } from "../settings";
import { TaskStore } from "../taskStore";
import { BelkiTask, PRIORITIES, Priority } from "../types";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { getPriorityColor, getPriorityLabel } from "../priority";

interface TaskDetailModalOptions {
  task: BelkiTask;
  projects: string[];
  labels: string[];
  settings: BelkiSettings;
  store: TaskStore;
  onChange: () => void;
}

export class TaskDetailModal extends Modal {
  private draft: BelkiTask;
  private handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(".belki-detail-project-create")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(app: App, private options: TaskDetailModalOptions) {
    super(app);
    this.draft = {
      ...options.task,
      labels: dedupeLabels(options.task.labels),
      attachments: [...options.task.attachments],
      extraProperties: options.task.extraProperties.map((property) => ({ ...property }))
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-root");
    contentEl.addClass("belki-detail-modal");
    applyBelkiFontSettings(contentEl, this.options.settings);
    this.modalEl.addEventListener("keydown", this.handleEscape, true);

    const shell = contentEl.createDiv({ cls: "belki-detail-shell" });
    const main = shell.createDiv({ cls: "belki-detail-main" });
    const side = shell.createDiv({ cls: "belki-detail-side" });

    const closeButton = shell.createEl("button", {
      cls: "belki-detail-close",
      text: "×",
      attr: { type: "button", "aria-label": "Close task details" }
    });
    closeButton.addEventListener("click", () => this.close());

    const titleRow = main.createDiv({ cls: "belki-detail-title-row" });
    const checkbox = titleRow.createEl("button", {
      cls: "belki-task-checkbox belki-detail-checkbox",
      attr: { type: "button" }
    });
    checkbox.toggleClass("is-checked", this.draft.completed);
    checkbox.addEventListener("click", () => {
      this.draft.completed = !this.draft.completed;
      this.draft.completedDate = this.draft.completed ? todayIso() : undefined;
      checkbox.toggleClass("is-checked", this.draft.completed);
    });

    const titleInput = titleRow.createEl("input", {
      cls: "belki-detail-title",
      attr: { type: "text", value: this.draft.title }
    });
    titleInput.addEventListener("input", () => {
      this.draft.title = titleInput.value;
    });

    const descriptionInput = main.createEl("textarea", {
      cls: "belki-detail-description",
      attr: { placeholder: "Description" }
    });
    descriptionInput.value = this.draft.description || "";
    descriptionInput.addEventListener("input", () => {
      this.draft.description = descriptionInput.value;
    });

    this.renderAttachments(main);
    this.renderSidePanel(side);

    const footer = contentEl.createDiv({ cls: "belki-detail-footer" });
    footer
      .createEl("button", {
        cls: "belki-detail-delete",
        text: "Delete task",
        attr: { type: "button" }
      })
      .addEventListener("click", async () => {
        await this.options.store.deleteTask(this.draft.id);
        this.options.onChange();
        this.close();
      });

    const footerActions = footer.createDiv({ cls: "belki-detail-actions" });
    footerActions
      .createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } })
      .addEventListener("click", () => this.close());
    footerActions
      .createEl("button", {
        cls: "belki-button belki-button-primary",
        text: "Save",
        attr: { type: "button" }
      })
      .addEventListener("click", async () => {
        await this.save();
      });

    titleInput.focus();
  }

  onClose(): void {
    this.modalEl.removeEventListener("keydown", this.handleEscape, true);
  }

  private renderSidePanel(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Task details" });
    this.renderProject(parent);
    this.renderDate(parent, "Date", "due");
    this.renderDate(parent, "Deadline", "deadline");
    this.renderPriority(parent);
    this.renderLabels(parent);
  }

  private renderAttachments(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: "belki-attachments-section" });
    const header = section.createDiv({ cls: "belki-attachments-header" });
    header.createEl("h3", { text: "Attachments" });

    const list = section.createDiv({ cls: "belki-attachments-list" });
    const renderList = () => {
      list.empty();
      const imagePaths = this.draft.attachments.filter((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return isImagePath(path) && file instanceof TFile;
      });

      if (this.draft.attachments.length === 0) {
        list.createDiv({
          cls: "belki-attachments-empty",
          text: "No attachments yet."
        });
      }

      if (imagePaths.length > 0) {
        this.renderImagePreviews(list, imagePaths, renderList);
      }

      for (const path of this.draft.attachments.filter(
        (attachment) => !isImagePath(attachment)
      )) {
        const item = list.createDiv({ cls: "belki-attachment-item" });
        item.setAttr("role", "button");
        item.setAttr("tabindex", "0");
        const openAttachment = () => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (isImagePath(path) && file instanceof TFile) {
            new ImagePreviewModal(this.app, file, attachmentName(path)).open();
            return;
          }

          void this.app.workspace.openLinkText(path, "", false);
        };
        item.addEventListener("click", openAttachment);
        item.addEventListener("keydown", (event) => {
          if (event.target !== item) {
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAttachment();
          }
        });

        item.createDiv({ cls: "belki-attachment-file-icon", text: "📄" });

        const text = item.createDiv({ cls: "belki-attachment-text" });
        text.createDiv({ cls: "belki-attachment-name", text: attachmentName(path) });

        const actions = item.createDiv({ cls: "belki-attachment-actions" });
        const downloadButton = actions.createEl("button", {
          cls: "belki-attachment-action belki-attachment-download",
          attr: {
            type: "button",
            "aria-label": `Download ${attachmentName(path)}`
          }
        });
        setIcon(downloadButton, "download");
        downloadButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await this.downloadAttachment(path);
        });

        const removeButton = actions.createEl("button", {
          cls: "belki-attachment-action belki-attachment-remove",
          attr: {
            type: "button",
            "aria-label": `Remove ${attachmentName(path)}`
          }
        });
        setIcon(removeButton, "x");
        removeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.draft.attachments = this.draft.attachments.filter(
            (attachment) => attachment !== path
          );
          renderList();
        });
      }
    };

    const fileInput = section.createEl("input", {
      cls: "is-hidden",
      attr: {
        type: "file",
        multiple: "true"
      }
    });
    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []);
      for (const file of files) {
        const path = await this.options.store.addAttachmentFromFile(this.draft.id, file);
        if (path) {
          this.draft.attachments = [...this.draft.attachments, path];
        }
      }

      fileInput.value = "";
      renderList();
      this.options.onChange();
    });

    section
      .createEl("button", {
        cls: "belki-add-attachment-inline",
        text: "+ Add attachment",
        attr: { type: "button" }
      })
      .addEventListener("click", () => {
        fileInput.click();
      });

    renderList();
  }

  private renderImagePreviews(
    parent: HTMLElement,
    imagePaths: string[],
    onChange: () => void
  ): void {
    const gallery = parent.createDiv({
      cls: imagePaths.length === 1
        ? "belki-attachment-image-grid is-single"
        : "belki-attachment-image-grid is-grid"
    });

    for (const path of imagePaths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        continue;
      }

      const preview = gallery.createDiv({ cls: "belki-image-attachment-card" });
      preview.setAttr("role", "button");
      preview.setAttr("tabindex", "0");
      preview.setAttr("aria-label", `Preview ${attachmentName(path)}`);
      preview.setAttr("title", attachmentName(path));
      preview
        .createEl("img", {
          cls: "belki-image-attachment-img",
          attr: {
            src: this.app.vault.getResourcePath(file),
            alt: attachmentName(path)
          }
        });
      const actions = preview.createDiv({
        cls: "belki-image-attachment-actions belki-attachment-card-actions"
      });
      const downloadButton = actions.createEl("button", {
        cls: "belki-image-attachment-action belki-attachment-download",
        attr: {
          type: "button",
          "aria-label": `Download ${attachmentName(path)}`
        }
      });
      setIcon(downloadButton, "download");
      downloadButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.downloadAttachment(path);
      });

      const removeButton = actions.createEl("button", {
        cls: "belki-image-attachment-action belki-attachment-remove",
        attr: {
          type: "button",
          "aria-label": `Remove ${attachmentName(path)}`
        }
      });
      setIcon(removeButton, "x");
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.draft.attachments = this.draft.attachments.filter(
          (attachment) => attachment !== path
        );
        onChange();
      });
      preview.createDiv({ cls: "belki-image-attachment-name", text: attachmentName(path) });
      preview.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        new ImagePreviewModal(this.app, file, attachmentName(path)).open();
      });
      preview.addEventListener("keydown", (event) => {
        if (event.target !== preview) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          new ImagePreviewModal(this.app, file, attachmentName(path)).open();
        }
      });
    }
  }

  private async downloadAttachment(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.app.workspace.openLinkText(path, "", false);
      return;
    }

    try {
      const data = await this.app.vault.readBinary(file);
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      await this.app.workspace.openLinkText(path, "", false);
    }
  }

  private renderProject(parent: HTMLElement): void {
    const field = this.createField(parent, "Project");
    const projectPicker = field.createDiv({ cls: "belki-project-picker belki-detail-project-picker" });
    const projectDot = projectPicker.createSpan({
      cls: "belki-project-dot belki-detail-project-dot"
    });
    const select = projectPicker.createEl("select", {
      cls: "belki-detail-input belki-detail-select"
    });
    const createRow = field.createDiv({ cls: "belki-detail-project-create is-hidden" });
    const createInput = createRow.createEl("input", {
      cls: "belki-detail-project-create-input",
      attr: {
        type: "text",
        placeholder: "Project name"
      }
    });
    const createButton = createRow.createEl("button", {
      cls: "belki-detail-project-create-button",
      text: "Create",
      attr: { type: "button" }
    });
    const cancelCreateButton = createRow.createEl("button", {
      cls: "belki-detail-project-cancel-button",
      text: "Cancel",
      attr: { type: "button" }
    });
    const createValue = "__belki_create_project__";

    const getProjects = () =>
      uniqueProjects([
        "Inbox",
        this.options.settings.defaultProject,
        ...this.options.projects,
        ...Object.keys(this.options.settings.projectColors),
        this.draft.project
      ]);

    const renderOptions = () => {
      select.empty();
      for (const project of getProjects()) {
        select.createEl("option", { text: project, value: project });
      }

      select.createEl("option", { text: "Create project...", value: createValue });
      select.value = cleanProjectName(this.draft.project);
    };

    const updateProjectStyle = () => {
      const color = getProjectColor(
        cleanProjectName(this.draft.project),
        this.options.settings.projectColors
      );
      projectDot.style.backgroundColor = color.regular;
      projectPicker.style.backgroundColor = color.light;
      projectPicker.style.borderColor = color.light;
    };

    const hideCreateRow = () => {
      createInput.value = "";
      createRow.addClass("is-hidden");
      select.value = cleanProjectName(this.draft.project);
    };

    const createProject = () => {
      const project = optionalProjectName(createInput.value);
      if (!project) {
        createInput.focus();
        return;
      }

      this.draft.project = project;
      hideCreateRow();
      renderOptions();
      updateProjectStyle();
    };

    select.addEventListener("change", () => {
      if (select.value === createValue) {
        createRow.removeClass("is-hidden");
        select.value = cleanProjectName(this.draft.project);
        createInput.focus();
        return;
      }

      this.draft.project = cleanProjectName(select.value);
      createRow.addClass("is-hidden");
      updateProjectStyle();
    });
    createButton.addEventListener("click", createProject);
    cancelCreateButton.addEventListener("click", hideCreateRow);
    createInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createProject();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hideCreateRow();
      }
    });

    renderOptions();
    updateProjectStyle();
  }

  private renderDate(parent: HTMLElement, label: string, key: "due" | "deadline"): void {
    const field = this.createField(parent, label);
    const input = field.createEl("input", {
      cls: "belki-detail-input",
      attr: {
        type: "date",
        value: this.draft[key] || ""
      }
    });
    input.addEventListener("change", () => {
      this.draft[key] = input.value || undefined;
    });
  }

  private renderPriority(parent: HTMLElement): void {
    const field = this.createField(parent, "Priority");
    const priorityWrap = field.createDiv({ cls: "belki-priority-select-wrap belki-detail-priority-wrap" });
    const indicator = priorityWrap.createSpan({ cls: "belki-priority-indicator" });
    const select = priorityWrap.createEl("select", { cls: "belki-detail-input belki-priority-select" });
    for (const priority of PRIORITIES) {
      select.createEl("option", { text: getPriorityLabel(priority), value: priority });
    }
    select.value = this.draft.priority;
    const updatePriorityStyle = () => {
      const color = getPriorityColor(this.draft.priority);
      priorityWrap.style.setProperty("--belki-priority-text", color.color);
      priorityWrap.style.setProperty("--belki-priority-bg", color.light);
      priorityWrap.style.setProperty("--belki-priority-border", color.color);
      indicator.style.backgroundColor = color.color;
    };
    select.addEventListener("change", () => {
      this.draft.priority = select.value as Priority;
      updatePriorityStyle();
    });
    updatePriorityStyle();
  }

  private renderLabels(parent: HTMLElement): void {
    const field = this.createField(parent, "Labels");
    const chips = field.createDiv({ cls: "belki-detail-labels" });
    const input = field.createEl("input", {
      cls: "belki-detail-input",
      attr: {
        type: "text",
        placeholder: "#label"
      }
    });
    const suggestions = field.createDiv({ cls: "belki-label-suggestions" });

    const addLabel = (value: string) => {
      const label = normalizeLabelName(value);
      if (!label) {
        input.value = "";
        renderLabels();
        return;
      }

      this.draft.labels = dedupeLabels([...this.draft.labels, label]);
      this.ensureLabelColor(label);
      input.value = "";
      renderLabels();
    };

    const renderLabels = () => {
      chips.empty();
      for (const label of this.draft.labels) {
        const chip = chips.createEl("button", {
          cls: "belki-selected-label belki-detail-label-chip",
          attr: { type: "button" }
        });
        const color = this.getLabelColor(label);
        chip.style.backgroundColor = color.light;
        chip.style.borderColor = color.light;
        chip.createSpan({ cls: "belki-label-dot" }).style.backgroundColor = color.regular;
        chip.createSpan({ text: displayLabel(label) });
        chip.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        chip
          .createSpan({
            cls: "belki-label-chip-remove",
            text: "×",
            attr: { "aria-hidden": "true" }
          })
          .addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.draft.labels = this.draft.labels.filter((candidate) => candidate !== label);
            renderLabels();
          });
      }

      suggestions.empty();
      const query = normalizeLabelName(input.value);
      if (!query) {
        suggestions.createDiv({ cls: "belki-label-empty", text: "Type a label name" });
        return;
      }

      const labels = dedupeLabels(this.options.labels);
      const matches = labels
        .filter((label) => label.includes(query) && !this.draft.labels.includes(label))
        .slice(0, 8);
      for (const label of matches) {
        const suggestion = suggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: displayLabel(label),
          attr: { type: "button" }
        });
        suggestion.addEventListener("click", () => addLabel(label));
      }
      if (!labels.includes(query) && !this.draft.labels.includes(query)) {
        const create = suggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: `Create label: ${displayLabel(query)}`,
          attr: { type: "button" }
        });
        create.addEventListener("click", () => addLabel(query));
      }
    };

    input.addEventListener("focus", () => {
      if (!input.value) {
        input.value = "#";
      }
    });
    input.addEventListener("input", () => {
      if (input.value && !input.value.startsWith("#")) {
        input.value = `#${input.value}`;
      }
      renderLabels();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addLabel(input.value);
      }
    });

    renderLabels();
  }

  private createField(parent: HTMLElement, label: string): HTMLElement {
    const field = parent.createDiv({ cls: "belki-detail-field" });
    field.createDiv({ cls: "belki-detail-label", text: label });
    return field;
  }

  private ensureLabelColor(label: string): void {
    void label;
  }

  private getLabelColor(label: string): { regular: string; light: string } {
    return getLabelColor(label, this.options.settings.labelColors);
  }

  private async save(): Promise<void> {
    await this.options.store.updateTask(this.draft.id, {
      title: this.draft.title,
      completed: this.draft.completed,
      completedDate: this.draft.completed ? this.draft.completedDate || todayIso() : undefined,
      description: this.draft.description,
      due: this.draft.due,
      deadline: this.draft.deadline,
      project: this.draft.project,
      priority: this.draft.priority,
      labels: dedupeLabels(this.draft.labels),
      attachments: [...this.draft.attachments]
    });
    this.options.onChange();
    this.close();
  }
}

function attachmentName(path: string): string {
  return path.split("/").pop() || path;
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(path);
}

function uniqueProjects(projects: Array<string | undefined>): string[] {
  return [...new Set(projects.map(cleanProjectName).filter(Boolean))].sort((a, b) => {
    if (a === "Inbox") {
      return -1;
    }
    if (b === "Inbox") {
      return 1;
    }

    return a.localeCompare(b);
  });
}

function cleanProjectName(value: string | undefined): string {
  const clean = value?.trim().replace(/^>+\s*/, "");
  return clean || "Inbox";
}

function optionalProjectName(value: string | null): string | undefined {
  return value?.trim().replace(/^>+\s*/, "") || undefined;
}
