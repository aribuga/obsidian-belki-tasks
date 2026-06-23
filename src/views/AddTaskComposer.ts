import { setIcon } from "obsidian";
import { CreateTaskInput, PRIORITIES, Priority } from "../types";
import { getLabelColor, getProjectColor } from "../colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { getPriorityColor, getPriorityLabel } from "../priority";

interface ComposerOptions {
  projects: string[];
  labels: string[];
  labelColors: Record<string, string>;
  projectColors: Record<string, string>;
  defaultProject: string;
  defaultDue?: string;
  onCancel: () => void;
  onEnsureLabel: (label: string) => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

export class AddTaskComposer {
  private titleInput?: HTMLInputElement;
  private projectSelect?: HTMLSelectElement;
  private customProjectInput?: HTMLInputElement;

  render(parent: HTMLElement, options: ComposerOptions): void {
    const form = parent.createEl("form", { cls: "belki-composer" });
    let selectedDue = options.defaultDue || "";
    let selectedDeadline = "";
    let selectedLabels: string[] = [];
    let pendingAttachments: File[] = [];

    this.titleInput = form.createEl("input", {
      cls: "belki-composer-title",
      attr: {
        type: "text",
        placeholder: "Task title"
      }
    });

    const descriptionInput = form.createEl("textarea", {
      cls: "belki-composer-description",
      attr: {
        placeholder: "Description"
      }
    });

    const chipRow = form.createDiv({ cls: "belki-composer-chip-row" });
    const dueButtons: HTMLButtonElement[] = [];
    let customDateButton: HTMLButtonElement | undefined;

    const customDateInput = chipRow.createEl("input", {
      cls: "belki-custom-date-input is-hidden",
      attr: {
        type: "date",
        value: selectedDue
      }
    });

    const updateDueButtons = () => {
      for (const button of dueButtons) {
        button.toggleClass("is-active", button.dataset.due === selectedDue);
      }
      customDateButton?.toggleClass(
        "is-active",
        Boolean(selectedDue && !dueButtons.some((button) => button.dataset.due === selectedDue))
      );
    };

    const setDue = (value: string) => {
      selectedDue = value;
      customDateInput.value = value;
      customDateInput.addClass("is-hidden");
      updateDueButtons();
    };

    const addDueButton = (
      label: string,
      value: string,
      icon: string
    ): HTMLButtonElement => {
      const button = createChipButton(chipRow, label, icon);
      button.dataset.due = value;
      button.addEventListener("click", () => setDue(value));
      dueButtons.push(button);
      return button;
    };

    addDueButton("Today", todayIso(), "calendar");
    addDueButton("Tomorrow", addDaysIso(1), "calendar-plus");
    addDueButton("No Date", "", "calendar-x");

    customDateButton = createChipButton(chipRow, "Custom date", "calendar-clock");
    customDateButton.addEventListener("click", () => {
      customDateInput.removeClass("is-hidden");
      customDateInput.focus();
    });
    customDateInput.addEventListener("change", () => {
      selectedDue = customDateInput.value;
      updateDueButtons();
    });

    const priorityWrap = chipRow.createDiv({ cls: "belki-chip-select-wrap" });
    createIcon(priorityWrap, "flag");
    const priorityIndicator = priorityWrap.createSpan({ cls: "belki-priority-indicator" });
    const prioritySelect = priorityWrap.createEl("select", {
      cls: "belki-chip-select",
      attr: {
        "aria-label": "Priority"
      }
    });
    for (const priority of PRIORITIES) {
      prioritySelect.createEl("option", {
        text: getPriorityLabel(priority),
        value: priority
      });
    }
    const updatePriorityStyle = () => {
      const priority = prioritySelect.value as Priority;
      const color = getPriorityColor(priority);
      priorityWrap.setCssProps({
        "--belki-priority-text": color.color,
        "--belki-priority-bg": color.light,
        "--belki-priority-border": color.color
      });
      priorityWrap.toggleClass("has-priority", priority !== "none");
      priorityIndicator.setCssStyles({ backgroundColor: color.color });
    };
    prioritySelect.addEventListener("change", updatePriorityStyle);
    updatePriorityStyle();

    const attachmentButton = createChipButton(chipRow, "Attachment", "paperclip");
    const attachmentInput = chipRow.createEl("input", {
      cls: "is-hidden",
      attr: {
        type: "file",
        multiple: "true"
      }
    });
    const pendingAttachmentsEl = form.createDiv({
      cls: "belki-composer-attachments is-hidden"
    });
    const renderPendingAttachments = () => {
      pendingAttachmentsEl.empty();
      pendingAttachmentsEl.toggleClass("is-hidden", pendingAttachments.length === 0);

      for (const [index, file] of pendingAttachments.entries()) {
        const item = pendingAttachmentsEl.createDiv({ cls: "belki-composer-attachment" });
        item.createDiv({
          cls: "belki-composer-attachment-icon",
          text: isImageFile(file) ? "🖼" : "📄"
        });
        item.createDiv({ cls: "belki-composer-attachment-name", text: file.name });
        item
          .createEl("button", {
            cls: "belki-composer-attachment-remove",
            text: "×",
            attr: {
              type: "button",
              "aria-label": `Remove ${file.name}`
            }
          })
          .addEventListener("click", () => {
            pendingAttachments = pendingAttachments.filter((_, candidateIndex) => candidateIndex !== index);
            renderPendingAttachments();
          });
      }
    };
    attachmentButton.addEventListener("click", () => {
      attachmentInput.click();
    });
    attachmentInput.addEventListener("change", () => {
      pendingAttachments = [
        ...pendingAttachments,
        ...Array.from(attachmentInput.files || [])
      ];
      attachmentInput.value = "";
      renderPendingAttachments();
    });

    const moreWrap = chipRow.createDiv({ cls: "belki-composer-more" });
    const moreButton = createChipButton(moreWrap, "", "ellipsis", "More task options");
    moreButton.addClass("belki-more-button");
    const menu = moreWrap.createDiv({ cls: "belki-composer-menu is-hidden" });
    const labelsButton = createMenuItem(menu, "Labels", "tag");
    const deadlineButton = createMenuItem(menu, "Deadline", "diamond");

    const labelsPanel = form.createDiv({ cls: "belki-composer-popover is-hidden" });
    const selectedLabelsEl = labelsPanel.createDiv({ cls: "belki-selected-labels" });
    const labelInput = labelsPanel.createEl("input", {
      cls: "belki-label-input",
      attr: {
        type: "text",
        placeholder: "#label"
      }
    });
    const labelSuggestions = labelsPanel.createDiv({ cls: "belki-label-suggestions" });

    const deadlinePanel = form.createDiv({ cls: "belki-composer-popover is-hidden" });
    deadlinePanel.createDiv({ cls: "belki-popover-title", text: "Deadline" });
    const deadlineInput = deadlinePanel.createEl("input", {
      cls: "belki-deadline-input",
      attr: {
        type: "date"
      }
    });
    deadlineInput.addEventListener("change", () => {
      selectedDeadline = deadlineInput.value;
    });

    const closePanels = () => {
      labelsPanel.addClass("is-hidden");
      deadlinePanel.addClass("is-hidden");
    };

    const updateMenuPosition = () => {
      menu.removeClass("is-align-right");
      window.requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 16) {
          menu.addClass("is-align-right");
        }
      });
    };

    moreButton.addEventListener("click", () => {
      const shouldOpen = menu.hasClass("is-hidden");
      closePanels();
      menu.toggleClass("is-hidden", !shouldOpen);
      if (shouldOpen) {
        updateMenuPosition();
      }
    });
    labelsButton.addEventListener("click", () => {
      menu.addClass("is-hidden");
      deadlinePanel.addClass("is-hidden");
      labelsPanel.toggleClass("is-hidden", !labelsPanel.hasClass("is-hidden"));
      labelInput.focus();
    });
    deadlineButton.addEventListener("click", () => {
      menu.addClass("is-hidden");
      labelsPanel.addClass("is-hidden");
      deadlinePanel.toggleClass("is-hidden", !deadlinePanel.hasClass("is-hidden"));
      deadlineInput.focus();
    });

    const addLabel = (value: string) => {
      const label = normalizeLabelName(value);
      if (!label || selectedLabels.includes(label)) {
        labelInput.value = "";
        renderLabels();
        return;
      }

      selectedLabels = [...selectedLabels, label];
      options.onEnsureLabel(label);
      labelInput.value = "";
      renderLabels();
    };

    const renderLabels = () => {
      selectedLabelsEl.empty();
      for (const label of selectedLabels) {
        const chip = selectedLabelsEl.createEl("button", {
          cls: "belki-selected-label",
          text: displayLabel(label),
          attr: { type: "button" }
        });
        const color = getLabelColor(label, options.labelColors);
        chip.setCssStyles({
          backgroundColor: color.light,
          borderColor: color.light
        });
        chip.addEventListener("click", () => {
          selectedLabels = selectedLabels.filter((candidate) => candidate !== label);
          renderLabels();
        });
      }

      labelSuggestions.empty();
      const query = normalizeLabelName(labelInput.value);
      if (!query) {
        labelSuggestions.createDiv({
          cls: "belki-label-empty",
          text: "Type a label name"
        });
        return;
      }

      const matches = dedupeLabels(options.labels)
        .filter((label) => label.includes(query) && !selectedLabels.includes(label))
        .slice(0, 8);

      for (const label of matches) {
        const suggestion = labelSuggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: displayLabel(label),
          attr: { type: "button" }
        });
        suggestion.addEventListener("click", () => addLabel(label));
      }

      if (!dedupeLabels(options.labels).includes(query) && !selectedLabels.includes(query)) {
        const create = labelSuggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: `Create label: ${displayLabel(query)}`,
          attr: { type: "button" }
        });
        create.addEventListener("click", () => addLabel(query));
      }
    };

    labelInput.addEventListener("focus", () => {
      if (!labelInput.value) {
        labelInput.value = "#";
      }
    });
    labelInput.addEventListener("input", () => {
      if (labelInput.value && !labelInput.value.startsWith("#")) {
        labelInput.value = `#${labelInput.value}`;
      }
      renderLabels();
    });
    labelInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addLabel(labelInput.value);
      }
      if (event.key === "Escape") {
        closePanels();
      }
    });
    renderLabels();

    const footer = form.createDiv({ cls: "belki-composer-footer" });
    const projectArea = footer.createDiv({ cls: "belki-composer-project" });

    const projectPicker = projectArea.createDiv({ cls: "belki-project-picker" });
    const projectDot = projectPicker.createSpan({ cls: "belki-project-dot belki-composer-project-dot" });
    this.projectSelect = projectPicker.createEl("select", { cls: "belki-project-select" });
    const projects = uniqueProjects(["Inbox", options.defaultProject, ...options.projects]);
    for (const project of projects) {
      const cleanProject = cleanProjectName(project);
      this.projectSelect.createEl("option", { text: cleanProject, value: cleanProject });
    }
    this.projectSelect.createEl("option", { text: "New project...", value: "__new__" });
    const defaultProject = cleanProjectName(options.defaultProject);
    this.projectSelect.value = projects.map(cleanProjectName).includes(defaultProject)
      ? defaultProject
      : "Inbox";

    this.customProjectInput = projectArea.createEl("input", {
      cls: "belki-chip-input belki-custom-project is-hidden",
      attr: {
        type: "text",
        placeholder: "Project name"
      }
    });

    const updateProjectDot = () => {
      const color = getProjectColor(this.readProject(), options.projectColors);
      projectDot.setCssStyles({ backgroundColor: color.regular });
      projectPicker.setCssStyles({
        backgroundColor: color.light,
        borderColor: color.light
      });
    };

    this.projectSelect.addEventListener("change", () => {
      this.customProjectInput?.toggleClass(
        "is-hidden",
        this.projectSelect?.value !== "__new__"
      );
      if (this.projectSelect?.value === "__new__") {
        this.customProjectInput?.focus();
      }
      updateProjectDot();
    });
    this.customProjectInput.addEventListener("input", updateProjectDot);
    updateProjectDot();

    const actions = footer.createDiv({ cls: "belki-composer-actions" });
    const cancelButton = actions.createEl("button", {
      cls: "belki-button",
      text: "Cancel",
      attr: {
        type: "button"
      }
    });
    const addButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Add task",
      attr: {
        type: "submit"
      }
    });

    cancelButton.addEventListener("click", options.onCancel);
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      addButton.setAttr("disabled", "true");
      void (async () => {
        try {
          await options.onSubmit({
            title: this.titleInput?.value || "",
            description: descriptionInput.value,
            due: selectedDue,
            deadline: selectedDeadline,
            project: this.readProject(),
            priority: prioritySelect.value as Priority,
            labels: dedupeLabels(selectedLabels),
            pendingAttachments
          });
        } finally {
          addButton.removeAttribute("disabled");
        }
      })();
    });

    updateDueButtons();
  }

  focus(): void {
    this.titleInput?.focus();
  }

  private readProject(): string {
    if (this.projectSelect?.value === "__new__") {
      return cleanProjectName(this.customProjectInput?.value || "Inbox");
    }

    return cleanProjectName(this.projectSelect?.value || "Inbox");
  }
}

