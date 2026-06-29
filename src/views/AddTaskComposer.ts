import { App, Notice, Platform, setIcon } from "obsidian";
import { CreateTaskInput, PRIORITIES, Priority, RepeatRule } from "../types";
import { getLabelColor, getProjectColor } from "../colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { getPriorityColor, getPriorityLabel } from "../priority";
import { normalizeTaskProject, uniqueRealProjects } from "../projects";
import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../dateUtils";
import { getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../repeatUtils";
import { CustomRepeatModal } from "./CustomRepeatModal";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";

interface ComposerOptions {
  app: App;
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

  render(parent: HTMLElement, options: ComposerOptions): () => void {
    const form = parent.createEl("form", { cls: "belki-composer" });
    let selectedDue = options.defaultDue || "";
    let selectedRepeat: RepeatRule | undefined;
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

    const closeWikilinkDropdown = attachWikilinkAutocomplete(descriptionInput, options.app);
    attachQuickAddAutocomplete(
      this.titleInput,
      () => options.labels,
      () => options.projects
    );

    const chipRow = form.createDiv({ cls: "belki-composer-chip-row" });
    const dueDateWrap = chipRow.createDiv({ cls: "belki-date-picker-wrap" });
    const repeatChipWrap = chipRow.createDiv({ cls: "belki-repeat-chip-wrap" });

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
    let closeDueDatePopover: () => void = () => undefined;

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
      closeDueDatePopover();
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
    const projectMenu = createEl("div", {
      cls: "belki-project-menu",
      attr: {
        role: "listbox"
      }
    });
    const projects = uniqueRealProjects([options.defaultProject, ...options.projects]);
    const defaultProject = normalizeTaskProject(options.defaultProject) || "";
    this.selectedProjectValue = projects.includes(defaultProject)
      ? defaultProject
      : "";

    const customProjectWrap = projectArea.createDiv({ cls: "belki-custom-project-wrap is-hidden" });
    this.customProjectInput = customProjectWrap.createEl("input", {
      cls: "belki-chip-input belki-custom-project",
      attr: {
        type: "text",
        placeholder: "Project name"
      }
    });
    const confirmProjectBtn = customProjectWrap.createEl("button", {
      cls: "belki-custom-project-confirm",
      attr: { type: "button", "aria-label": "Confirm project" }
    });
    setIcon(confirmProjectBtn, "check");

    const cancelProjectBtn = customProjectWrap.createEl("button", {
      cls: "belki-custom-project-cancel",
      attr: { type: "button", "aria-label": "Cancel" }
    });
    setIcon(cancelProjectBtn, "x");

    let previousProjectValue = "";

    const confirmProject = () => {
      const name = this.customProjectInput?.value.trim() || "";
      if (!name) return;
      this.selectedProjectValue = name;
      updateProjectDot();
      renderProjectMenu();
      customProjectWrap.addClass("is-hidden");
    };

    const cancelProject = () => {
      this.selectedProjectValue = previousProjectValue;
      this.customProjectInput!.value = "";
      customProjectWrap.addClass("is-hidden");
      updateProjectDot();
      renderProjectMenu();
    };

    confirmProjectBtn.addEventListener("click", confirmProject);
    cancelProjectBtn.addEventListener("click", cancelProject);
    this.customProjectInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmProject(); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelProject(); }
    });

    closeProjectMenu = () => {
      projectMenu.remove();
      projectPicker.setAttr("aria-expanded", "false");
      projectPicker.focus({ preventScroll: true });
    };

    const openProjectMenu = () => {
      document.body.appendChild(projectMenu);
      projectPicker.setAttr("aria-expanded", "true");
      watchLocalPopover(projectArea, projectMenu, { preferredSide: "above", useFixed: true });
    };

    const selectProject = (value: string) => {
      if (value === "__new__") {
        previousProjectValue = this.selectedProjectValue;
      }
      this.selectedProjectValue = value;
      if (value === "__new__") {
        customProjectWrap.removeClass("is-hidden");
        this.customProjectInput!.value = "";
        closeProjectMenu();
        clearOutsideListener();
        this.customProjectInput?.focus();
      } else {
        customProjectWrap.addClass("is-hidden");
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
      const displayValue = this.selectedProjectValue === "__new__" ? previousProjectValue : this.selectedProjectValue;
      const project = normalizeTaskProject(displayValue) || "";
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
      projectMenu.isConnected ||
      Boolean(dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)"));

    projectPicker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = !projectMenu.isConnected;
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

    const cleanup = () => { projectMenu.remove(); closeWikilinkDropdown(); };
    cancelButton.addEventListener("click", () => { cleanup(); options.onCancel(); });
    form.addEventListener("submit", () => cleanup());
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      addButton.setAttr("disabled", "true");
      void (async () => {
        try {
          const rawTitle = this.titleInput?.value || "";
          const parsed = parseQuickAddTokens(rawTitle);
          const explicitProject = this.readProject();
          await options.onSubmit({
            title: parsed.title || rawTitle,
            description: descriptionInput.value,
            due: selectedDue,
            deadline: selectedDeadline,
            project: explicitProject || parsed.project || "",
            priority: prioritySelect.value as Priority,
            labels: dedupeLabels([...selectedLabels, ...parsed.labels]),
            pendingAttachments,
            repeat: selectedRepeat
          });
        } finally {
          addButton.removeAttribute("disabled");
        }
      })();
    });

    const renderDueDateButton = () => {
      dueDateWrap.empty();
      const hasDate = Boolean(selectedDue);
      const dueDateButton = dueDateWrap.createEl("button", {
        cls: `belki-chip-button belki-date-chip${hasDate ? " is-active is-selected" : ""}`,
        attr: { type: "button", "aria-label": "Set due date" }
      });
      const iconSpan = dueDateButton.createSpan({ cls: "belki-chip-icon" });
      setIcon(iconSpan, "calendar");
      dueDateButton.createSpan({ cls: "belki-chip-label", text: formatDueDateChip(selectedDue) });

      if (hasDate) {
        const clearBtn = dueDateWrap.createEl("button", {
          cls: "belki-date-chip-clear",
          text: "×",
          attr: { type: "button", "aria-label": "Clear due date" }
        });
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selectedRepeat) new Notice("Date and repeat rule removed.");
          selectedDue = "";
          selectedRepeat = undefined;
          closeDueDatePopover();
          renderDueDateButton();
          renderRepeatChip();
        });
      }

      const datePopover = dueDateWrap.createDiv({ cls: "belki-composer-popover belki-date-popover is-hidden" });
      closeDueDatePopover = () => datePopover.addClass("is-hidden");

      const selectDate = (value: string) => {
        selectedDue = value;
        closeDueDatePopover();
        clearOutsideListener();
        renderDueDateButton();
        renderRepeatChip();
      };

      const addPreset = (label: string, value: string) => {
        const btn = datePopover.createEl("button", {
          cls: "belki-date-preset",
          text: label,
          attr: { type: "button" }
        });
        btn.toggleClass("is-active", value === selectedDue);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectDate(value);
        });
      };

      addPreset("Today", todayIso());
      addPreset("Tomorrow", addDaysIso(1));
      addPreset("Next week", addDaysIso(7));
      addPreset("Next weekend", nextWeekdayIso(6));

      const customInput = datePopover.createEl("input", {
        cls: "belki-date-custom-input",
        attr: { type: "date" }
      });
      if (selectedDue) customInput.value = selectedDue;
      customInput.addEventListener("change", () => {
        if (customInput.value) selectDate(customInput.value);
      });

      datePopover.createDiv({ cls: "belki-date-divider" });
      const repeatHeader = datePopover.createDiv({ cls: "belki-repeat-header" });
      const repeatIcon = repeatHeader.createSpan({ cls: "belki-chip-icon" });
      setIcon(repeatIcon, "repeat");
      repeatHeader.createSpan({ text: "Repeat" });

      const presetDue = selectedDue || todayIso();
      const presets = getRepeatPresets(presetDue);
      for (const preset of presets) {
        const btn = datePopover.createEl("button", {
          cls: "belki-date-preset",
          attr: { type: "button" }
        });
        const ri = btn.createSpan({ cls: "belki-chip-icon" });
        setIcon(ri, "repeat");
        btn.createSpan({ text: preset.label });
        btn.toggleClass("is-active", repeatRulesEqual(preset.rule, selectedRepeat));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!selectedDue) selectedDue = todayIso();
          selectedRepeat = repeatRulesEqual(preset.rule, selectedRepeat) ? undefined : preset.rule;
          closeDueDatePopover();
          clearOutsideListener();
          renderDueDateButton();
          renderRepeatChip();
        });
      }
      const customRepeatBtn = datePopover.createEl("button", {
        cls: "belki-date-preset",
        text: "Custom...",
        attr: { type: "button" }
      });
      customRepeatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!selectedDue) selectedDue = todayIso();
        closeDueDatePopover();
        clearOutsideListener();
        new CustomRepeatModal(options.app, selectedRepeat, (rule) => {
          selectedRepeat = rule;
          renderDueDateButton();
          renderRepeatChip();
        }).open();
      });

      dueDateButton.addEventListener("click", () => {
        const shouldOpen = datePopover.hasClass("is-hidden");
        closeComposerPopovers();
        if (shouldOpen) {
          datePopover.removeClass("is-hidden");
          watchLocalPopover(dueDateWrap, datePopover, { preferredSide: mobilePanelSide });
        }
      });
    };

    const renderRepeatChip = () => {
      repeatChipWrap.empty();
      if (!selectedRepeat) return;
      const chip = repeatChipWrap.createEl("button", {
        cls: "belki-chip-button belki-repeat-chip is-active is-selected",
        attr: { type: "button" }
      });
      const ri = chip.createSpan({ cls: "belki-chip-icon" });
      setIcon(ri, "repeat");
      chip.createSpan({ cls: "belki-chip-label", text: getRepeatLabel(selectedRepeat) });
      chip.addEventListener("click", () => {
        const shouldOpen = dueDateWrap.querySelector(".belki-date-popover:not(.is-hidden)") === null;
        closeComposerPopovers();
        if (shouldOpen) {
          const popover = dueDateWrap.querySelector(".belki-date-popover") as HTMLElement | null;
          popover?.removeClass("is-hidden");
          if (popover) watchLocalPopover(dueDateWrap, popover, { preferredSide: mobilePanelSide });
        }
      });
      const clearRepeat = repeatChipWrap.createEl("button", {
        cls: "belki-date-chip-clear",
        text: "×",
        attr: { type: "button", "aria-label": "Clear repeat" }
      });
      clearRepeat.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedRepeat = undefined;
        renderRepeatChip();
        renderDueDateButton();
      });
    };

    renderDueDateButton();
    renderRepeatChip();
    return cleanup;
  }

  focus(): void {
    this.titleInput?.focus();
  }

  private readProject(): string | undefined {
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
  useFixed?: boolean;
}

