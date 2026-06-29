import { App, Modal, Notice, Platform, TFile, setIcon } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../dateUtils";
import { getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../repeatUtils";
import { CustomRepeatModal } from "./CustomRepeatModal";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { applyBelkiFontSettings, BelkiSettings } from "../settings";
import { TaskStore } from "../taskStore";
import { BelkiTask, PRIORITIES, Priority } from "../types";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { getPriorityColor, getPriorityLabel } from "../priority";
import { normalizeTaskProject, uniqueRealProjects } from "../projects";
import { renderLinkedText } from "./TaskBoardView";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";

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
  private sideEl: HTMLElement | null = null;
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

    const isSubTask = Boolean(this.draft.parentId);
    const parentTask = isSubTask
      ? this.options.store.getTasks().find((t) => t.id === this.draft.parentId)
      : undefined;

    const mobileHeader = contentEl.createDiv({ cls: "belki-detail-mobile-header" });
    mobileHeader
      .createEl("button", {
        cls: "belki-detail-mobile-back",
        text: "←",
        attr: { type: "button", "aria-label": "Back to task list" }
      })
      .addEventListener("click", () => this.close());
    mobileHeader.createDiv({
      cls: "belki-detail-mobile-title",
      text: isSubTask ? "Sub-task" : "Task details"
    });

    const shell = contentEl.createDiv({ cls: "belki-detail-shell" });
    const main = shell.createDiv({ cls: "belki-detail-main" });
    const side = shell.createDiv({ cls: "belki-detail-side" });
    this.sideEl = side;

    const closeButton = shell.createEl("button", {
      cls: "belki-detail-close",
      text: "×",
      attr: { type: "button", "aria-label": "Close task details" }
    });
    closeButton.addEventListener("click", () => this.close());

    if (isSubTask && parentTask) {
      const contextBar = main.createDiv({ cls: "belki-subtask-context-bar" });
      contextBar.createSpan({ cls: "belki-subtask-context-arrow", text: "↳" });
      contextBar.createSpan({ cls: "belki-subtask-context-label", text: "Sub-task of " });
      const parentLink = contextBar.createEl("button", {
        cls: "belki-subtask-context-parent",
        text: `"${parentTask.title}"`,
        attr: { type: "button" }
      });
      parentLink.addEventListener("click", () => {
        this.close();
        new TaskDetailModal(this.app, {
          task: parentTask,
          projects: this.options.projects,
          labels: this.options.labels,
          settings: this.options.settings,
          store: this.options.store,
          onChange: this.options.onChange
        }).open();
      });
    }

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

    attachQuickAddAutocomplete(
      titleInput,
      () => this.options.labels,
      () => this.options.projects
    );

    titleInput.addEventListener("blur", () => {
      const parsed = parseQuickAddTokens(titleInput.value);
      if (parsed.labels.length > 0 || parsed.project) {
        this.draft.title = parsed.title || titleInput.value;
        titleInput.value = this.draft.title;
        if (parsed.labels.length > 0) {
          this.draft.labels = dedupeLabels([...this.draft.labels, ...parsed.labels]);
        }
        if (parsed.project && !this.draft.project) {
          this.draft.project = parsed.project;
        }
        if (this.sideEl) {
          this.sideEl.empty();
          this.renderSidePanel(this.sideEl);
        }
      }
    });

    const descRendered = main.createDiv({ cls: "belki-detail-description-rendered" });
    const refreshRendered = (): void => {
      descRendered.empty();
      if (this.draft.description) {
        renderLinkedText(this.draft.description, descRendered, this.app);
        descRendered.removeClass("is-empty");
      } else {
        descRendered.addClass("is-empty");
      }
    };
    refreshRendered();

    const descriptionInput = main.createEl("textarea", {
      cls: "belki-detail-description",
      attr: { placeholder: "Description" }
    });
    descriptionInput.value = this.draft.description || "";
    descriptionInput.style.display = "none";

    descRendered.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName === "A") return;
      descRendered.style.display = "none";
      descriptionInput.style.display = "";
      descriptionInput.focus();
    });

    descriptionInput.addEventListener("input", () => {
      this.draft.description = descriptionInput.value;
    });

    attachWikilinkAutocomplete(descriptionInput, this.app);

    descriptionInput.addEventListener("blur", () => {
      refreshRendered();
      descriptionInput.style.display = "none";
      descRendered.style.display = "";
    });

    this.renderSubTasks(main);
    this.renderAttachments(main);
    this.renderSidePanel(side);

    const footer = contentEl.createDiv({ cls: "belki-detail-footer" });
    footer
      .createEl("button", {
        cls: "belki-detail-delete",
        text: "Delete task",
        attr: { type: "button" }
      })
      .addEventListener("click", () => {
        void (async () => {
          await this.options.store.deleteTask(this.draft.id);
          this.options.onChange();
          this.close();
        })();
      });

    const footerActions = footer.createDiv({ cls: "belki-detail-actions" });

    if (this.draft.repeat && !this.draft.completed) {
      footerActions
        .createEl("button", {
          cls: "belki-button belki-button-danger",
          text: "Complete permanently",
          attr: { type: "button" }
        })
        .addEventListener("click", () => {
          void (async () => {
            await this.options.store.updateTask(this.draft.id, {
              repeat: undefined,
              completedOccurrences: this.draft.completedOccurrences,
              completed: true,
              completedDate: todayIso()
            });
            this.options.onChange();
            this.close();
          })();
        });
    }

    footerActions
      .createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } })
      .addEventListener("click", () => this.close());
    footerActions
      .createEl("button", {
        cls: "belki-button belki-button-primary",
        text: "Save",
        attr: { type: "button" }
      })
      .addEventListener("click", () => {
        void this.save();
      });

    if (!Platform.isMobile) {
      titleInput.focus();
    }
  }

  onClose(): void {
    this.modalEl.removeEventListener("keydown", this.handleEscape, true);
  }

  private renderSidePanel(parent: HTMLElement): void {
    const isSubTask = Boolean(this.draft.parentId);
    const parentTask = isSubTask
      ? this.options.store.getTasks().find((t) => t.id === this.draft.parentId)
      : undefined;

    parent.createEl("h3", { text: isSubTask ? "Sub-task details" : "Task details" });

    if (isSubTask && parentTask) {
      const field = this.createField(parent, "Parent");
      const parentBtn = field.createEl("button", {
        cls: "belki-subtask-parent-field",
        text: parentTask.title,
        attr: { type: "button" }
      });
      parentBtn.addEventListener("click", () => {
        this.close();
        new TaskDetailModal(this.app, {
          task: parentTask,
          projects: this.options.projects,
          labels: this.options.labels,
          settings: this.options.settings,
          store: this.options.store,
          onChange: this.options.onChange
        }).open();
      });
    }

    this.renderProject(parent);
    this.renderDueDatePicker(parent);
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
        downloadButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.downloadAttachment(path);
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
    fileInput.addEventListener("change", () => {
      void (async () => {
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
      })();
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
      downloadButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.downloadAttachment(path);
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
      const link = activeDocument.createElement("a");
      link.href = url;
      link.download = file.name;
      activeDocument.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      await this.app.workspace.openLinkText(path, "", false);
    }
  }

  private renderSubTasks(parent: HTMLElement): void {
    const allTasks = this.options.store.getTasks();
    const subTasks = allTasks.filter((t) => t.parentId === this.draft.id);
    const doneCount = subTasks.filter((t) => t.completed).length;

    const section = parent.createDiv({ cls: "belki-subtasks-section" });
    const header = section.createDiv({ cls: "belki-attachments-header" });
    const titleEl = header.createEl("h3", { cls: "belki-subtasks-title" });
    titleEl.createSpan({ text: "Sub-tasks" });
    const countEl = titleEl.createSpan({
      cls: "belki-subtasks-count",
      text: subTasks.length > 0 ? ` ${doneCount}/${subTasks.length}` : ""
    });

    const list = section.createDiv({ cls: "belki-subtasks-list" });

    const renderList = () => {
      list.empty();
      const all = this.options.store.getTasks().filter((t) => t.parentId === this.draft.id);
      const current = [...all.filter((t) => !t.completed), ...all.filter((t) => t.completed)];
      current.forEach((sub) => {
        const row = list.createDiv({ cls: "belki-subtask-row" });
        const checkbox = row.createEl("button", {
          cls: "belki-task-checkbox belki-subtask-checkbox",
          attr: { type: "button" }
        });
        checkbox.toggleClass("is-checked", sub.completed);
        checkbox.addEventListener("click", () => {
          void this.options.store.toggleComplete(sub.id).then(() => {
            renderList();
            const updated = this.options.store.getTasks().filter((t) => t.parentId === this.draft.id);
            const done = updated.filter((t) => t.completed).length;
            countEl.setText(updated.length > 0 ? ` ${done}/${updated.length}` : "");
          });
        });

        const info = row.createDiv({ cls: "belki-subtask-info" });

        const titleLine = info.createDiv({ cls: "belki-subtask-title-line" });
        const titleEl2 = titleLine.createSpan({ cls: `belki-subtask-title${sub.completed ? " is-completed" : ""}`, text: sub.title });
        titleEl2.addEventListener("click", () => {
          new TaskDetailModal(this.app, {
            task: sub,
            projects: this.options.projects,
            labels: this.options.labels,
            settings: this.options.settings,
            store: this.options.store,
            onChange: () => { renderList(); this.options.onChange(); }
          }).open();
        });

        const deleteBtn = titleLine.createSpan({
          cls: "belki-subtask-delete",
          text: "×",
          attr: { role: "button", tabindex: "0", "aria-label": "Delete sub-task" }
        });
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.options.store.deleteTask(sub.id).then(() => {
            renderList();
            updateHeader();
            this.options.onChange();
          });
        });

        const meta = info.createDiv({ cls: "belki-subtask-meta" });
        if (sub.due) {
          meta.createSpan({ cls: "belki-subtask-due", text: formatDueDateChip(sub.due) });
        }
        if (sub.priority && sub.priority !== "none") {
          const pc = getPriorityColor(sub.priority);
          const badge = meta.createSpan({ cls: "belki-subtask-priority", text: getPriorityLabel(sub.priority) });
          badge.style.color = pc.color;
        }
      });
    };

    renderList();

    const addRow = section.createDiv({ cls: "belki-subtask-add-row" });

    const updateHeader = () => {
      const current = this.options.store.getTasks().filter((t) => t.parentId === this.draft.id);
      const done = current.filter((t) => t.completed).length;
      countEl.setText(current.length > 0 ? ` ${done}/${current.length}` : "");
    };

    const showComposer = () => {
      addRow.empty();

      let composerDue = "";
      let composerPriority: Priority = "none";
      type ExpandedPanel = "date" | "priority" | null;
      let expandedPanel: ExpandedPanel = null;

      const input = addRow.createEl("input", {
        cls: "belki-subtask-input",
        attr: { type: "text", placeholder: "Sub-task title" }
      });

      // ── chips row ─────────────────────────────────────────────
      const chipsRow = addRow.createDiv({ cls: "belki-subtask-chips" });

      // inline expand panel (shared, shown below chips row)
      const expandPanel = addRow.createDiv({ cls: "belki-subtask-expand-panel is-hidden" });

      const closePanel = () => {
        expandPanel.addClass("is-hidden");
        expandPanel.empty();
        expandedPanel = null;
        renderChips();
      };

      const openDatePanel = () => {
        expandedPanel = "date";
        expandPanel.empty();
        expandPanel.removeClass("is-hidden");

        const presets: [string, string][] = [
          ["Today", todayIso()],
          ["Tomorrow", addDaysIso(1)],
          ["Next week", addDaysIso(7)],
          ["Weekend", nextWeekdayIso(6)]
        ];
        for (const [label, value] of presets) {
          const btn = expandPanel.createEl("button", {
            cls: "belki-subtask-preset" + (value === composerDue ? " is-active" : ""),
            text: label,
            attr: { type: "button" }
          });
          btn.addEventListener("click", () => { composerDue = composerDue === value ? "" : value; closePanel(); });
        }

        // native date input as compact last option
        const customInput = expandPanel.createEl("input", {
          cls: "belki-subtask-preset-date",
          attr: { type: "date", title: "Custom date" }
        });
        if (composerDue) customInput.value = composerDue;
        customInput.addEventListener("change", () => { if (customInput.value) { composerDue = customInput.value; closePanel(); } });
      };

      const openPriorityPanel = () => {
        expandedPanel = "priority";
        expandPanel.empty();
        expandPanel.removeClass("is-hidden");

        for (const p of PRIORITIES) {
          const btn = expandPanel.createEl("button", {
            cls: "belki-subtask-preset" + (p === composerPriority ? " is-active" : ""),
            text: getPriorityLabel(p),
            attr: { type: "button" }
          });
          if (p !== "none") btn.style.color = getPriorityColor(p).color;
          btn.addEventListener("click", () => { composerPriority = p; closePanel(); });
        }
      };

      // ── render chip row ────────────────────────────────────────
      const renderChips = () => {
        chipsRow.empty();

        // date chip
        const dateChip = chipsRow.createEl("button", {
          cls: "belki-subtask-chip" + (composerDue ? " is-active" : "") + (expandedPanel === "date" ? " is-open" : ""),
          attr: { type: "button" }
        });
        const calIcon = dateChip.createSpan({ cls: "belki-chip-icon" });
        setIcon(calIcon, "calendar");
        dateChip.createSpan({ text: composerDue ? formatDueDateChip(composerDue) : "Date" });
        if (composerDue) {
          const clr = dateChip.createSpan({ cls: "belki-subtask-chip-clear", text: "×" });
          clr.addEventListener("click", (e) => { e.stopPropagation(); composerDue = ""; closePanel(); renderChips(); });
        }
        dateChip.addEventListener("click", () => {
          if (expandedPanel === "date") { closePanel(); } else { openDatePanel(); renderChips(); }
        });

        // priority chip
        const priChip = chipsRow.createEl("button", {
          cls: "belki-subtask-chip" + (composerPriority !== "none" ? " is-active" : "") + (expandedPanel === "priority" ? " is-open" : ""),
          attr: { type: "button" }
        });
        if (composerPriority !== "none") priChip.style.color = getPriorityColor(composerPriority).color;
        const flagIcon = priChip.createSpan({ cls: "belki-chip-icon" });
        setIcon(flagIcon, "flag");
        priChip.createSpan({ text: composerPriority !== "none" ? getPriorityLabel(composerPriority) : "Priority" });
        priChip.addEventListener("click", () => {
          if (expandedPanel === "priority") { closePanel(); } else { openPriorityPanel(); renderChips(); }
        });
      };

      renderChips();

      // ── Action buttons ─────────────────────────────────────────
      const btnRow = addRow.createDiv({ cls: "belki-subtask-btn-row" });
      const addBtn = btnRow.createEl("button", {
        cls: "belki-button belki-button-primary",
        text: "Add task",
        attr: { type: "button" }
      });
      const cancelBtn = btnRow.createEl("button", {
        cls: "belki-button",
        text: "Cancel",
        attr: { type: "button" }
      });

      const submit = () => {
        const title = input.value.trim();
        if (!title) return;
        void this.options.store.createTask({
          title,
          project: this.draft.project,
          parentId: this.draft.id,
          due: composerDue || undefined,
          priority: composerPriority
        }).then(() => {
          renderList();
          updateHeader();
          input.value = "";
          composerDue = "";
          composerPriority = "none";
          expandedPanel = null;
          expandPanel.addClass("is-hidden");
          expandPanel.empty();
          renderChips();
          input.focus();
        });
      };

      addBtn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
        if (e.key === "Escape") { e.preventDefault(); showAddButton(); }
      });
      cancelBtn.addEventListener("click", showAddButton);
      input.focus();
    };

    const showAddButton = () => {
      addRow.empty();
      const btn = addRow.createEl("button", {
        cls: "belki-subtask-add-btn",
        attr: { type: "button" }
      });
      btn.createSpan({ text: "+ Add sub-task" });
      btn.addEventListener("click", showComposer);
    };

    showAddButton();
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
      uniqueRealProjects([
        this.options.settings.defaultProject,
        ...this.options.projects,
        ...Object.keys(this.options.settings.projectColors),
        this.draft.project
      ]);

    const renderOptions = () => {
      select.empty();
      select.createEl("option", { text: "No project", value: "" });
      for (const project of getProjects()) {
        select.createEl("option", { text: project, value: project });
      }

      select.createEl("option", { text: "Create project...", value: createValue });
      select.value = normalizeTaskProject(this.draft.project) || "";
    };

    const updateProjectStyle = () => {
      const project = normalizeTaskProject(this.draft.project);
      if (!project) {
        projectDot.setCssStyles({ backgroundColor: "var(--belki-faint)" });
        projectPicker.setCssStyles({
          backgroundColor: "var(--belki-hover)",
          borderColor: "var(--belki-border)"
        });
        return;
      }

      const color = getProjectColor(project, this.options.settings.projectColors);
      projectDot.setCssStyles({ backgroundColor: color.regular });
      projectPicker.setCssStyles({
        backgroundColor: color.light,
        borderColor: color.light
      });
    };

    const hideCreateRow = () => {
      createInput.value = "";
      createRow.addClass("is-hidden");
      select.value = normalizeTaskProject(this.draft.project) || "";
    };

    const createProject = () => {
      const project = normalizeTaskProject(createInput.value);
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
        select.value = normalizeTaskProject(this.draft.project) || "";
        createInput.focus();
        return;
      }

      this.draft.project = normalizeTaskProject(select.value);
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

  private renderDueDatePicker(parent: HTMLElement): void {
    const field = this.createField(parent, "Date");
    const wrap = field.createDiv({ cls: "belki-date-picker-wrap belki-date-picker-inline" });

    let detachOutside: (() => void) | undefined;

    const closePopover = () => {
      wrap.querySelector(".belki-date-popover-inline")?.addClass("is-hidden");
      detachOutside?.();
      detachOutside = undefined;
    };

    const renderPicker = () => {
      wrap.empty();
      const hasDate = Boolean(this.draft.due);

      const btnRow = wrap.createDiv({ cls: "belki-date-btn-row" });
      const btn = btnRow.createEl("button", {
        cls: `belki-detail-date-btn${hasDate ? " is-active" : ""}`,
        attr: { type: "button" }
      });
      const iconSpan = btn.createSpan({ cls: "belki-chip-icon" });
      setIcon(iconSpan, "calendar");
      btn.createSpan({ text: formatDueDateChip(this.draft.due) });

      if (hasDate) {
        const clearBtn = btnRow.createEl("button", {
          cls: "belki-date-chip-clear",
          attr: { type: "button", "aria-label": "Clear date" }
        });
        clearBtn.setText("×");
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this.draft.repeat) new Notice("Date and repeat rule removed.");
          this.draft.due = undefined;
          this.draft.repeat = undefined;
          closePopover();
          renderPicker();
        });
      }

      const popover = wrap.createDiv({ cls: "belki-date-popover belki-date-popover-inline is-hidden" });

      const selectDate = (value: string) => {
        this.draft.due = value || undefined;
        closePopover();
        renderPicker();
      };

      const addPreset = (label: string, value: string) => {
        const presetBtn = popover.createEl("button", {
          cls: "belki-date-preset",
          text: label,
          attr: { type: "button" }
        });
        presetBtn.toggleClass("is-active", value === this.draft.due);
        presetBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectDate(value);
        });
      };

      addPreset("Today", todayIso());
      addPreset("Tomorrow", addDaysIso(1));
      addPreset("Next week", addDaysIso(7));
      addPreset("Next weekend", nextWeekdayIso(6));

      const customInput = popover.createEl("input", {
        cls: "belki-date-custom-input",
        attr: { type: "date" }
      });
      if (this.draft.due) customInput.value = this.draft.due;
      customInput.addEventListener("change", () => {
        if (customInput.value) selectDate(customInput.value);
      });

      popover.createDiv({ cls: "belki-date-divider" });
      const repeatHeader = popover.createDiv({ cls: "belki-repeat-header" });
      const repeatIcon = repeatHeader.createSpan({ cls: "belki-chip-icon" });
      setIcon(repeatIcon, "repeat");
      repeatHeader.createSpan({ text: "Repeat" });

      const presetDue = this.draft.due || todayIso();
      const presets = getRepeatPresets(presetDue);
      for (const preset of presets) {
        const presetBtn = popover.createEl("button", {
          cls: "belki-date-preset",
          attr: { type: "button" }
        });
        const ri = presetBtn.createSpan({ cls: "belki-chip-icon" });
        setIcon(ri, "repeat");
        presetBtn.createSpan({ text: preset.label });
        presetBtn.toggleClass("is-active", repeatRulesEqual(preset.rule, this.draft.repeat));
        presetBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!this.draft.due) this.draft.due = todayIso();
          this.draft.repeat = repeatRulesEqual(preset.rule, this.draft.repeat) ? undefined : preset.rule;
          closePopover();
          renderPicker();
        });
      }
      const customRepeatBtn = popover.createEl("button", {
        cls: "belki-date-preset",
        text: "Custom...",
        attr: { type: "button" }
      });
      customRepeatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this.draft.due) this.draft.due = todayIso();
        closePopover();
        new CustomRepeatModal(this.app, this.draft.repeat, (rule) => {
          this.draft.repeat = rule;
          renderPicker();
        }).open();
      });

      btn.addEventListener("click", () => {
        const isHidden = popover.hasClass("is-hidden");
        closePopover();
        if (isHidden) {
          popover.removeClass("is-hidden");
          const onOutside = (e: MouseEvent) => {
            if (!wrap.contains(e.target as Node)) {
              closePopover();
            }
          };
          document.addEventListener("click", onOutside, { capture: true });
          detachOutside = () => document.removeEventListener("click", onOutside, { capture: true });
        }
      });

      if (this.draft.repeat) {
        const repeatRow = wrap.createDiv({ cls: "belki-date-btn-row belki-detail-repeat-row" });
        const repeatChip = repeatRow.createEl("button", {
          cls: "belki-detail-date-btn is-active belki-repeat-active-btn",
          attr: { type: "button" }
        });
        const ri = repeatChip.createSpan({ cls: "belki-chip-icon" });
        setIcon(ri, "repeat");
        repeatChip.createSpan({ text: getRepeatLabel(this.draft.repeat) });
        repeatChip.addEventListener("click", (e) => {
          e.stopPropagation();
          btn.click();
        });
        const clearRepeat = repeatRow.createEl("button", {
          cls: "belki-date-chip-clear",
          text: "×",
          attr: { type: "button", "aria-label": "Clear repeat" }
        });
        clearRepeat.addEventListener("click", (e) => {
          e.stopPropagation();
          this.draft.repeat = undefined;
          renderPicker();
        });
      }
    };

    renderPicker();
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
      priorityWrap.setCssProps({
        "--belki-priority-text": color.color,
        "--belki-priority-bg": color.light,
        "--belki-priority-border": color.color
      });
      indicator.setCssStyles({ backgroundColor: color.color });
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
        chip.setCssStyles({
          backgroundColor: color.light,
          borderColor: color.light
        });
        chip
          .createSpan({ cls: "belki-label-dot" })
          .setCssStyles({ backgroundColor: color.regular });
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
      window.setTimeout(() => {
        input.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest"
        });
      }, 250);
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
      attachments: [...this.draft.attachments],
      repeat: this.draft.repeat,
      completedOccurrences: this.draft.completedOccurrences
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