function uniqueProjects(projects: string[]): string[] {
  return [...new Set(projects.map(cleanProjectName).filter(Boolean))];
}

function createChipButton(
  parent: HTMLElement,
  label: string,
  iconName: string,
  ariaLabel?: string
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "belki-chip-button",
    attr: {
      type: "button"
    }
  });

  if (ariaLabel) {
    button.setAttr("aria-label", ariaLabel);
  }
  if (!label) {
    button.addClass("is-icon-only");
  }

  createIcon(button, iconName);
  if (label) {
    button.createSpan({ cls: "belki-chip-label", text: label });
  }

  return button;
}

function createMenuItem(
  parent: HTMLElement,
  label: string,
  iconName: string
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "belki-menu-item",
    attr: { type: "button" }
  });
  createIcon(button, iconName, "belki-menu-icon");
  button.createSpan({ text: label });
  return button;
}

function createIcon(
  parent: HTMLElement,
  iconName: string,
  className = "belki-chip-icon"
): HTMLElement {
  const icon = parent.createSpan({ cls: className });
  setIcon(icon, iconName);
  return icon;
}

function cleanProjectName(value: string): string {
  const clean = value.trim().replace(/^>+\s*/, "");
  return clean || "Inbox";
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function todayIso(): string {
  return addDaysIso(0);
}

function addDaysIso(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
