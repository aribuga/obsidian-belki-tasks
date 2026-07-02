import { App, Component, MarkdownRenderer, Modal, Notice, Platform, TFile, setIcon } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import { addDaysIso, formatDueDateChip, nextWeekdayIso, todayIso } from "../dateUtils";
import { getRepeatLabel, getRepeatPresets, repeatRulesEqual } from "../repeatUtils";
import { CustomRepeatModal } from "./CustomRepeatModal";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { applyBelkiFontSettings, BelkiSettings } from "../settings";
import { TaskStore } from "../taskStore";
import { BelkiTask, PRIORITIES, Priority } from "../types";
import { ImagePreviewModal } from "./ImagePreviewModal";
import {
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityDropdownLabel,
  hasVisiblePriority,
  isDefaultPriority
} from "../priority";
import { normalizeTaskProject, uniqueRealProjects } from "../projects";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";
import { createBelkiActionRow, createBelkiButton } from "../ui";

interface TaskDetailModalOptions {
  task: BelkiTask;
  projects: string[];
  labels: string[];
  settings: BelkiSettings;
  store: TaskStore;
  onChange: () => void;
  onProjectUsed?: (project: string) => void;
}

type DescriptionFormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "quote"
  | "inline-code"
  | "code-block"
  | "bullet-list"
  | "numbered-list"
  | "link";

const DESCRIPTION_FORMAT_ACTIONS: Array<{
  id: DescriptionFormatAction;
  label: string;
  title: string;
}> = [
  { id: "bold", label: "B", title: "Bold" },
  { id: "italic", label: "I", title: "Italic" },
  { id: "strike", label: "S", title: "Strikethrough" },
  { id: "quote", label: "“", title: "Quote" },
  { id: "inline-code", label: "`", title: "Inline code" },
  { id: "code-block", label: "{ }", title: "Code block" },
  { id: "bullet-list", label: "•", title: "Bullet list" },
  { id: "numbered-list", label: "1.", title: "Numbered list" },
  { id: "link", label: "↗", title: "Link" }
];