function alignLocalPopover(
  wrapper: HTMLElement,
  popover: HTMLElement,
  options: LocalPopoverOptions = {}
): void {
  const margin = 12;
  const preferredSide = options.preferredSide || "below";

  popover.removeClass("is-align-right");
  popover.removeClass("is-open-up");
  popover.removeClass("is-open-down");

  const wrapperRect = wrapper.getBoundingClientRect();

  if (options.useFixed) {
    // Fixed positioning — use viewport coordinates so containers with
    // overflow:hidden or transforms cannot clip the popover.
    popover.style.removeProperty("top");
    popover.style.removeProperty("bottom");
    popover.style.removeProperty("left");
    popover.style.removeProperty("right");

    const popoverWidth = popover.offsetWidth || 240;
    const popoverHeight = popover.offsetHeight || 220;

    let left = wrapperRect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = wrapperRect.right - popoverWidth;
    }
    popover.style.left = `${Math.max(margin, left)}px`;

    const fitsBelow = wrapperRect.bottom + popoverHeight + margin <= window.innerHeight;
    const fitsAbove = wrapperRect.top - popoverHeight - margin >= 0;
    if ((preferredSide === "above" && fitsAbove) || (preferredSide === "above" && !fitsBelow)) {
      popover.style.bottom = `${window.innerHeight - wrapperRect.top + 8}px`;
      popover.addClass("is-open-up");
    } else {
      popover.style.top = `${wrapperRect.bottom + 8}px`;
      popover.addClass("is-open-down");
    }
    return;
  }

  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 240;
  const popoverHeight = popoverRect.height || 220;
  const ownerWindow = wrapper.ownerDocument.defaultView || window;

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

