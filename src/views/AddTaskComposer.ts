import { Platform, setIcon } from "obsidian";
import { CreateTaskInput, PRIORITIES, Priority } from "../types";
import { getLabelColor, getProjectColor } from "../colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { getPriorityColor, getPriorityLabel } from "../priority";
import { normalizeTaskProject, uniqueRealProjects } from "../projects";

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
  private customProjectInput?: HTMLInputElement;
  private selectedProjectValue = "";

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
        const selected = button.dataset.due === selectedDue;
        button.toggleClass("is-active", selected);
        button.toggleClass("is-selected", selected);
        button.setAttr("aria-pressed", String(selected));
      }
      const customSelected = Boolean(
        selectedDue && !dueButtons.some((button) => button.dataset.due === selectedDue)
      );
      customDateButton?.toggleClass("is-active", customSelected);
      customDateButton?.toggleClass("is-selected", customSelected);
      customDateButton?.setAttr("aria-pressed", String(customSelected));
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
      button.addClass("belki-date-chip");
      button.dataset.due = value;
      button.addEventListener("click", () => setDue(value));
      dueButtons.push(button);
      return button;
    };

    addDueButton("Today", todayIso(), "calendar");
    addDueButton("Tomorrow", addDaysIso(1), "calendar-plus");
    addDueButton("No Date", "", "calendar-x");

    customDateButton = createChipButton(chipRow, "Custom date", "calendar-clock");
    customDateButton.addClass("belki-date-chip");
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
    const mobilePanelSide = Platform.isMobile ? "above" : "below";
    const moreButton = createChipButton(moreWrap, "", "ellipsis", "More task options");
    moreButton.addClass("belki-more-button");
    const menu = moreWrap.createDiv({ cls: "belki-composer-menu is-hidden" });
    const labelsButton = createMenuItem(menu, "Labels", "tag");
    const deadlineButton = createMenuItem(menu, "Deadline", "diamond");

    const labelsPanel = moreWrap.createDiv({ cls: "belki-composer-popover is-hidden" });
    const selectedLabelsEl = labelsPanel.createDiv({ cls: "belki-selected-labels" });
    const labelInput = labelsPanel.createEl("input", {
      cls: "belki-label-input",
      attr: {
        type: "text",
        placeholder: "#label"
      }
    });
    const labelSuggestions = labelsPanel.createDiv({ cls: "belki-label-suggestions" });

    const deadlinePanel = moreWrap.createDiv({ cls: "belki-composer-popover is-hidden" });
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

    let detachOutsideListener = () => undefined;
    let closeProjectMenu = () => undefined;

    const clearOutsideListener = () => {
      detachOutsideListener();
      detachOutsideListener = () => undefined;
    };

    const closePanels = () => {
      labelsPanel.addClass("is-hidden");
      deadlinePanel.addClass("is-hidden");
    };

    const closeMenu = () => {
      menu.addClass("is-hidden");
    };

    const closeComposerPopovers = () => {
      closeMenu();
      closePanels();
      closeProjectMenu();
      clearOutsideListener();
    };

    const watchLocalPopover = (
      wrapper: HTMLElement,
      popover: HTMLElement,
      options: LocalPopoverOptions = {}
    ) => {
      clearOutsideListener();
      alignLocalPopover(wrapper, popover, options);
      const ownerDocument = wrapper.ownerDocument;
      const handleOutsideClick = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          (wrapper.contains(event.target) || popover.contains(event.target))
        ) {
          return;
        }

        closeComposerPopovers();
      };

      ownerDocument.addEventListener("pointerdown", handleOutsideClick, true);
      detachOutsideListener = () => {
        ownerDocument.removeEventListener("pointerdown", handleOutsideClick, true);
      };
    };

    const keepLabelInputVisible = () => {
      const ownerWindow = labelInput.ownerDocument.defaultView || window;
      const scrollIntoView = () => {
        labelInput.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth"
        });
      };

      ownerWindow.setTimeout(scrollIntoView, 80);
      ownerWindow.setTimeout(scrollIntoView, 320);
      ownerWindow.setTimeout(scrollIntoView, 650);
    };

    moreButton.addEventListener("click", () => {
      const shouldOpen = menu.hasClass("is-hidden");
      closeComposerPopovers();
      if (shouldOpen) {
        menu.removeClass("is-hidden");
        watchLocalPopover(moreWrap, menu, { preferredSide: "below" });
      }
    });
    labelsButton.addEventListener("click", () => {
      const shouldOpen = labelsPanel.hasClass("is-hidden");
      closeComposerPopovers();
      if (shouldOpen) {
        labelsPanel.removeClass("is-hidden");
        watchLocalPopover(moreWrap, labelsPanel, { preferredSide: mobilePanelSide });
        labelInput.focus();
        keepLabelInputVisible();
      }
    });
    deadlineButton.addEventListener("click", () => {
      const shouldOpen = deadlinePanel.hasClass("is-hidden");
      closeComposerPopovers();
      if (shouldOpen) {
        deadlinePanel.removeClass("is-hidden");
        watchLocalPopover(moreWrap, deadlinePanel, { preferredSide: mobilePanelSide });
        deadlineInput.focus();
      }
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
      keepLabelInputVisible();
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
        closeComposerPopovers();
      }
    });
    renderLabels();

    const footer = form.createDiv({ cls: "belki-composer-footer" });
    const projectArea = footer.createDiv({ cls: "belki-composer-project" });

    const projectPicker = projectArea.createEl("button", {
      cls: "belki-project-picker belki-location-picker",
      attr: {
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": "false"
      }
    });
    const projectDot = projectPicker.createSpan({ cls: "belki-project-dot belki-composer-project-dot" });
    const projectLabel = projectPicker.createSpan({ cls: "belki-project-trigger-label" });
    const projectMenu = projectArea.createDiv({
      cls: "belki-project-menu is-hidden",
      attr: {
        role: "listbox"
      }
    });
    const projects = uniqueRealProjects([options.defaultProject, ...options.projects]);
    const defaultProject = normalizeTaskProject(options.defaultProject) || "";
    this.selectedProjectValue = projects.includes(defaultProject)
      ? defaultProject
      : "";

    this.customProjectInput = projectArea.createEl("input", {
      cls: "belki-chip-input belki-custom-project is-hidden",
      attr: {
        type: "text",
        placeholder: "Project name"
      }
    });

    closeProjectMenu = () => {
      projectMenu.addClass("is-hidden");
      projectPicker.setAttr("aria-expanded", "false");
    };

    const openProjectMenu = () => {
      projectMenu.removeClass("is-hidden");
      projectPicker.setAttr("aria-expanded", "true");
      watchLocalPopover(projectArea, projectMenu, { preferredSide: "above" });
    };

    const selectProject = (value: string) => {
      this.selectedProjectValue = value;
      this.customProjectInput?.toggleClass("is-hidden", value !== "__new__");
      if (value === "__new__") {
        closeProjectMenu();
        clearOutsideListener();
        this.customProjectInput?.focus();
      } else {
        closeProjectMenu();
        clearOutsideListener();
      }
      updateProjectDot();
      renderProjectMenu();
    };

    const renderProjectOption = (
      parent: HTMLElement,
      label: string,
      value: string,
      projectColor?: { regular: string; light: string }
    ) => {
      const option = parent.createEl("button", {
        cls: "belki-project-option",
        attr: {
          type: "button",
          role: "option",
          "aria-selected": String(this.selectedProjectValue === value)
        }
      });
      option.toggleClass("is-selected", this.selectedProjectValue === value);
      option.toggleClass("has-project", Boolean(projectColor));
      option.createSpan({
        cls: "belki-project-option-check",
        text: this.selectedProjectValue === value ? "✓" : ""
      });
      if (projectColor) {
        option
          .createSpan({ cls: "belki-project-dot" })
          .setCssStyles({ backgroundColor: projectColor.regular });
      }
      option.createSpan({ cls: "belki-project-option-label", text: label });
      option.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectProject(value);
      });
    };

    const renderProjectMenu = () => {
      projectMenu.empty();
      renderProjectOption(projectMenu, "Inbox", "");
      projectMenu.createDiv({ cls: "belki-project-section-label", text: "Projects" });

      for (const project of projects) {
        renderProjectOption(
          projectMenu,
          project,
          project,
          getProjectColor(project, options.projectColors)
        );
      }

      renderProjectOption(projectMenu, "New project...", "__new__");
    };

    const updateProjectDot = () => {
      const project = this.readProject();
      projectLabel.setText(project || "Inbox");
      if (!project) {
        projectDot.setCssStyles({ backgroundColor: "var(--belki-faint)" });
        projectPicker.setCssStyles({
          backgroundColor: "var(--belki-hover)",
          borderColor: "var(--belki-border)"
        });
        return;
      }

      const color = getProjectColor(project, options.projectColors);
      projectDot.setCssStyles({ backgroundColor: color.regular });
      projectPicker.setCssStyles({
        backgroundColor: color.light,
        borderColor: color.light
      });
    };

    const hasOpenComposerPopover = () =>
      !menu.hasClass("is-hidden") ||
      !labelsPanel.hasClass("is-hidden") ||
      !deadlinePanel.hasClass("is-hidden") ||
      !projectMenu.hasClass("is-hidden");

    projectPicker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = projectMenu.hasClass("is-hidden");
      closeComposerPopovers();
      if (shouldOpen) {
        openProjectMenu();
      }
    });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && hasOpenComposerPopover()) {
        event.preventDefault();
        event.stopPropagation();
        closeComposerPopovers();
      }
    });
    this.customProjectInput.addEventListener("input", () => {
      updateProjectDot();
      renderProjectMenu();
    });
    renderProjectMenu();
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

  private readProject(): string | undefined {
    if (this.selectedProjectValue === "__new__") {
      return normalizeTaskProject(this.customProjectInput?.value);
    }

    return normalizeTaskProject(this.selectedProjectValue);
  }
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

