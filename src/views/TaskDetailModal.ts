import { App, Component, MarkdownRenderer, Modal, Notice, Platform, TFile } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import { todayIso } from "../dateUtils";
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
import { createBelkiIcon } from "../ui/components/BelkiIcon";
import { attachWikilinkAutocomplete } from "./wikilinkAutocomplete";
import { attachQuickAddAutocomplete, parseQuickAddTokens } from "./quickAddAutocomplete";
import { createBelkiActionRow, createBelkiButton } from "../ui";
import { renderTaskDetailDateRepeatFields } from "./task-detail/dateRepeatFields";
import { formatDescriptionMarkdown } from "./task-detail/descriptionFormatting";
import { renderSubtaskSection } from "./task-detail/SubtaskSection";
import { DeleteTaskConfirmationModal } from "./tasks/DeleteTaskConfirmationModal";
import type { DescriptionFormatAction } from "./task-detail/descriptionFormatting";

interface TaskDetailModalOptions {
  task: BelkiTask;
  projects: string[];
  labels: string[];
  settings: BelkiSettings;
  store: TaskStore;
  onChange: () => void;
  onProjectUsed?: (project: string) => void;
}

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
  private closeProjectMenu: (() => boolean) | null = null;
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

    if (this.closeProjectMenu?.()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
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
    const mobileBackButton = mobileHeader.createEl("button", {
      cls: "belki-detail-mobile-back",
      attr: { type: "button", "aria-label": "Back to task list" }
    });
    createBelkiIcon(mobileBackButton, "back");
    mobileBackButton.addEventListener("click", () => this.close());
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
      attr: { type: "button", "aria-label": "Close task details" }
    });
    createBelkiIcon(closeButton, "close");
    closeButton.addEventListener("click", () => this.close());

    if (isSubTask && parentTask) {
      const contextBar = main.createDiv({ cls: "belki-subtask-context-bar" });
      createBelkiIcon(contextBar, "collapse", { className: "belki-subtask-context-arrow" });
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

    const openRenderedInternalLink = (
      event: MouseEvent | TouchEvent,
      internalLink: HTMLAnchorElement,
      openInNewLeaf: boolean
    ) => {
      const linkTarget =
        internalLink.getAttribute("data-href") ||
        internalLink.getAttribute("href") ||
        "";
      if (!linkTarget) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        await this.app.workspace.openLinkText(
          linkTarget,
          this.draft.sourcePath || "",
          openInNewLeaf
        );
        if (!openInNewLeaf) {
          this.close();
        }
      })();
    };

    descRendered.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("a")) {
        e.stopPropagation();
      }
    });
    descRendered.addEventListener("touchstart", (e) => {
      if ((e.target as HTMLElement).closest("a")) {
        e.stopPropagation();
      }
    });
    descRendered.addEventListener("touchend", (e) => {
      const internalLink = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.internal-link");
      if (internalLink) {
        openRenderedInternalLink(e, internalLink, false);
      }
    });
    descRendered.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const internalLink = target.closest<HTMLAnchorElement>("a.internal-link");
      if (internalLink) {
        openRenderedInternalLink(e, internalLink, e.metaKey || e.ctrlKey);
        return;
      }

      if (target.closest("a")) {
        e.stopPropagation();
        return;
      }

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

    renderSubtaskSection(main, {
      app: this.app,
      store: this.options.store,
      parentTask: this.draft,
      onChange: this.options.onChange,
      openTaskDetail: (task, onChange) => {
        new TaskDetailModal(this.app, {
          task,
          projects: this.options.projects,
          labels: this.options.labels,
          settings: this.options.settings,
          store: this.options.store,
          onChange
        }).open();
      }
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
      .addEventListener("click", () => {
        new DeleteTaskConfirmationModal(this.app, {
          task: this.draft,
          tasks: this.options.store.getTasks(),
          onDeleteTaskOnly: async () => {
            await this.options.store.deleteTask(this.draft.id);
            this.options.onChange();
            this.close();
          },
          onDeleteWithSubtasks: async () => {
            await this.options.store.deleteTask(this.draft.id, { includeSubtasks: true });
            this.options.onChange();
            this.close();
          }
        }).open();
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
    this.closeProjectMenu?.();
    this.closeDescriptionToolbar = null;
    this.closeProjectMenu = null;
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
    renderTaskDetailDateRepeatFields(parent, {
      getState: () => ({
        due: this.draft.due,
        deadline: this.draft.deadline,
        repeat: this.draft.repeat
      }),
      onDueChange: (due) => {
        this.draft.due = due;
      },
      onClearDueAndRepeat: () => {
        if (this.draft.repeat) new Notice("Date and repeat rule removed.");
        this.draft.due = undefined;
        this.draft.repeat = undefined;
      },
      onDeadlineChange: (deadline) => {
        this.draft.deadline = deadline;
      },
      onRepeatChange: (repeat) => {
        this.draft.repeat = repeat;
      },
      onOpenCustomRepeat: (currentRepeat, onSave) => {
        new CustomRepeatModal(this.app, currentRepeat, onSave).open();
      }
    });
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

        createBelkiIcon(item, "file", { className: "belki-attachment-file-icon" });

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
        createBelkiIcon(downloadButton, "download");
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
        createBelkiIcon(removeButton, "close");
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

    const addAttachmentButton = section.createEl("button", {
      cls: "belki-add-attachment-inline",
      attr: { type: "button" }
    });
    createBelkiIcon(addAttachmentButton, "add");
    addAttachmentButton.createSpan({ text: "Add attachment" });
    addAttachmentButton.addEventListener("click", () => {
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
      createBelkiIcon(downloadButton, "download");
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
      createBelkiIcon(removeButton, "close");
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
      const link = activeDocument.body.createEl("a", {
        attr: {
          href: url,
          download: file.name
        }
      });
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      await this.app.workspace.openLinkText(path, "", false);
    }
  }

  private renderProject(parent: HTMLElement): void {
    const field = this.createField(parent, "Project");
    field.addClass("belki-detail-project-field");
    const projectPicker = field.createEl("button", {
      cls: "belki-project-picker belki-detail-project-picker",
      attr: {
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": "false"
      }
    });
    const projectDot = projectPicker.createSpan({
      cls: "belki-project-dot belki-detail-project-dot"
    });
    const projectLabel = projectPicker.createSpan({ cls: "belki-project-trigger-label" });
    const projectMenu = field.createEl("div", {
      cls: "belki-project-menu belki-detail-project-menu is-hidden",
      attr: { role: "listbox" }
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
      const currentProject = normalizeTaskProject(this.draft.project) || "";
      const projects = getProjects();
      projectMenu.empty();
      renderProjectOption("No project", "", undefined, currentProject === "");
      if (projects.length > 0) {
        projectMenu.createDiv({ cls: "belki-project-section-label", text: "Projects" });
      }
      for (const project of projects) {
        renderProjectOption(
          project,
          project,
          getProjectColor(project, this.options.settings.projectColors),
          currentProject === project
        );
      }

      renderProjectOption("Create project...", createValue, undefined, false);
    };

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && field.contains(target)) {
        return;
      }

      closeProjectMenu();
    };

    const closeProjectMenu = (): boolean => {
      if (projectMenu.hasClass("is-hidden")) {
        return false;
      }

      projectMenu.addClass("is-hidden");
      projectPicker.setAttr("aria-expanded", "false");
      activeDocument.removeEventListener("pointerdown", handleOutsidePointer, true);
      return true;
    };

    const openProjectMenu = () => {
      renderOptions();
      projectMenu.removeClass("is-hidden");
      projectPicker.setAttr("aria-expanded", "true");
      activeDocument.addEventListener("pointerdown", handleOutsidePointer, true);
    };

    const selectProject = (value: string) => {
      if (value === createValue) {
        createRow.removeClass("is-hidden");
        closeProjectMenu();
        createInput.focus();
        return;
      }

      this.draft.project = normalizeTaskProject(value);
      createRow.addClass("is-hidden");
      closeProjectMenu();
      updateProjectStyle();
      renderOptions();
    };

    function renderProjectOption(
      label: string,
      value: string,
      projectColor: ReturnType<typeof getProjectColor> | undefined,
      selected: boolean
    ): void {
      const option = projectMenu.createEl("button", {
        cls: "belki-project-option",
        attr: {
          type: "button",
          role: "option",
          "aria-selected": String(selected)
        }
      });
      option.toggleClass("has-project", Boolean(projectColor));
      option.toggleClass("is-selected", selected);
      option.createSpan({
        cls: "belki-project-option-check",
        text: selected ? "\u2713" : ""
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
    }

    const updateProjectStyle = () => {
      const project = normalizeTaskProject(this.draft.project);
      projectLabel.setText(project || "No project");
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
      renderOptions();
      updateProjectStyle();
    };

    const createProject = () => {
      const project = normalizeTaskProject(createInput.value);
      if (!project) {
        createInput.focus();
        return;
      }

      this.draft.project = project;
      hideCreateRow();
    };

    projectPicker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (projectMenu.hasClass("is-hidden")) {
        openProjectMenu();
        return;
      }

      closeProjectMenu();
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
    this.closeProjectMenu = closeProjectMenu;
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
        const removeLabel = chip.createSpan({
          cls: "belki-label-chip-remove",
          attr: { "aria-hidden": "true" }
        });
        createBelkiIcon(removeLabel, "close");
        removeLabel.addEventListener("click", (event) => {
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
      const bindSuggestion = (button: HTMLButtonElement, value: string) => {
        button.addEventListener("pointerdown", (event) => {
          if (!Platform.isMobile) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          addLabel(value);
        });
        button.addEventListener("click", () => addLabel(value));
      };

      for (const label of matches) {
        const suggestion = suggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: displayLabel(label),
          attr: { type: "button" }
        });
        bindSuggestion(suggestion, label);
      }
      if (!labels.includes(query) && !this.draft.labels.includes(query)) {
        const create = suggestions.createEl("button", {
          cls: "belki-label-suggestion",
          text: `Create label: ${displayLabel(query)}`,
          attr: { type: "button" }
        });
        bindSuggestion(create, query);
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