export class TaskDetailModal extends Modal {
  private draft: BelkiTask;
  private sideEl: HTMLElement | null = null;
  private closeWikilinkDropdown: (() => void) | null = null;
  private closeQuickAddDropdown: (() => void) | null = null;
  private closeDescriptionToolbar: (() => void) | null = null;
  private hideDescriptionToolbar: (() => void) | null = null;
  private descriptionToolbarVisible = false;
  private markdownRenderComponent: Component | null = null;
  private handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.descriptionToolbarVisible && this.hideDescriptionToolbar) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.hideDescriptionToolbar();
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
    this.modalEl.addClass("belki-modal-detail");
    this.containerEl.addClass("belki-modal-detail-container");
    this.markdownRenderComponent?.unload();
    this.markdownRenderComponent = new Component();
    this.markdownRenderComponent.load();
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

    this.closeQuickAddDropdown = attachQuickAddAutocomplete(
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

    const descRendered = main.createDiv({ cls: "belki-detail-description-rendered markdown-rendered" });
    let renderRequest = 0;
    const refreshRendered = async (): Promise<void> => {
      const request = ++renderRequest;
      const markdown = this.draft.description || "";
      descRendered.empty();
      if (!markdown.trim()) {
        descRendered.addClass("is-empty");
        return;
      }

      descRendered.removeClass("is-empty");
      const component = this.markdownRenderComponent;
      if (!component) {
        descRendered.setText(markdown);
        return;
      }

      const renderTarget = descRendered.createDiv({ cls: "belki-detail-description-content" });
      try {
        await MarkdownRenderer.render(
          this.app,
          markdown,
          renderTarget,
          this.draft.sourcePath || "",
          component
        );
      } catch (error) {
        renderTarget.remove();
        console.warn("belki: failed to render task description markdown", error);
        if (request === renderRequest) {
          descRendered.empty();
          descRendered.createEl("pre", {
            cls: "belki-detail-description-fallback",
            text: markdown
          });
        }
        return;
      }

      if (request !== renderRequest) {
        renderTarget.remove();
        return;
      }
    };
    void refreshRendered();

    const descriptionInput = main.createEl("textarea", {
      cls: "belki-detail-description",
      attr: { placeholder: "Description" }
    });
    descriptionInput.value = this.draft.description || "";
    descriptionInput.addClass("is-hidden");

    descRendered.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      descRendered.addClass("is-hidden");
      descriptionInput.removeClass("is-hidden");
      descriptionInput.focus();
    });

    descriptionInput.addEventListener("input", () => {
      this.draft.description = descriptionInput.value;
    });

    this.closeWikilinkDropdown = attachWikilinkAutocomplete(descriptionInput, this.app);
    this.closeDescriptionToolbar?.();
    this.closeDescriptionToolbar = this.attachDescriptionFormattingToolbar(descriptionInput);

    descriptionInput.addEventListener("blur", () => {
      this.hideDescriptionToolbar?.();
      void refreshRendered();
      descriptionInput.addClass("is-hidden");
      descRendered.removeClass("is-hidden");
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

    if (this.draft.repeat && !this.draft.completed) {
      createBelkiButton(footer, {
          text: "Complete permanently",
          variant: "danger",
          className: "belki-detail-complete-perm"
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

    const footerActions = createBelkiActionRow(footer, { className: "belki-detail-actions" });

    createBelkiButton(footerActions, { text: "Cancel" })
      .addEventListener("click", () => this.close());
    createBelkiButton(footerActions, { text: "Save", variant: "primary" })
      .addEventListener("click", () => {
        void this.save();
      });

    if (!Platform.isMobile) {
      titleInput.focus();
    }
  }

  onClose(): void {
    this.closeQuickAddDropdown?.();
    this.closeWikilinkDropdown?.();
    this.closeDescriptionToolbar?.();
    this.closeDescriptionToolbar = null;
    this.hideDescriptionToolbar = null;
    this.descriptionToolbarVisible = false;
    this.markdownRenderComponent?.unload();
    this.markdownRenderComponent = null;
    this.modalEl.removeEventListener("keydown", this.handleEscape, true);
  }

  private attachDescriptionFormattingToolbar(textarea: HTMLTextAreaElement): () => void {
    const doc = textarea.ownerDocument;
    const win = doc.defaultView;
    if (!win) {
      return () => {};
    }

    const toolbar = doc.body.createDiv({
      cls: "belki-description-toolbar is-hidden",
      attr: { role: "toolbar", "aria-label": "Description formatting" }
    });

    const hide = (): void => {
      toolbar.addClass("is-hidden");
      this.descriptionToolbarVisible = false;
    };
    this.hideDescriptionToolbar = hide;

    const update = (): void => {
      if (doc.activeElement !== textarea || textarea.selectionStart === textarea.selectionEnd) {
        hide();
        return;
      }

      toolbar.removeClass("is-hidden");
      this.descriptionToolbarVisible = true;
      this.positionDescriptionToolbar(textarea, toolbar, win);
    };
    const scheduleUpdate = (): void => {
      win.requestAnimationFrame(update);
    };

    for (const action of DESCRIPTION_FORMAT_ACTIONS) {
      const button = toolbar.createEl("button", {
        text: action.label,
        attr: { type: "button", title: action.title, "aria-label": action.title }
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.applyDescriptionFormatting(textarea, action.id);
        scheduleUpdate();
      });
    }

    toolbar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof win.Node)) {
        return;
      }
      if (target === textarea || toolbar.contains(target)) {
        return;
      }
      hide();
    };

    const handleKeyboard = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        hide();
      }
    };

    textarea.addEventListener("select", scheduleUpdate);
    textarea.addEventListener("keyup", scheduleUpdate);
    textarea.addEventListener("mouseup", scheduleUpdate);
    textarea.addEventListener("touchend", scheduleUpdate);
    textarea.addEventListener("input", scheduleUpdate);
    textarea.addEventListener("focus", scheduleUpdate);
    textarea.addEventListener("keydown", handleKeyboard);
    doc.addEventListener("selectionchange", scheduleUpdate);
    doc.addEventListener("pointerdown", handleDocumentPointerDown, true);
    doc.addEventListener("scroll", scheduleUpdate, true);
    win.addEventListener("resize", scheduleUpdate);

    return () => {
      hide();
      textarea.removeEventListener("select", scheduleUpdate);
      textarea.removeEventListener("keyup", scheduleUpdate);
      textarea.removeEventListener("mouseup", scheduleUpdate);
      textarea.removeEventListener("touchend", scheduleUpdate);
      textarea.removeEventListener("input", scheduleUpdate);
      textarea.removeEventListener("focus", scheduleUpdate);
      textarea.removeEventListener("keydown", handleKeyboard);
      doc.removeEventListener("selectionchange", scheduleUpdate);
      doc.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      doc.removeEventListener("scroll", scheduleUpdate, true);
      win.removeEventListener("resize", scheduleUpdate);
      toolbar.remove();
    };
  }

  private positionDescriptionToolbar(
    textarea: HTMLTextAreaElement,
    toolbar: HTMLElement,
    win: Window
  ): void {
    const margin = 10;
    const gap = 8;
    const toolbarWidth = toolbar.offsetWidth;
    const toolbarHeight = toolbar.offsetHeight;
    const textareaRect = textarea.getBoundingClientRect();
    const anchor = Platform.isMobile
      ? {
          left: textareaRect.left + 8,
          top: textareaRect.top,
          bottom: textareaRect.bottom
        }
      : getTextareaSelectionAnchor(textarea);

    let left = anchor.left;
    let top = anchor.top - toolbarHeight - gap;

    if (top < margin) {
      top = Math.min(anchor.bottom + gap, win.innerHeight - toolbarHeight - margin);
    }

    left = clamp(left, margin, win.innerWidth - toolbarWidth - margin);
    top = clamp(top, margin, win.innerHeight - toolbarHeight - margin);

    toolbar.setCssStyles({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`
    });
  }

  private applyDescriptionFormatting(
    textarea: HTMLTextAreaElement,
    action: DescriptionFormatAction
  ): void {
    const result = formatDescriptionMarkdown(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      action
    );

    textarea.value = result.value;
    this.draft.description = result.value;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    const EventCtor = textarea.ownerDocument.defaultView?.Event ?? Event;
    textarea.dispatchEvent(new EventCtor("input", { bubbles: true }));
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
    this.renderDeadlinePicker(parent);
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
    let draggedSubTaskId: string | null = null;

    const clearDropState = () => {
      list
        .querySelectorAll<HTMLElement>(".is-dragging, .is-drop-before, .is-drop-after")
        .forEach((row) => {
          row.removeClass("is-dragging");
          row.removeClass("is-drop-before");
          row.removeClass("is-drop-after");
        });
    };

    const dropPlacementForEvent = (
      row: HTMLElement,
      event: DragEvent
    ): "before" | "after" => {
      const rect = row.getBoundingClientRect();
      return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    };

    const renderList = () => {
      list.empty();
      const all = this.options.store.getTasks().filter((t) => t.parentId === this.draft.id);
      const current = [...all].sort((a, b) => a.order - b.order);
      current.forEach((sub) => {
        const row = list.createDiv({ cls: "belki-subtask-row" });
        row.dataset.subtaskId = sub.id;

        const dragHandle = row.createEl("button", {
          cls: "belki-subtask-drag-handle",
          text: "⋮⋮",
          attr: {
            type: "button",
            draggable: "true",
            "aria-label": `Reorder ${sub.title}`
          }
        });
        dragHandle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        dragHandle.addEventListener("dragstart", (event) => {
          event.stopPropagation();
          draggedSubTaskId = sub.id;
          row.addClass("is-dragging");
          const dragImage = this.createSubTaskDragImage(row);
          event.dataTransfer?.setData("application/x-belki-subtask-id", sub.id);
          event.dataTransfer?.setData("text/plain", sub.id);
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setDragImage(dragImage, 20, 18);
          }
          window.setTimeout(() => dragImage.remove(), 0);
        });
        dragHandle.addEventListener("dragend", () => {
          draggedSubTaskId = null;
          clearDropState();
        });

        row.addEventListener("dragover", (event) => {
          if (!draggedSubTaskId || draggedSubTaskId === sub.id) {
            return;
          }

          event.preventDefault();
          const placement = dropPlacementForEvent(row, event);
          row.toggleClass("is-drop-before", placement === "before");
          row.toggleClass("is-drop-after", placement === "after");
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }
        });
        row.addEventListener("dragleave", (event) => {
          if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) {
            return;
          }

          row.removeClass("is-drop-before");
          row.removeClass("is-drop-after");
        });
        row.addEventListener("drop", (event) => {
          const taskId =
            draggedSubTaskId ||
            event.dataTransfer?.getData("application/x-belki-subtask-id") ||
            event.dataTransfer?.getData("text/plain");
          if (!taskId || taskId === sub.id) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const placement = dropPlacementForEvent(row, event);
          draggedSubTaskId = null;
          clearDropState();
          void this.options.store.reorderSubTask(taskId, sub.id, placement).then(() => {
            renderList();
            this.options.onChange();
          });
        });

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
        if (hasVisiblePriority(sub.priority)) {
          const pc = getPriorityColor(sub.priority);
          const badge = meta.createSpan({ cls: "belki-subtask-priority", text: getPriorityDisplayLabel(sub.priority) });
          badge.setCssStyles({ color: pc.color });
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
      let composerPriority: Priority = "P4";
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

        for (const p of PRIORITIES.filter((priority) => priority !== "none")) {
          const btn = expandPanel.createEl("button", {
            cls: "belki-subtask-preset" + (p === composerPriority ? " is-active" : ""),
            text: getPriorityDropdownLabel(p),
            attr: { type: "button" }
          });
          if (hasVisiblePriority(p)) btn.setCssStyles({ color: getPriorityColor(p).color });
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
          cls: "belki-subtask-chip" + (hasVisiblePriority(composerPriority) ? " is-active" : "") + (expandedPanel === "priority" ? " is-open" : ""),
          attr: { type: "button" }
        });
        if (hasVisiblePriority(composerPriority)) {
          priChip.setCssStyles({ color: getPriorityColor(composerPriority).color });
        }
        const flagIcon = priChip.createSpan({ cls: "belki-chip-icon" });
        setIcon(flagIcon, "flag");
        priChip.createSpan({ text: getPriorityDisplayLabel(composerPriority) });
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
          composerPriority = "P4";
          expandedPanel = null;
          expandPanel.addClass("is-hidden");
          expandPanel.empty();
          renderChips();
          input.focus();
        }).catch((err: unknown) => {
          console.error("[belki] Failed to create sub-task", err);
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

  private createSubTaskDragImage(row: HTMLElement): HTMLElement {
    const dragImage = row.cloneNode(true) as HTMLElement;
    dragImage.addClass("belki-subtask-drag-preview");
    dragImage.setCssStyles({
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      width: `${row.offsetWidth}px`
    });
    activeDocument.body.appendChild(dragImage);
    return dragImage;
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

      popover.createDiv({ cls: "belki-date-divider" });

      renderCustomDatePicker(popover, this.draft.due, "calendar", selectDate);

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
          activeDocument.addEventListener("click", onOutside, { capture: true });
          detachOutside = () => activeDocument.removeEventListener("click", onOutside, { capture: true });
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
        repeatChip.createSpan({ cls: "belki-repeat-chip-label", text: getRepeatLabel(this.draft.repeat) });
        repeatChip.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!this.draft.due) this.draft.due = todayIso();
          closePopover();
          new CustomRepeatModal(this.app, this.draft.repeat, (rule) => {
            this.draft.repeat = rule;
            renderPicker();
          }).open();
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

  private renderDeadlinePicker(parent: HTMLElement): void {
    const field = this.createField(parent, "Deadline");
    const wrap = field.createDiv({ cls: "belki-date-picker-wrap belki-date-picker-inline" });

    let detachOutside: (() => void) | undefined;

    const closePopover = () => {
      wrap.querySelector(".belki-date-popover-inline")?.addClass("is-hidden");
      detachOutside?.();
      detachOutside = undefined;
    };

    const renderPicker = () => {
      wrap.empty();
      const hasDate = Boolean(this.draft.deadline);

      const btnRow = wrap.createDiv({ cls: "belki-date-btn-row" });
      const btn = btnRow.createEl("button", {
        cls: `belki-detail-date-btn${hasDate ? " is-active" : ""}`,
        attr: { type: "button" }
      });
      const iconSpan = btn.createSpan({ cls: "belki-chip-icon" });
      setIcon(iconSpan, "diamond");
      btn.createSpan({ text: hasDate ? formatDueDateChip(this.draft.deadline) : "No deadline" });

      if (hasDate) {
        const clearBtn = btnRow.createEl("button", {
          cls: "belki-date-chip-clear",
          attr: { type: "button", "aria-label": "Clear deadline" }
        });
        clearBtn.setText("×");
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.draft.deadline = undefined;
          closePopover();
          renderPicker();
        });
      }

      const popover = wrap.createDiv({ cls: "belki-date-popover belki-date-popover-inline is-hidden" });

      const selectDate = (value: string) => {
        this.draft.deadline = value || undefined;
        closePopover();
        renderPicker();
      };

      const addPreset = (label: string, value: string) => {
        const presetBtn = popover.createEl("button", {
          cls: "belki-date-preset",
          text: label,
          attr: { type: "button" }
        });
        presetBtn.toggleClass("is-active", value === this.draft.deadline);
        presetBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectDate(value);
        });
      };

      addPreset("Today", todayIso());
      addPreset("Tomorrow", addDaysIso(1));
      addPreset("Next week", addDaysIso(7));
      addPreset("Next weekend", nextWeekdayIso(6));

      renderCustomDatePicker(popover, this.draft.deadline, "diamond", selectDate);

      btn.addEventListener("click", () => {
        const isHidden = popover.hasClass("is-hidden");
        closePopover();
        if (!isHidden) return;
        popover.removeClass("is-hidden");
        const handleOutside = (e: MouseEvent) => {
          if (!wrap.contains(e.target as Node)) closePopover();
        };
        activeDocument.addEventListener("click", handleOutside, { capture: true });
        detachOutside = () => activeDocument.removeEventListener("click", handleOutside, { capture: true });
      });
    };

    renderPicker();
  }

  private renderPriority(parent: HTMLElement): void {
    const field = this.createField(parent, "Priority");
    const priorityWrap = field.createDiv({ cls: "belki-priority-select-wrap belki-detail-priority-wrap" });
    const indicator = priorityWrap.createSpan({ cls: "belki-priority-indicator" });
    const display = priorityWrap.createSpan({ cls: "belki-priority-display" });
    const select = priorityWrap.createEl("select", {
      cls: "belki-detail-input belki-priority-select",
      attr: { "aria-label": "Priority" }
    });
    for (const priority of PRIORITIES.filter((priority) => priority !== "none")) {
      select.createEl("option", { text: getPriorityDropdownLabel(priority), value: priority });
    }
    select.value = isDefaultPriority(this.draft.priority) ? "P4" : this.draft.priority;
    const updatePriorityStyle = () => {
      const color = getPriorityColor(this.draft.priority);
      priorityWrap.setCssProps({
        "--belki-priority-text": color.color,
        "--belki-priority-bg": color.light,
        "--belki-priority-border": color.color
      });
      priorityWrap.toggleClass("has-priority", hasVisiblePriority(this.draft.priority));
      indicator.setCssStyles({ backgroundColor: color.color });
      display.setText(getPriorityDisplayLabel(this.draft.priority));
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
    if (this.draft.project) {
      this.options.onProjectUsed?.(this.draft.project);
    }
    this.options.onChange();
    this.close();
  }
}

function renderCustomDatePicker(
  parent: HTMLElement,
  currentValue: string | undefined,
  _iconName: string,
  onSelect: (value: string) => void
): void {
  const todayStr = todayIso();
  const initDate = currentValue ? new Date(currentValue + "T00:00:00") : new Date();
  let viewYear = initDate.getFullYear();
  let viewMonth = initDate.getMonth(); // 0–11

  const container = parent.createDiv({ cls: "belki-date-custom-wrap" });

  // Trigger row — same visual style as preset buttons
  const trigger = container.createEl("button", {
    cls: "belki-date-preset belki-cal-trigger",
    attr: { type: "button" }
  });
  trigger.createSpan({ text: currentValue ? formatDueDateChip(currentValue) : "Custom date…" });
  if (currentValue) trigger.addClass("is-active");

  // Calendar panel — hidden until the trigger is tapped/clicked
  const calWrap = container.createDiv({ cls: "belki-cal-wrap is-hidden" });

  function renderCal() {
    calWrap.empty();

    const header = calWrap.createDiv({ cls: "belki-cal-header" });
    const prevBtn = header.createEl("button", { cls: "belki-cal-nav", attr: { type: "button" } });
    prevBtn.setText("‹");
    header.createSpan({
      cls: "belki-cal-title",
      text: new Date(viewYear, viewMonth, 1)
        .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    });
    const nextBtn = header.createEl("button", { cls: "belki-cal-nav", attr: { type: "button" } });
    nextBtn.setText("›");

    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      prevBtn.blur();
      if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCal();
    });
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      nextBtn.blur();
      if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCal();
    });

    const grid = calWrap.createDiv({ cls: "belki-cal-grid" });
    for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
      grid.createSpan({ cls: "belki-cal-day-hdr", text: d });
    }

    // Leading empty cells (week starts on Monday)
    const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const leadingEmpties = firstDow === 0 ? 6 : firstDow - 1;
    for (let i = 0; i < leadingEmpties; i++) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cell = grid.createEl("button", {
        cls: "belki-cal-day",
        text: String(d),
        attr: { type: "button" }
      });
      if (iso === todayStr) cell.addClass("is-today");
      if (iso === currentValue) cell.addClass("is-selected");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(iso);
      });
    }

    const renderedCells = leadingEmpties + daysInMonth;
    const trailingEmpties = 42 - renderedCells;
    for (let i = 0; i < trailingEmpties; i++) {
      grid.createDiv({ cls: "belki-cal-day is-empty" });
    }
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = calWrap.hasClass("is-hidden");
    parent.toggleClass("is-calendar-open", opening);
    calWrap.toggleClass("is-hidden", !opening);
    if (opening) renderCal();
  });
}

interface DescriptionFormatResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function formatDescriptionMarkdown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: DescriptionFormatAction
): DescriptionFormatResult {
  switch (action) {
    case "bold":
      return wrapSelection(value, selectionStart, selectionEnd, "**", "**", "bold text");
    case "italic":
      return wrapSelection(value, selectionStart, selectionEnd, "*", "*", "italic text");
    case "strike":
      return wrapSelection(value, selectionStart, selectionEnd, "~~", "~~", "struck text");
    case "inline-code":
      return wrapSelection(value, selectionStart, selectionEnd, "`", "`", "code");
    case "code-block":
      return wrapSelection(value, selectionStart, selectionEnd, "```\n", "\n```", "code");
    case "link":
      return formatMarkdownLink(value, selectionStart, selectionEnd);
    case "quote":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line) =>
        `> ${line.replace(/^>\s?/, "")}`
      );
    case "bullet-list":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line) =>
        `- ${stripListMarker(line) || "List item"}`
      );
    case "numbered-list":
      return formatSelectedLines(value, selectionStart, selectionEnd, (line, index) =>
        `${index + 1}. ${stripListMarker(line) || "List item"}`
      );
  }
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string
): DescriptionFormatResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const content = selected || placeholder;
  const replacement = `${prefix}${content}${suffix}`;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, replacement);
  const innerStart = selectionStart + prefix.length;

  return {
    value: nextValue,
    selectionStart: innerStart,
    selectionEnd: innerStart + content.length
  };
}

function formatMarkdownLink(
  value: string,
  selectionStart: number,
  selectionEnd: number
): DescriptionFormatResult {
  const selected = value.slice(selectionStart, selectionEnd) || "link text";
  const replacement = `[${selected}](url)`;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, replacement);
  const urlStart = selectionStart + selected.length + 3;

  return {
    value: nextValue,
    selectionStart: urlStart,
    selectionEnd: urlStart + 3
  };
}

function formatSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transform: (line: string, index: number) => string
): DescriptionFormatResult {
  const collapsed = selectionStart === selectionEnd;
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", effectiveEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const block = collapsed ? "" : value.slice(lineStart, lineEnd);
  const lines = block ? block.split("\n") : [""];
  const replacement = lines.map(transform).join("\n");
  const nextValue = replaceRange(value, collapsed ? selectionStart : lineStart, collapsed ? selectionEnd : lineEnd, replacement);
  const replacementStart = collapsed ? selectionStart : lineStart;

  return {
    value: nextValue,
    selectionStart: replacementStart,
    selectionEnd: replacementStart + replacement.length
  };
}

function replaceRange(value: string, start: number, end: number, replacement: string): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
}

function getTextareaSelectionAnchor(textarea: HTMLTextAreaElement): {
  left: number;
  top: number;
  bottom: number;
} {
  const doc = textarea.ownerDocument;
  const win = doc.defaultView;
  if (!win) {
    const rect = textarea.getBoundingClientRect();
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  }

  const computed = win.getComputedStyle(textarea);
  const mirror = doc.body.createDiv({ cls: "belki-textarea-selection-mirror" });

  mirror.setCssStyles({
    boxSizing: computed.boxSizing,
    borderTopWidth: computed.borderTopWidth,
    borderRightWidth: computed.borderRightWidth,
    borderBottomWidth: computed.borderBottomWidth,
    borderLeftWidth: computed.borderLeftWidth,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontStyle: computed.fontStyle,
    fontWeight: computed.fontWeight,
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight,
    paddingTop: computed.paddingTop,
    paddingRight: computed.paddingRight,
    paddingBottom: computed.paddingBottom,
    paddingLeft: computed.paddingLeft,
    textTransform: computed.textTransform,
    textIndent: computed.textIndent,
    wordSpacing: computed.wordSpacing,
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    top: "0",
    left: "-9999px",
    width: `${textarea.clientWidth}px`,
    minHeight: "0",
    height: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word"
  });

  const position = Math.min(textarea.selectionStart, textarea.selectionEnd);
  mirror.textContent = textarea.value.slice(0, position);
  const marker = doc.createElement("span");
  marker.textContent = textarea.value.slice(position, position + 1) || "\u200b";
  mirror.appendChild(marker);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const top = textareaRect.top + markerRect.top - mirrorRect.top - textarea.scrollTop;
  const left = textareaRect.left + markerRect.left - mirrorRect.left - textarea.scrollLeft;
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;

  mirror.remove();

  return {
    left,
    top,
    bottom: top + lineHeight
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function attachmentName(path: string): string {
  return path.split("/").pop() || path;
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(path);
}