interface LocalPopoverOptions {
  preferredSide?: "above" | "below";
}

function alignLocalPopover(
  wrapper: HTMLElement,
  popover: HTMLElement,
  options: LocalPopoverOptions = {}
): void {
  const ownerWindow = wrapper.ownerDocument.defaultView || window;
  const margin = 12;
  const preferredSide = options.preferredSide || "below";

  popover.removeClass("is-align-right");
  popover.removeClass("is-open-up");
  popover.removeClass("is-open-down");

  const wrapperRect = wrapper.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 240;
  const popoverHeight = popoverRect.height || 220;

  if (
    wrapperRect.left + popoverWidth > ownerWindow.innerWidth - margin &&
    wrapperRect.right - popoverWidth >= margin
  ) {
    popover.addClass("is-align-right");
  }

  const fitsBelow = wrapperRect.bottom + popoverHeight + margin <= ownerWindow.innerHeight;
  const fitsAbove = wrapperRect.top - popoverHeight - margin >= 0;
  if (preferredSide === "above" && fitsAbove) {
    popover.addClass("is-open-up");
    return;
  }
  if (preferredSide === "above" && !fitsBelow) {
    popover.addClass("is-open-up");
    return;
  }
  if (preferredSide === "below" && !fitsBelow && fitsAbove) {
    popover.addClass("is-open-up");
    return;
  }

  popover.addClass("is-open-down");
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
