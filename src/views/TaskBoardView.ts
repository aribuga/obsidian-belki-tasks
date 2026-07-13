import { App, ItemView, Modal, Platform, WorkspaceLeaf } from "obsidian";
import {
  ActivityData,
  buildActivityData,
  formatActivityDate,
  formatActivityDayHeading,
  getActivityDataSignature
} from "../activityData";
import { getLabelColor, getProjectColor } from "../colors";
import {
  compareIsoDates,
  daysBetweenIsoDates,
  isAfterToday,
  isBeforeToday,
  isToday,
  todayIso,
  yesterdayIso
} from "../dateUtils";
import {
  applyBelkiFontSettings,
  BelkiIconSettings,
  BelkiSettings,
  normalizeOverdueRange,
  overdueRangeLabel
} from "../settings";
import { TaskStore } from "../taskStore";
import { BelkiSortMode, BelkiTask, BoardViewMode, CreateTaskInput, OVERDUE_RANGES, Priority } from "../types";
import { AddTaskComposer } from "./AddTaskComposer";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { TaskDetailModal } from "./TaskDetailModal";
import { DeleteLabelModal, RenameLabelModal } from "./LabelManagementModals";
import {
  getPriorityClass,
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityLabel,
  hasVisiblePriority,
  isDefaultPriority
} from "../priority";
import {
  normalizeTaskProject,
  projectDisplayName,
  uniqueRealProjects
} from "../projects";
import { createBelkiIcon } from "../ui/components/BelkiIcon";
import { renderLinkedText, stripInlineMarkdownPreservingLinks } from "./linkedText";
import { compareTasksByMode } from "../taskSorting";
import { CreateProjectModal, DeleteProjectModal, RenameProjectModal } from "./projects/ProjectModals";
import { renderProjectActionsMenu } from "./projects/projectActions";
import { openLabelActionsMenu as openLabelActionsMenuElement } from "./labels/labelActions";
import { renderFiltersAndLabelsView } from "./filters/FiltersAndLabelsView";
import type { FilterDefinition } from "./filters/FiltersAndLabelsView";
import { renderTaskActionMenu, renderTaskActions } from "./tasks/taskActions";

export const VIEW_TYPE_BELKI = "belki-task-board";

function markdownPreviewText(text: string): string {
  return text
    .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, "$1")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ")
    .replace(/^(.*)$/s, (_, value: string) => stripInlineMarkdownPreservingLinks(value))
    .replace(/\s+/g, " ")
    .trim();
}

const SORT_OPTIONS: Array<{ mode: BelkiSortMode; label: string }> = [
  { mode: "smart", label: "Smart" },
  { mode: "due", label: "Due date" },
  { mode: "priority", label: "Priority" },
  { mode: "deadline", label: "Deadline" },
  { mode: "created", label: "Created date" },
  { mode: "project", label: "Project" },
  { mode: "alphabetical", label: "Alphabetical" }
];

export class TaskBoardView extends ItemView {
  private mode: BoardViewMode = "today";
  private selectedProject: string | null = null;
  private unsubscribe?: () => void;
  private searchQuery = "";
  private searchOpen = false;
  private composerOpen = false;
  private mobileComposerOpen = false;
  private highlightedTaskId: string | null = null;
  private activeFilter: string | null = null;
  private activeLabel: string | null = null;
  private dailyNoteDate: string | null = null;
  private dailyNoteSourcePath: string | null = null;
  private activitySelectedDate: string | null = null;
  private activityCache: { signature: string; data: ActivityData } | null = null;
  private draggedTaskId: string | null = null;
  private sortPopoverOpen = false;
  private projectActionsOpen: string | null = null;
  private labelActionsOpen: string | null = null;
  private taskActionsOpenId: string | null = null;
  private expandedSubtaskPreviewIds = new Set<string>();
  private suppressNextStoreRender = false;
  private projectMenuEl: HTMLElement | null = null;
  private labelMenuEl: HTMLElement | null = null;
  private taskActionMenuEl: HTMLElement | null = null;
  private projectMenuCleanup: (() => void) | null = null;
  private sidebarScrollLeft = 0;
  private pendingScrollSnapshot: { top: number; left: number } | null = null;
  private mobileComposerReturnScroll: { top: number; left: number } | null = null;
  private composerCleanup: (() => void) | null = null;
  private renderScheduled = false;
  private handleRootClick = (event: MouseEvent): void => {
    const target = event.target;
    if (
      this.taskActionsOpenId &&
      target instanceof HTMLElement &&
      target.closest(".belki-task-actions, .belki-task-action-menu")
    ) {
      return;
    }

    if (this.taskActionsOpenId) {
      this.removeTaskActionMenu();
    }

    if (
      this.labelActionsOpen &&
      target instanceof HTMLElement &&
      target.closest(".belki-label-actions-button, .belki-label-menu")
    ) {
      return;
    }

    if (this.labelActionsOpen) {
      this.closeLabelActionsMenu();
    }
  };
  private handleRootKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.taskActionsOpenId !== null) {
      this.stopEscape(event);
      this.removeTaskActionMenu();
      return;
    }

    if (this.projectActionsOpen !== null) {
      this.stopEscape(event);
      this.closeProjectActionsMenu();
      this.render();
      return;
    }

    if (this.labelActionsOpen !== null) {
      this.stopEscape(event);
      this.closeLabelActionsMenu();
      return;
    }

    const openProjectInput = this.containerEl.querySelector<HTMLElement>(
      ".belki-custom-project-wrap:not(.is-hidden)"
    );
    if (openProjectInput) {
      this.stopEscape(event);
      openProjectInput.addClass("is-hidden");
      return;
    }

    const openPopover = this.containerEl.querySelector<HTMLElement>(
      ".belki-composer-popover:not(.is-hidden)"
    );
    if (openPopover) {
      this.stopEscape(event);
      openPopover.addClass("is-hidden");
      return;
    }

    const openMenu = this.containerEl.querySelector<HTMLElement>(
      ".belki-composer-menu:not(.is-hidden)"
    );
    if (openMenu) {
      this.stopEscape(event);
      openMenu.addClass("is-hidden");
      return;
    }

    if (this.composerOpen) {
      this.stopEscape(event);
      this.composerOpen = false;
      this.render();
      return;
    }

    if (this.mobileComposerOpen) {
      this.stopEscape(event);
      this.closeMobileComposer();
      return;
    }

    if (this.sortPopoverOpen) {
      this.stopEscape(event);
      this.sortPopoverOpen = false;
      this.render();
      return;
    }

    if (this.searchOpen) {
      this.stopEscape(event);
      this.searchOpen = false;
      this.searchQuery = "";
      this.render();
      return;
    }

    this.stopEscape(event);
  };

  constructor(
    leaf: WorkspaceLeaf,
    private store: TaskStore,
    private settings: BelkiSettings,
    private saveSettings: () => Promise<void>
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BELKI;
  }

  getDisplayText(): string {
    return "Tasks · belki";
  }

  getIcon(): string {
    return "check-circle-2";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.store.subscribe(() => {
      if (this.suppressNextStoreRender) {
        this.suppressNextStoreRender = false;
        return;
      }
      this.renderPreservingMainScroll();
    });
    this.render();
  }

  async onClose(): Promise<void> {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    this.removeLabelMenu();
    this.removeTaskActionMenu();
    this.containerEl.removeEventListener("keydown", this.handleRootKeyDown, true);
    this.containerEl.removeEventListener("click", this.handleRootClick, true);
    this.unsubscribe?.();
  }

  private removeProjectMenu(): void {
    if (this.projectMenuCleanup) {
      this.projectMenuCleanup();
      this.projectMenuCleanup = null;
    } else {
      this.projectMenuEl?.remove();
    }
    this.projectMenuEl = null;
  }

  private removeLabelMenu(): void {
    this.labelMenuEl?.remove();
    this.labelMenuEl = null;
  }

  private removeTaskActionMenu(): void {
    this.taskActionMenuEl?.remove();
    this.taskActionMenuEl = null;
    this.taskActionsOpenId = null;
  }

  private closeProjectActionsMenu(): void {
    this.projectActionsOpen = null;
    this.removeProjectMenu();
  }

  private closeLabelActionsMenu(): void {
    this.labelActionsOpen = null;
    this.removeLabelMenu();
  }

  refresh(): void {
    this.render();
  }

  openToday(): void {
    this.mode = "today";
    this.selectedProject = null;
    this.activeFilter = null;
    this.activeLabel = null;
    this.dailyNoteDate = null;
    this.dailyNoteSourcePath = null;
    this.searchOpen = false;
    this.searchQuery = "";
    this.composerOpen = false;
    this.mobileComposerOpen = false;
    this.mobileComposerReturnScroll = null;
    this.sortPopoverOpen = false;
    this.projectActionsOpen = null;
    this.labelActionsOpen = null;
    this.render();
  }

  openDailyNote(date: string, sourcePath: string): void {
    this.mode = "daily-note";
    this.dailyNoteDate = date;
    this.dailyNoteSourcePath = sourcePath;
    this.selectedProject = null;
    this.activeFilter = null;
    this.activeLabel = null;
    this.searchOpen = false;
    this.searchQuery = "";
    this.composerOpen = false;
    this.mobileComposerOpen = false;
    this.mobileComposerReturnScroll = null;
    this.sortPopoverOpen = false;
    this.projectActionsOpen = null;
    this.labelActionsOpen = null;
    this.render();
  }

  isDailyNoteView(): boolean {
    return this.mode === "daily-note";
  }

  private render(): void {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    this.removeLabelMenu();
    this.removeTaskActionMenu();
    const { containerEl } = this;
    const sidebarScrollLeft =
      containerEl.querySelector<HTMLElement>(".belki-sidebar")?.scrollLeft ??
      this.sidebarScrollLeft;
    containerEl.empty();
    containerEl.addClass("belki-root");
    containerEl.addClass("belki-view");
    containerEl.toggleClass("is-mobile", Platform.isMobile);
    containerEl.toggleClass("is-sidebar-collapsed", this.settings.sidebarCollapsed && !Platform.isMobile);
    applyBelkiFontSettings(containerEl, this.settings);
    containerEl.addEventListener("keydown", this.handleRootKeyDown, true);
    containerEl.addEventListener("click", this.handleRootClick, true);

    const shell = containerEl.createDiv({ cls: "belki-shell" });
    this.renderSidebar(shell);
    this.renderMain(shell);

    if (this.searchOpen) {
      this.renderSearchOverlay(containerEl);
    }
    this.renderMobileQuickAdd(containerEl);

    this.restoreSidebarScroll(sidebarScrollLeft);
  }

  private getMainScrollSnapshot(): { top: number; left: number } | null {
    const main = this.containerEl.querySelector<HTMLElement>(".belki-main");
    if (!main) {
      return null;
    }

    return {
      top: main.scrollTop,
      left: main.scrollLeft
    };
  }

  private renderPreservingMainScroll(): void {
    if (!this.pendingScrollSnapshot) {
      this.pendingScrollSnapshot = this.getMainScrollSnapshot();
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      const snapshot = this.pendingScrollSnapshot;
      this.pendingScrollSnapshot = null;
      this.render();
      if (!snapshot) return;
      this.restoreMainScrollSnapshot(snapshot);
    });
  }

  private restoreMainScrollSnapshot(snapshot: { top: number; left: number }): void {
    const ownerWindow = this.containerEl.ownerDocument.defaultView || window;
    const restore = () => {
      const main = this.containerEl.querySelector<HTMLElement>(".belki-main");
      if (main) {
        main.scrollTop = snapshot.top;
        main.scrollLeft = snapshot.left;
      }
    };

    ownerWindow.requestAnimationFrame(() => {
      restore();
      ownerWindow.requestAnimationFrame(restore);
    });
  }

  private restoreSidebarScroll(scrollLeft: number): void {
    window.requestAnimationFrame(() => {
      const sidebar = this.containerEl.querySelector<HTMLElement>(".belki-sidebar");
      if (!sidebar) {
        return;
      }

      sidebar.scrollLeft = scrollLeft;
      this.sidebarScrollLeft = sidebar.scrollLeft;
    });
  }

  private renderSidebar(parent: HTMLElement): void {
    const sidebar = parent.createEl("aside", { cls: "belki-sidebar" });
    sidebar.scrollLeft = this.sidebarScrollLeft;
    sidebar.addEventListener("scroll", () => {
      this.sidebarScrollLeft = sidebar.scrollLeft;
    });

    this.renderSidebarHeader(sidebar);

    if (this.shouldShowContextualAddTask()) {
      const sidebarAdd = sidebar.createEl("button", {
        cls: "belki-add-sidebar",
        attr: {
          type: "button",
          title: "Add task",
          "aria-label": "Add task",
          "data-sidebar-label": "Add task"
        }
      });
      createBelkiIcon(sidebarAdd, "add", { className: "belki-add-plus", size: 18 });
      sidebarAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
      sidebarAdd.addEventListener("click", () => {
        this.openAddComposer();
      });
    }

    const tasks = this.store.getTasks();
    const activeTopLevel = this.getActiveTopLevelTasks(tasks);
    const nav = sidebar.createDiv({ cls: "belki-nav" });

    this.renderNavButton(nav, "Search", "search", undefined, "search");
    this.renderNavButton(nav, "Inbox", "inbox", this.getInboxTasks(activeTopLevel).length, "inbox");
    this.renderNavButton(nav, "Today", "today", this.getTodayTasks(activeTopLevel).length, "today");
    this.renderNavButton(nav, "Upcoming", "upcoming", this.getUpcomingTasks(activeTopLevel).length, "upcoming");
    this.renderNavButton(nav, "Filters & Labels", "filters", undefined, "filters");
    this.renderNavButton(nav, "Projects", "projects", undefined, "projects");
    this.renderNavButton(nav, "Activity", "activity", undefined, "activity");

    const projectsSection = sidebar.createDiv({ cls: "belki-sidebar-section" });
    const projectsHeadingRow = projectsSection.createDiv({ cls: "belki-sidebar-heading-row" });
    projectsHeadingRow.createDiv({ cls: "belki-sidebar-heading", text: "Projects" });
    const addProjectBtn = projectsHeadingRow.createEl("button", {
      cls: "belki-sidebar-add-project",
      attr: {
        type: "button",
        title: "New project",
        "aria-label": "New project",
        "data-sidebar-label": "New project"
      }
    });
    createBelkiIcon(addProjectBtn, "add");
    addProjectBtn.createSpan({ cls: "belki-sidebar-add-project-label", text: "Project" });
    addProjectBtn.addEventListener("click", () => {
      new CreateProjectModal(this.app, this.getKnownProjects(), (project) => {
        this.ensureProjectInRegistry(project.name);
        if (project.colorOverride) {
          this.settings.projectColors[project.name] = project.colorOverride;
        } else {
          delete this.settings.projectColors[project.name];
        }
        void this.saveSettings().then(() => this.render());
      }).open();
    });

    for (const cleanProject of this.getActiveProjects()) {
      const count = activeTopLevel.filter((task) => normalizeTaskProject(task.project) === cleanProject).length;
      const button = projectsSection.createEl("button", {
        cls: "belki-project-button",
        attr: {
          type: "button",
          title: `${cleanProject} (${count})`,
          "aria-label": `${cleanProject} (${count})`,
          "data-sidebar-label": `${cleanProject} (${count})`
        }
      });
      button.toggleClass(
        "is-active",
        this.mode === "projects" && this.selectedProject === cleanProject
      );
      const color = getProjectColor(cleanProject, this.settings.projectColors);
      button.setCssProps({
        "--belki-project-bg": color.light,
        "--belki-project-color": color.regular
      });
      button
        .createSpan({ cls: "belki-project-dot" })
        .setCssStyles({ backgroundColor: color.regular });
      button.createEl("span", { cls: "belki-nav-label", text: cleanProject });
      button.createEl("span", { cls: "belki-count", text: String(count) });
      this.enableProjectDrop(button, cleanProject);
      button.addEventListener("click", () => {
        this.mode = "projects";
        this.selectedProject = cleanProject;
        this.dailyNoteDate = null;
        this.dailyNoteSourcePath = null;
        this.composerOpen = false;
        this.mobileComposerOpen = false;
        this.mobileComposerReturnScroll = null;
        this.render();
      });
    }

    if (this.settings.archivedProjects.length > 0) {
      const archiveButton = projectsSection.createEl("button", {
        cls: "belki-project-button belki-archived-button",
        attr: {
          type: "button",
          title: `Archived (${this.settings.archivedProjects.length})`,
          "aria-label": `Archived (${this.settings.archivedProjects.length})`,
          "data-sidebar-label": `Archived (${this.settings.archivedProjects.length})`
        }
      });
      archiveButton.toggleClass("is-active", this.mode === "archived");
      createBelkiIcon(archiveButton, "archive", { className: "belki-nav-icon", size: 18 });
      archiveButton.createEl("span", { cls: "belki-nav-label", text: "Archived" });
      archiveButton.createEl("span", { cls: "belki-count", text: String(this.settings.archivedProjects.length) });
      archiveButton.addEventListener("click", () => {
        this.mode = "archived";
        this.selectedProject = null;
        this.dailyNoteDate = null;
        this.dailyNoteSourcePath = null;
        this.composerOpen = false;
        this.mobileComposerOpen = false;
        this.mobileComposerReturnScroll = null;
        this.render();
      });
    }

    this.renderNavButton(
      nav,
      "Completed",
      "completed",
      this.getCompletedDisplayTasks(tasks).length,
      "completed"
    );
  }

  private renderSidebarHeader(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "belki-sidebar-top" });
    const toggle = header.createEl("button", {
      cls: "belki-sidebar-collapse-button",
      attr: {
        type: "button",
        title: this.settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        "aria-label": this.settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        "aria-pressed": String(this.settings.sidebarCollapsed),
        "data-sidebar-label": this.settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
      }
    });
    createBelkiIcon(toggle, this.settings.sidebarCollapsed ? "expand" : "collapse", {
      className: "belki-sidebar-collapse-icon",
      size: 18
    });
    toggle.createSpan({
      cls: "belki-sidebar-collapse-label",
      text: this.settings.sidebarCollapsed ? "Expand" : "Collapse"
    });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.toggleSidebarCollapsed();
    });
  }

  private renderNavButton(
    parent: HTMLElement,
    label: string,
    mode: BoardViewMode,
    count?: number,
    iconKey?: keyof BelkiIconSettings
  ): void {
    const tooltipLabel = count !== undefined ? `${label} (${count})` : label;
    const button = parent.createEl("button", {
      cls: "belki-nav-button",
      attr: {
        type: "button",
        title: tooltipLabel,
        "aria-label": tooltipLabel,
        "data-sidebar-label": tooltipLabel
      }
    });
    const active =
      label === "Search"
        ? false
        : label === "Projects"
          ? this.mode === "projects" && this.selectedProject === null
          : this.mode === mode;
    button.toggleClass("is-active", active);
    const iconEl = button.createEl("span", { cls: "belki-nav-icon" });
    if (iconKey) {
      createBelkiIcon(iconEl, iconKey, { size: 18 });
    }
    button.createEl("span", { cls: "belki-nav-label", text: label });

    if (count !== undefined) {
      button.createEl("span", { cls: "belki-count", text: String(count) });
    }

    button.addEventListener("click", () => {
      if (label === "Search") {
        this.searchOpen = true;
        this.searchQuery = "";
        this.sortPopoverOpen = false;
        this.render();
        return;
      }

      this.mode = mode;
      this.selectedProject = null;
      this.activeFilter = null;
      this.activeLabel = null;
      this.dailyNoteDate = null;
      this.dailyNoteSourcePath = null;
      this.composerOpen = false;
      this.mobileComposerOpen = false;
      this.mobileComposerReturnScroll = null;
      this.searchOpen = false;
      this.sortPopoverOpen = false;
      this.render();
    });
  }

  private async toggleSidebarCollapsed(): Promise<void> {
    this.settings.sidebarCollapsed = !this.settings.sidebarCollapsed;
    await this.saveSettings();
    this.render();
  }

  private renderMain(parent: HTMLElement): void {
    const main = parent.createEl("main", { cls: "belki-main" });
    const tasks = this.store.getTasks();
    const visible = this.getVisibleTasks(tasks);
    const activityData = this.mode === "activity" ? this.getActivityData(tasks) : null;

    const header = main.createDiv({ cls: "belki-main-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h1", { text: this.getTitle() });
    titleWrap.createDiv({
      cls: "belki-subtitle",
      text: activityData
        ? `${activityData.allTimeCount} completed task${activityData.allTimeCount === 1 ? "" : "s"}`
        : `${visible.length} task${visible.length === 1 ? "" : "s"}`
    });
    if (this.mode !== "activity" && this.mode !== "daily-note") {
      this.renderSortingControl(header);
    }

    const sections = main.createDiv({ cls: "belki-sections" });

    this.renderTaskSections(sections, tasks);

    if (!this.shouldShowContextualAddTask()) {
      return;
    }

    const addArea = main.createDiv({ cls: "belki-add-area" });
    if (this.composerOpen) {
      this.renderAddTaskComposer(addArea, () => {
        this.composerOpen = false;
        this.render();
      });
    } else {
      const inlineAdd = addArea.createEl("button", { cls: "belki-add-inline" });
      createBelkiIcon(inlineAdd, "add", { className: "belki-add-plus", size: 18 });
      inlineAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
      inlineAdd.addEventListener("click", () => {
        this.openAddComposer();
      });
    }

    if (tasks.length === 0) {
      main.createDiv({
        cls: "belki-empty",
        text: `No tasks yet. Add one and belki will write it to ${this.store.dataDir}/YYYY-MM.md.`
      });
    }
  }

  private openAddComposer(): void {
    if (!this.shouldShowContextualAddTask()) {
      return;
    }

    this.sortPopoverOpen = false;
    this.projectActionsOpen = null;
    this.searchOpen = false;
    this.searchQuery = "";

    if (Platform.isMobile) {
      this.mobileComposerReturnScroll = this.getMainScrollSnapshot();
      this.mobileComposerOpen = true;
      this.composerOpen = false;
    } else {
      this.composerOpen = true;
      this.mobileComposerOpen = false;
      this.mobileComposerReturnScroll = null;
    }

    this.render();
  }

  private closeMobileComposer(): void {
    const snapshot = this.mobileComposerReturnScroll;
    this.mobileComposerReturnScroll = null;
    this.mobileComposerOpen = false;
    this.render();
    if (snapshot) {
      this.restoreMainScrollSnapshot(snapshot);
    }
  }

  private renderAddTaskComposer(parent: HTMLElement, onClose: () => void): void {
    const composer = new AddTaskComposer();
    this.composerCleanup = composer.render(parent, {
      app: this.app,
      projects: this.getActiveProjects(),
      labels: this.getAllLabels(),
      labelColors: this.settings.labelColors,
      projectColors: this.settings.projectColors,
      defaultProject: this.selectedProject || "",
      defaultDue: this.getComposerDefaultDue(),
      onCancel: onClose,
      onEnsureLabel: (label) => {
        this.ensureLabelColor(label);
      },
      onSubmit: async (input) => {
        await this.createTaskFromComposer(input);
        onClose();
      },
      presentation: Platform.isMobile ? "mobile-screen" : "default"
    });

    const ownerWindow = parent.ownerDocument.defaultView || window;
    ownerWindow.requestAnimationFrame(() => {
      if (Platform.isMobile) {
        composer.focusTitleForMobileCapture();
      } else {
        composer.focus();
      }
    });
  }

  private async createTaskFromComposer(input: CreateTaskInput): Promise<void> {
    await this.store.createTask(input);
    if (input.project) {
      this.ensureProjectInRegistry(input.project);
      await this.saveSettings();
    }
  }

  private renderMobileQuickAdd(parent: HTMLElement): void {
    if (this.searchOpen || !this.shouldShowContextualAddTask()) {
      return;
    }

    if (this.mobileComposerOpen) {
      const screen = parent.createDiv({ cls: "belki-mobile-quick-add-screen" });
      const header = screen.createDiv({ cls: "belki-mobile-quick-add-screen-header" });
      const backButton = header.createEl("button", {
        cls: "belki-mobile-quick-add-back",
        attr: { type: "button", "aria-label": "Back to tasks" }
      });
      createBelkiIcon(backButton, "back");
      backButton.addEventListener("click", () => this.closeMobileComposer());
      header.createDiv({ cls: "belki-mobile-quick-add-title", text: "Add task" });
      const closeButton = header.createEl("button", {
        cls: "belki-mobile-quick-add-close",
        attr: { type: "button", "aria-label": "Close add task" }
      });
      createBelkiIcon(closeButton, "close");
      closeButton.addEventListener("click", () => this.closeMobileComposer());

      const body = screen.createDiv({ cls: "belki-mobile-quick-add-body" });
      this.renderAddTaskComposer(body, () => {
        this.closeMobileComposer();
      });
      return;
    }

    const button = parent.createEl("button", {
      cls: "belki-mobile-quick-add-button",
      attr: { type: "button", "aria-label": "Add task" }
    });
    createBelkiIcon(button, "add");
    button.addEventListener("click", () => this.openAddComposer());
  }

  private shouldShowContextualAddTask(): boolean {
    if (this.mode === "projects") {
      return Boolean(this.selectedProject);
    }

    return this.mode === "inbox" || this.mode === "today" || this.mode === "upcoming";
  }

  private getComposerDefaultDue(): string | undefined {
    if (this.mode === "today") {
      return todayIso();
    }

    if (this.mode === "upcoming") {
      return addDaysIso(1);
    }

    return undefined;
  }

  private groupTasks(tasks: BelkiTask[]): Map<string, BelkiTask[]> {
    const result = new Map<string, BelkiTask[]>();

    if (this.settings.groupBy === "label") {
      const noLabel: BelkiTask[] = [];
      for (const task of tasks) {
        if (task.labels.length === 0) {
          noLabel.push(task);
        } else {
          const key = task.labels[0];
          if (!result.has(key)) result.set(key, []);
          result.get(key)!.push(task);
        }
      }
      if (noLabel.length > 0) result.set("No label", noLabel);
    } else if (this.settings.groupBy === "priority") {
      const order: Priority[] = ["P1", "P2", "P3", "P4"];
      const buckets = new Map<Priority, BelkiTask[]>();
      for (const task of tasks) {
        const p = isDefaultPriority(task.priority) ? "P4" : task.priority;
        if (!buckets.has(p)) buckets.set(p, []);
        buckets.get(p)!.push(task);
      }
      for (const p of order) {
        if (buckets.has(p) && buckets.get(p)!.length > 0) {
          const label = p === "P4" ? "Priority" : getPriorityLabel(p);
          result.set(label, buckets.get(p)!);
        }
      }
    }

    return result;
  }

  private renderSortingControl(parent: HTMLElement): void {
    const wrapper = parent.createDiv({ cls: "belki-sorting" });
    const button = wrapper.createEl("button", {
      cls: "belki-sorting-button",
      attr: {
        type: "button",
        "aria-haspopup": "menu",
        "aria-expanded": String(this.sortPopoverOpen)
      }
    });
    createBelkiIcon(button, "sorting", { className: "belki-sorting-icon" });
    button.createSpan({ text: "Sorting" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sortPopoverOpen = !this.sortPopoverOpen;
      this.render();
    });

    if (!this.sortPopoverOpen) {
      return;
    }

    const popover = wrapper.createDiv({ cls: "belki-sorting-popover" });
    popover.createDiv({ cls: "belki-sorting-title", text: "Sort by" });
    for (const option of SORT_OPTIONS) {
      const item = popover.createEl("button", {
        cls: "belki-sorting-option",
        attr: {
          type: "button",
          role: "menuitemradio",
          "aria-checked": String(this.settings.sortMode === option.mode)
        }
      });
      item.toggleClass("is-active", this.settings.sortMode === option.mode);
      item.createSpan({
        cls: "belki-sorting-check",
        text: this.settings.sortMode === option.mode ? "✓" : ""
      });
      item.createSpan({ text: option.label });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.settings.sortMode = option.mode;
        this.sortPopoverOpen = false;
        void (async () => {
          await this.saveSettings();
          this.render();
        })();
      });
    }

    if (this.mode === "projects") {
      popover.createDiv({ cls: "belki-sorting-divider" });
      popover.createDiv({ cls: "belki-sorting-title", text: "Group by" });
      const GROUP_OPTIONS: { label: string; value: "none" | "label" | "priority" }[] = [
        { label: "None", value: "none" },
        { label: "Label", value: "label" },
        { label: "Priority", value: "priority" }
      ];
      for (const opt of GROUP_OPTIONS) {
        const item = popover.createEl("button", {
          cls: "belki-sorting-option",
          attr: { type: "button", role: "menuitemradio", "aria-checked": String(this.settings.groupBy === opt.value) }
        });
        item.toggleClass("is-active", this.settings.groupBy === opt.value);
        item.createSpan({ cls: "belki-sorting-check", text: this.settings.groupBy === opt.value ? "✓" : "" });
        item.createSpan({ text: opt.label });
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.settings.groupBy = opt.value;
          this.sortPopoverOpen = false;
          void (async () => {
            await this.saveSettings();
            this.render();
          })();
        });
      }
    }
  }

  private renderTaskSections(parent: HTMLElement, allTasks: BelkiTask[]): void {
    parent.empty();

    const active = this.getActiveTopLevelTasks(allTasks);

    if (this.mode === "today") {
      const todayTasks = this.sortTasks(active.filter((task) => isToday(task.due)));

      const todaySection = this.createSection(parent, formatGroupHeader(todayIso()), todayTasks.length);
      this.enableTodayDrop(todaySection);
      this.renderTaskList(todaySection, todayTasks);

      const overdue = this.sortTasks(this.getOverdueTasks(active));
      const hasAnyOverdue = active.some((task) => task.due && task.due < todayIso());

      if (hasAnyOverdue) {
        const section = this.createSection(parent, "Overdue", overdue.length, (header) => {
          this.renderOverdueRangeSelect(header);
        });
        this.renderTaskList(section, overdue);
      }
      return;
    }

    if (this.mode === "upcoming") {
      const groups = groupByDueDate(
        active.filter((task) => isAfterToday(task.due))
      );

      for (const [date, tasks] of groups) {
        const section = this.createSection(parent, formatGroupHeader(date), tasks.length);
        this.enableDueDateDrop(section, date);
        this.renderTaskList(section, this.sortTasks(tasks));
      }

      if (groups.length === 0) {
        this.renderEmptySection(parent, "No upcoming tasks.");
      }
      return;
    }

    if (this.mode === "projects") {
      const projects = this.selectedProject
        ? [this.selectedProject]
        : this.getActiveProjects();

      if (projects.length === 0) {
        this.renderEmptySection(parent, "No projects yet.");
        return;
      }

      for (const project of projects) {
        const projectTasks = this.sortTasks(
          active.filter((task) => normalizeTaskProject(task.project) === project)
        );

        if (this.settings.groupBy === "none") {
          const section = this.createSection(parent, project, projectTasks.length, (header) => {
            this.renderProjectActionsButton(header, project);
          });
          this.enableProjectDrop(section, project);
          this.renderTaskList(section, projectTasks);
        } else {
          // Project header (no task count — shown per-group below)
          const projectSection = this.createSection(parent, project, projectTasks.length, (header) => {
            this.renderProjectActionsButton(header, project);
          });
          this.enableProjectDrop(projectSection, project);

          const groups = this.groupTasks(projectTasks);
          for (const [groupName, groupTasks] of groups) {
            const sub = projectSection.createDiv({ cls: "belki-task-group" });
            sub.createDiv({ cls: "belki-task-group-label", text: groupName });
            this.renderTaskList(sub, groupTasks);
          }
        }
      }
      return;
    }

    if (this.mode === "archived") {
      this.renderArchivedProjectsView(parent, allTasks);
      return;
    }

    if (this.mode === "filters") {
      this.renderFiltersAndLabels(parent, allTasks);
      return;
    }

    if (this.mode === "activity") {
      this.renderActivityView(parent, allTasks);
      return;
    }

    if (this.mode === "daily-note") {
      this.renderDailyNoteView(parent);
      return;
    }

    if (this.mode === "completed") {
      this.renderCompletedView(parent, allTasks);
      return;
    }

    const visible = this.getVisibleTasks(allTasks);
    const section = this.createSection(parent, this.getTitle(), visible.length);
    this.renderTaskList(section, visible);
  }

  private renderCompletedView(parent: HTMLElement, allTasks: BelkiTask[]): void {
    const completed = this.getCompletedDisplayTasks(allTasks);

    if (completed.length === 0) {
      this.renderEmptySection(parent, "No completed tasks yet.");
      return;
    }

    const groups = new Map<string, BelkiTask[]>();
    const noDate: BelkiTask[] = [];

    for (const task of completed) {
      const date = task.completedDate;
      if (date) {
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(task);
      } else {
        noDate.push(task);
      }
    }

    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));

    for (const date of sortedDates) {
      const tasks = groups.get(date)!;
      const section = this.createSection(parent, formatCompletedHeader(date), tasks.length);
      this.renderTaskList(section, tasks);
    }

    if (noDate.length > 0) {
      const section = this.createSection(parent, "Earlier", noDate.length);
      this.renderTaskList(section, noDate);
    }
  }

  private renderActivityView(parent: HTMLElement, allTasks: BelkiTask[]): void {
    const data = this.getActivityData(allTasks);
    const selectedDate = this.activitySelectedDate || data.defaultSelectedDate || todayIso();
    const selectedTasks = data.byDate.get(selectedDate) || [];

    const activity = parent.createDiv({ cls: "belki-activity" });

    if (data.allTimeCount === 0) {
      activity.createDiv({
        cls: "belki-activity-empty",
        text: "No completed tasks yet. Complete a task and your activity will appear here."
      });
      return;
    }

    const dashboard = activity.createDiv({ cls: "belki-activity-dashboard" });
    const dashboardTop = dashboard.createDiv({ cls: "belki-activity-dashboard-top" });
    dashboardTop.createSpan({ cls: "belki-activity-tab is-active", text: "Overview" });

    const summary = dashboard.createDiv({ cls: "belki-activity-summary" });
    this.renderActivitySummaryCard(summary, "Today", data.todayCount);
    this.renderActivitySummaryCard(summary, "Yesterday", data.yesterdayCount);
    this.renderActivitySummaryCard(summary, "This week", data.weekCount);
    this.renderActivitySummaryCard(summary, "This month", data.monthCount);
    this.renderActivitySummaryCard(summary, "All time", data.allTimeCount);
    this.renderActivitySummaryCard(summary, "Current streak", `${data.currentStreak}d`);

    const heatmapSection = dashboard.createDiv({ cls: "belki-activity-panel" });
    const heatmapHeader = heatmapSection.createDiv({ cls: "belki-activity-panel-header" });
    heatmapHeader.createEl("h2", { text: "Completed tasks" });
    heatmapHeader.createSpan({ text: "Last 26 weeks" });

    const heatmapScroller = heatmapSection.createDiv({ cls: "belki-activity-heatmap-scroll" });
    const heatmap = heatmapScroller.createDiv({ cls: "belki-activity-heatmap" });
    for (const day of data.heatmapDays) {
      const cell = heatmap.createEl("button", {
        cls: `belki-activity-day level-${day.level}`,
        attr: {
          type: "button",
          title: `${formatActivityDate(day.date)} · ${day.count} completed`,
          "aria-label": `${formatActivityDate(day.date)}: ${day.count} completed tasks`
        }
      });
      cell.toggleClass("is-selected", day.date === selectedDate);
      cell.addEventListener("click", () => {
        this.activitySelectedDate = day.date;
        this.renderPreservingMainScroll();
      });
    }

    const feed = activity.createDiv({ cls: "belki-activity-feed" });
    const feedHeader = feed.createDiv({ cls: "belki-activity-feed-header" });
    feedHeader.createEl("h2", {
      text: formatActivityDayHeading(selectedDate, selectedTasks.length)
    });

    if (selectedTasks.length === 0) {
      feed.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "No tasks completed on this day."
      });
      return;
    }

    const list = feed.createDiv({ cls: "belki-activity-list" });
    for (const task of selectedTasks) {
      this.renderActivityFeedRow(list, task);
    }
  }

  private renderDailyNoteView(parent: HTMLElement): void {
    const date = this.dailyNoteDate;
    const daily = parent.createDiv({ cls: "belki-daily-note" });

    if (!date) {
      daily.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "Open a daily note and run the belki Daily Notes command to see completed tasks."
      });
      return;
    }

    const tasks = this.store.getCompletedTasksForDate(date);
    const panel = daily.createDiv({ cls: "belki-daily-note-panel" });
    const header = panel.createDiv({ cls: "belki-daily-note-header" });
    header.createEl("h2", {
      text: formatActivityDayHeading(date, tasks.length)
    });
    header.createSpan({
      text: tasks.length === 1 ? "1 completed task" : `${tasks.length} completed tasks`
    });

    if (this.dailyNoteSourcePath) {
      panel.createDiv({
        cls: "belki-daily-note-source",
        text: this.dailyNoteSourcePath
      });
    }

    if (tasks.length === 0) {
      panel.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "No tasks completed on this daily note date."
      });
      return;
    }

    const list = panel.createDiv({ cls: "belki-activity-list" });
    for (const task of tasks) {
      this.renderActivityFeedRow(list, task);
    }
  }

  private renderActivitySummaryCard(
    parent: HTMLElement,
    label: string,
    value: number | string
  ): void {
    const card = parent.createDiv({ cls: "belki-activity-card" });
    card.createDiv({ cls: "belki-activity-card-count", text: String(value) });
    card.createDiv({
      cls: "belki-activity-card-label",
      text: label
    });
  }

  private renderActivityFeedRow(parent: HTMLElement, task: BelkiTask): void {
    const row = parent.createDiv({ cls: "belki-activity-row" });
    row.setAttr("role", "button");
    row.setAttr("tabindex", "0");
    row.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      this.openTaskDetail(task);
    });
    row.addEventListener("keydown", (event) => {
      if (event.target !== row) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openTaskDetail(task);
      }
    });

    const title = row.createDiv({ cls: "belki-activity-row-title" });
    title.createSpan({ text: "You completed " });
    renderLinkedText(task.title, title.createSpan({ cls: "belki-activity-task-title" }), {
      app: this.app,
      sourcePath: task.sourcePath
    });

    const meta = row.createDiv({ cls: "belki-activity-row-meta" });
    const project = normalizeTaskProject(task.project);
    if (project) {
      const projectColor = getProjectColor(project, this.settings.projectColors);
      const projectChip = meta.createSpan({ cls: "belki-activity-project-chip" });
      projectChip.setCssStyles({ backgroundColor: projectColor.light });
      projectChip
        .createSpan({ cls: "belki-project-dot" })
        .setCssStyles({ backgroundColor: projectColor.regular });
      projectChip.createSpan({ text: project });
    }

    if (hasVisiblePriority(task.priority)) {
      meta.createSpan({
        cls: `belki-activity-priority ${getPriorityClass(task.priority)}`,
        text: getPriorityDisplayLabel(task.priority)
      });
    }

    for (const label of task.labels) {
      const chip = meta.createSpan({ cls: "belki-activity-label", text: displayLabel(label) });
      const labelColor = getLabelColor(label, this.settings.labelColors);
      chip.setCssStyles({
        borderColor: labelColor.light,
        backgroundColor: labelColor.light
      });
    }

    if (meta.childElementCount === 0) {
      meta.createSpan({ text: "Completed" });
    }
  }

  private getActivityData(allTasks: BelkiTask[]): ActivityData {
    const signature = getActivityDataSignature(allTasks);
    if (this.activityCache?.signature === signature) {
      return this.activityCache.data;
    }

    const data = buildActivityData(allTasks);
    this.activityCache = { signature, data };
    return data;
  }

  private renderFiltersAndLabels(parent: HTMLElement, allTasks: BelkiTask[]): void {
    renderFiltersAndLabelsView({
      parent,
      activeFilter: this.activeFilter,
      activeLabel: this.activeLabel,
      filterDefinitions: this.getFilterDefinitions(allTasks),
      activeFilterTasks: this.getActiveFilterTasks(allTasks),
      labels: this.getAllLabels(),
      labelColors: this.settings.labelColors,
      labelActionsOpen: this.labelActionsOpen,
      hasLabelMenu: Boolean(this.labelMenuEl),
      sortTasks: (tasks) => this.sortTasks(tasks),
      createSection: (sectionParent, title, count) =>
        this.createSection(sectionParent, title, count),
      renderTaskList: (section, tasks) => this.renderTaskList(section, tasks),
      onBackToFilters: () => {
        this.activeFilter = null;
        this.activeLabel = null;
        this.render();
      },
      onSelectFilter: (filterId) => {
        this.activeFilter = filterId;
        this.activeLabel = null;
        this.render();
      },
      onSelectLabel: (label) => {
        this.activeLabel = label;
        this.activeFilter = null;
        this.closeLabelActionsMenu();
        this.render();
      },
      onCreateLabel: () => this.createLabelFromPrompt(),
      onOpenLabelActions: (button, label, taskCount) => {
        this.openLabelActionsMenu(button, label, taskCount);
      },
      onCloseLabelActions: () => this.closeLabelActionsMenu(),
      onRenameLabel: (label) => this.openRenameLabelModal(label),
      onDeleteLabel: (label, taskCount) => this.openDeleteLabelModal(label, taskCount)
    });
  }

  private openLabelActionsMenu(button: HTMLElement, label: string, taskCount: number): void {
    this.removeLabelMenu();
    this.labelActionsOpen = label;
    openLabelActionsMenuElement({
      button,
      label,
      onMenuCreated: (menu) => {
        this.labelMenuEl = menu;
      },
      onRename: () => this.openRenameLabelModal(label),
      onDelete: () => this.openDeleteLabelModal(label, taskCount)
    });
  }

  private openRenameLabelModal(label: string): void {
    this.closeLabelActionsMenu();
    new RenameLabelModal(this.app, label, this.getAllLabels(), async (newLabel) => {
      await this.renameLabel(label, newLabel);
    }).open();
  }

  private openDeleteLabelModal(label: string, taskCount: number): void {
    this.closeLabelActionsMenu();
    new DeleteLabelModal(this.app, label, taskCount, async () => {
      await this.deleteLabel(label);
    }).open();
  }

  private createSection(
    parent: HTMLElement,
    title: string,
    count: number,
    renderHeaderAction?: (header: HTMLElement) => void
  ): HTMLElement {
    const section = parent.createDiv({ cls: "belki-section" });
    const header = section.createDiv({ cls: "belki-section-header" });
    header.createEl("h2", { text: title });
    header.createSpan({ cls: "belki-section-count", text: String(count) });
    renderHeaderAction?.(header);
    return section;
  }

  private getActiveProjects(): string[] {
    const archivedSet = new Set(this.settings.archivedProjects);
    return this.getKnownProjects().filter((p) => !archivedSet.has(p));
  }

  private getKnownProjects(): string[] {
    return uniqueRealProjects([
      this.settings.defaultProject,
      ...this.store.getProjects(),
      ...Object.keys(this.settings.projectColors),
      ...this.settings.projectRegistry
    ]);
  }

  private ensureProjectInRegistry(project: string | undefined): void {
    const normalized = normalizeTaskProject(project);
    if (!normalized) return;
    if (this.settings.projectRegistry.includes(normalized)) return;
    this.settings.projectRegistry = [...this.settings.projectRegistry, normalized]
      .sort((a, b) => a.localeCompare(b));
  }

  private renderProjectActionsButton(header: HTMLElement, project: string): void {
    const cleanup = renderProjectActionsMenu({
      header,
      isOpen: this.projectActionsOpen === project,
      onToggle: () => {
        this.projectActionsOpen = this.projectActionsOpen === project ? null : project;
        this.render();
      },
      onClose: () => {
        this.closeProjectActionsMenu();
      },
      onMenuCreated: (menu) => {
        this.projectMenuEl = menu;
      },
      onRename: () => {
        this.closeProjectActionsMenu();
        new RenameProjectModal(this.app, project, this.getActiveProjects(), async (newName) => {
          await this.store.renameProject(project, newName);
          if (this.selectedProject === project) this.selectedProject = newName;
          const preservedColor = this.settings.projectColors[project];
          if (preservedColor) {
            this.settings.projectColors[newName] = preservedColor;
            delete this.settings.projectColors[project];
          }
          this.settings.projectRegistry = this.settings.projectRegistry.map((p) =>
            p === project ? newName : p
          );
          await this.saveSettings();
          this.render();
        }).open();
      },
      onArchive: () => {
        this.closeProjectActionsMenu();
        this.settings.archivedProjects = [...this.settings.archivedProjects, project];
        if (this.selectedProject === project) {
          this.selectedProject = null;
          this.mode = "projects";
        }
        void this.saveSettings().then(() => this.render());
      },
      onDelete: () => {
        this.closeProjectActionsMenu();
        const taskCount = this.store.getTasks().filter(
          (task) => normalizeTaskProject(task.project) === project
        ).length;
        new DeleteProjectModal(this.app, project, taskCount, async () => {
          await this.store.deleteProject(project);
          delete this.settings.projectColors[project];
          this.settings.projectRegistry = this.settings.projectRegistry.filter((p) => p !== project);
          if (this.selectedProject === project) {
            this.selectedProject = null;
            this.mode = "projects";
          }
          await this.saveSettings();
          this.render();
        }).open();
      }
    });
    if (cleanup) {
      this.projectMenuCleanup = cleanup;
    }
  }

  private renderArchivedProjectsView(parent: HTMLElement, allTasks: BelkiTask[]): void {
    const archivedProjects = this.settings.archivedProjects;

    if (archivedProjects.length === 0) {
      this.renderEmptySection(parent, "No archived projects.");
      return;
    }

    for (const project of archivedProjects) {
      const projectTasks = allTasks.filter(
        (task) => normalizeTaskProject(task.project) === project
      );
      const section = this.createSection(parent, project, projectTasks.length, (header) => {
        const badge = header.createSpan({ cls: "belki-archived-badge", text: "Archived" });
        badge.setCssStyles({ marginLeft: "auto" });
        const restoreBtn = header.createEl("button", {
          cls: "belki-button belki-restore-button",
          text: "Restore",
          attr: { type: "button" }
        });
        restoreBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.settings.archivedProjects = this.settings.archivedProjects.filter((p) => p !== project);
          void this.saveSettings().then(() => this.render());
        });
      });
      this.renderTaskList(section, this.sortTasks(projectTasks));
    }
  }

  private renderOverdueRangeSelect(parent: HTMLElement): void {
    const select = parent.createEl("select", {
      cls: "belki-overdue-range-select",
      attr: {
        "aria-label": "Overdue range"
      }
    });

    for (const range of OVERDUE_RANGES) {
      select.createEl("option", {
        text: overdueRangeLabel(range),
        value: range
      });
    }

    select.value = this.settings.defaultOverdueRange;
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      this.settings.defaultOverdueRange = normalizeOverdueRange(select.value);
      void (async () => {
        await this.saveSettings();
        this.renderPreservingMainScroll();
      })();
    });
  }

  private enableTodayDrop(section: HTMLElement): void {
    section.addClass("belki-drop-zone");
    section.addEventListener("dragover", (event) => {
      const task = this.getDraggedTask(event);
      if (!task || task.completed || isToday(task.due) || !isBeforeToday(task.due)) {
        return;
      }

      event.preventDefault();
      section.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    section.addEventListener("dragleave", (event) => {
      if (
        event.relatedTarget instanceof Node &&
        section.contains(event.relatedTarget)
      ) {
        return;
      }

      section.removeClass("is-drop-target");
    });
    section.addEventListener("drop", (event) => {
      const task = this.getDraggedTask(event);
      this.clearDropTargets();
      if (!task || task.completed || isToday(task.due) || !isBeforeToday(task.due)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void this.store.updateTask(task.id, { due: todayIso() });
    });
  }

  private enableProjectDrop(button: HTMLElement, project: string): void {
    button.addClass("belki-project-drop-zone");
    button.dataset.project = project;
    button.addEventListener("dragover", (event) => {
      const task = this.getDraggedTask(event);
      if (!task || task.completed || normalizeTaskProject(task.project) === project) {
        return;
      }

      event.preventDefault();
      button.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    button.addEventListener("dragleave", (event) => {
      if (
        event.relatedTarget instanceof Node &&
        button.contains(event.relatedTarget)
      ) {
        return;
      }

      button.removeClass("is-drop-target");
    });
    button.addEventListener("drop", (event) => {
      const task = this.getDraggedTask(event);
      this.clearDropTargets();
      if (!task || task.completed || normalizeTaskProject(task.project) === project) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void this.store.updateTask(task.id, { project });
    });
  }

  private enableDueDateDrop(section: HTMLElement, due: string): void {
    section.addClass("belki-date-drop-zone");
    section.dataset.due = due;
    section.addEventListener("dragover", (event) => {
      const task = this.getDraggedTask(event);
      if (!task || task.completed || task.due === due) {
        return;
      }

      event.preventDefault();
      section.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    section.addEventListener("dragleave", (event) => {
      if (
        event.relatedTarget instanceof Node &&
        section.contains(event.relatedTarget)
      ) {
        return;
      }

      section.removeClass("is-drop-target");
    });
    section.addEventListener("drop", (event) => {
      const task = this.getDraggedTask(event);
      this.clearDropTargets();
      if (!task || task.completed || task.due === due) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void this.store.updateTask(task.id, { due });
    });
  }

  private clearDropTargets(): void {
    this.containerEl
      .querySelectorAll<HTMLElement>(".is-drop-target, .is-drop-available")
      .forEach((element) => {
        element.removeClass("is-drop-target");
        element.removeClass("is-drop-available");
      });
  }

  private showDropTargets(task: BelkiTask): void {
    this.clearDropTargets();
    for (const projectTarget of Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(".belki-project-drop-zone")
    )) {
      if (normalizeTaskProject(task.project) !== projectTarget.dataset.project) {
        projectTarget.addClass("is-drop-available");
      }
    }

    if (!task.completed && !isToday(task.due) && isBeforeToday(task.due)) {
      this.containerEl
        .querySelector<HTMLElement>(".belki-drop-zone")
        ?.addClass("is-drop-available");
    }

    for (const dateTarget of Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(".belki-date-drop-zone")
    )) {
      if (task.due !== dateTarget.dataset.due) {
        dateTarget.addClass("is-drop-available");
      }
    }
  }

  private createDragImage(row: HTMLElement): HTMLElement {
    const dragImage = row.cloneNode(true) as HTMLElement;
    dragImage.addClass("belki-drag-preview");
    dragImage.setCssStyles({
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      width: `${row.offsetWidth}px`
    });
    activeDocument.body.appendChild(dragImage);
    return dragImage;
  }

  private getDraggedTask(event: DragEvent): BelkiTask | undefined {
    const taskId =
      this.draggedTaskId ||
      event.dataTransfer?.getData("application/x-belki-task-id") ||
      event.dataTransfer?.getData("text/plain");
    if (!taskId) {
      return undefined;
    }

    return this.store.getTasks().find((task) => task.id === taskId);
  }

  private hasDragTarget(task: BelkiTask): boolean {
    if (task.completed) {
      return false;
    }

    const canMoveToToday = !isToday(task.due) && isBeforeToday(task.due);
    const canMoveToUpcomingDate =
      this.mode === "upcoming" &&
      this.getUpcomingDropDates().some((date) => date !== task.due);
    const currentProject = normalizeTaskProject(task.project);
    const canMoveToProject = this.getActiveProjects()
      .some((project) => project !== currentProject);

    return canMoveToToday || canMoveToUpcomingDate || canMoveToProject;
  }

  private renderEmptySection(parent: HTMLElement, text: string): void {
    const section = parent.createDiv({ cls: "belki-section" });
    section.createDiv({ cls: "belki-empty", text });
  }

  private renderTaskList(parent: HTMLElement, tasks: BelkiTask[]): void {
    const list = parent.createDiv({ cls: "belki-task-list" });

    if (tasks.length === 0) {
      list.createDiv({ cls: "belki-empty belki-empty-small", text: "Nothing here." });
      return;
    }

    const subTasksByParent = new Map<string, BelkiTask[]>();
    for (const task of this.store.getTasks()) {
      if (!task.parentId) continue;
      const subTasks = subTasksByParent.get(task.parentId) || [];
      subTasks.push(task);
      subTasksByParent.set(task.parentId, subTasks);
    }

    for (const task of tasks) {
      const subTasks = (subTasksByParent.get(task.id) || []).sort(byOrder);
      this.renderTaskItem(list, task, subTasks);
    }
  }

  private renderTaskItem(parent: HTMLElement, task: BelkiTask, subTasks: BelkiTask[]): void {
    const item = parent.createDiv({ cls: "belki-task-item" });
    item.toggleClass("has-subtasks", subTasks.length > 0);
    item.toggleClass("is-subtasks-expanded", this.expandedSubtaskPreviewIds.has(task.id));
    this.renderTaskRow(item, task, subTasks);

    if (subTasks.length > 0 && this.expandedSubtaskPreviewIds.has(task.id)) {
      this.renderSubtaskPreview(item, subTasks);
    }
  }

  private renderTaskRow(parent: HTMLElement, task: BelkiTask, subTasks: BelkiTask[] = []): void {
    const row = parent.createDiv({ cls: "belki-task-row" });
    row.dataset.taskId = task.id;
    row.toggleClass("is-completed", task.completed);
    row.toggleClass("is-highlighted", this.highlightedTaskId === task.id);
    row.toggleClass("has-subtasks", subTasks.length > 0);
    row.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      this.openTaskDetail(task);
    });

    const dragHandle = row.createEl("button", {
      cls: "belki-task-drag-handle",
      attr: {
        type: "button",
        "aria-label": `Drag ${task.title}`
      }
    });
    createBelkiIcon(dragHandle, "dragHandle");
    if (task.completed || !this.hasDragTarget(task)) {
      dragHandle.addClass("is-disabled");
      dragHandle.setAttr("disabled", "true");
    } else {
      dragHandle.setAttr("draggable", "true");
      dragHandle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      dragHandle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        this.draggedTaskId = task.id;
        const dragImage = this.createDragImage(row);
        row.addClass("is-dragging");
        event.dataTransfer?.setData("application/x-belki-task-id", task.id);
        event.dataTransfer?.setData("text/plain", task.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(dragImage, 24, 24);
        }
        this.showDropTargets(task);
        window.setTimeout(() => dragImage.remove(), 0);
      });
      dragHandle.addEventListener("dragend", () => {
        this.draggedTaskId = null;
        row.removeClass("is-dragging");
        this.clearDropTargets();
      });
    }

    const checkbox = row.createEl("button", {
      cls: `belki-task-checkbox ${getPriorityClass(task.priority)}`,
      attr: {
        type: "button",
        "aria-label": task.completed ? "Mark task incomplete" : "Complete task"
      }
    });
    const checkboxPriorityColor = getPriorityColor(task.priority);
    checkbox.setCssProps({
      "--belki-priority-text": checkboxPriorityColor.color,
      "--belki-priority-bg": checkboxPriorityColor.light
    });
    checkbox.toggleClass("is-checked", task.completed);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.store.toggleComplete(task.id);
    });

    const content = row.createDiv({ cls: "belki-task-content" });
    renderLinkedText(task.title, content.createDiv({ cls: "belki-task-title" }), {
      app: this.app,
      sourcePath: task.sourcePath
    });

    if (task.description) {
      renderLinkedText(
        markdownPreviewText(task.description),
        content.createDiv({ cls: "belki-task-description" }),
        {
          app: this.app,
          sourcePath: task.sourcePath
        }
      );
    }

    const meta = content.createDiv({ cls: "belki-task-meta" });
    if (task.due) {
      const dateSpan = meta.createSpan({
        cls: `belki-task-date${isBeforeToday(task.due) ? " is-overdue" : ""}`,
        text: formatDueChip(task.due)
      });
      if (task.repeat) {
        createBelkiIcon(dateSpan, "recurring", { className: "belki-task-repeat-icon" });
      }
    }
    if (task.deadline) {
      meta.createSpan({
        cls: `belki-task-deadline${isBeforeToday(task.deadline) ? " is-overdue" : ""}`,
        text: `Deadline ${formatShortDate(task.deadline)}`
      });
    }
    if (task.labels.length > 0) {
      for (const label of task.labels) {
        const chip = meta.createSpan({ cls: "belki-task-label", text: displayLabel(label) });
        const labelColor = getLabelColor(label, this.settings.labelColors);
        chip.setCssStyles({
          borderColor: labelColor.light,
          backgroundColor: labelColor.light
        });
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          this.mode = "filters";
          this.activeLabel = label;
          this.activeFilter = null;
          this.selectedProject = null;
          this.render();
        });
      }
    }
    if (task.attachments.length > 0) {
      const attachmentEl = meta.createSpan({ cls: "belki-task-attachments" });
      createBelkiIcon(attachmentEl, "attachment", { className: "belki-chip-icon" });
      attachmentEl.createSpan({ text: String(task.attachments.length) });
    }
    if (subTasks.length > 0) {
      const isExpanded = this.expandedSubtaskPreviewIds.has(task.id);
      const done = subTasks.filter((t) => t.completed).length;
      const counterEl = meta.createEl("button", {
        cls: "belki-task-subtask-counter",
        attr: {
          type: "button",
          "aria-label": isExpanded ? "Collapse sub-tasks" : "Expand sub-tasks",
          "aria-expanded": String(isExpanded)
        }
      });
      counterEl.toggleClass("is-expanded", isExpanded);
      createBelkiIcon(counterEl, "subtasks", { className: "belki-chip-icon" });
      counterEl.createSpan({ text: `${done}/${subTasks.length}` });
      counterEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleSubtaskPreview(task.id, parent, subTasks);
      });
    }

    if (!task.completed && task.completedOccurrences && task.completedOccurrences.length > 0) {
      const last = task.completedOccurrences[task.completedOccurrences.length - 1];
      const lastSpan = meta.createSpan({ cls: "belki-task-last-completed" });
      createBelkiIcon(lastSpan, "completed", { className: "belki-chip-icon" });
      lastSpan.createSpan({ text: formatDueChip(last) });
    }

    const project = normalizeTaskProject(task.project);
    if (project) {
      const projectColor = getProjectColor(project, this.settings.projectColors);
      const projectChip = row.createDiv({ cls: "belki-task-project" });
      projectChip.setCssStyles({ backgroundColor: projectColor.light });
      projectChip
        .createSpan({ cls: "belki-project-dot" })
        .setCssStyles({ backgroundColor: projectColor.regular });
      projectChip.createSpan({ text: project });
    }

    renderTaskActions({
      row,
      task,
      onOpenMenu: (button) => {
        this.toggleTaskActionMenu(task, button);
      },
      onDelete: () => {
        void this.store.deleteTask(task.id);
      }
    });
  }

  private toggleSubtaskPreview(taskId: string, item?: HTMLElement, subTasks?: BelkiTask[]): void {
    const willExpand = !this.expandedSubtaskPreviewIds.has(taskId);
    if (willExpand) {
      this.expandedSubtaskPreviewIds.add(taskId);
    } else {
      this.expandedSubtaskPreviewIds.delete(taskId);
    }

    if (item && subTasks) {
      item.toggleClass("is-subtasks-expanded", willExpand);
      item.querySelector(":scope > .belki-task-subtask-preview")?.remove();

      const expandButton = item.querySelector<HTMLElement>(".belki-task-expand-toggle");
      if (expandButton) {
        expandButton.empty();
        expandButton.setAttr("aria-label", willExpand ? "Collapse sub-tasks" : "Expand sub-tasks");
        expandButton.setAttr("aria-expanded", String(willExpand));
        createBelkiIcon(expandButton, willExpand ? "expand" : "collapse");
      }

      const counterEl = item.querySelector<HTMLElement>(".belki-task-subtask-counter");
      if (counterEl) {
        counterEl.toggleClass("is-expanded", willExpand);
        counterEl.setAttr("aria-label", willExpand ? "Collapse sub-tasks" : "Expand sub-tasks");
        counterEl.setAttr("aria-expanded", String(willExpand));
      }

      if (willExpand) {
        this.renderSubtaskPreview(item, subTasks);
      }
      return;
    }

    this.renderPreservingMainScroll();
  }

  private renderSubtaskPreview(parent: HTMLElement, subTasks: BelkiTask[]): void {
    const preview = parent.createDiv({ cls: "belki-task-subtask-preview" });

    for (const subTask of subTasks) {
      const row = preview.createDiv({ cls: "belki-task-subtask-preview-row" });
      row.dataset.taskId = subTask.id;
      row.toggleClass("is-completed", subTask.completed);
      row.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("a")) {
          return;
        }
        event.stopPropagation();
        this.openTaskDetail(subTask);
      });

      const checkbox = row.createEl("button", {
        cls: `belki-task-checkbox belki-subtask-preview-checkbox ${getPriorityClass(subTask.priority)}`,
        attr: {
          type: "button",
          "aria-label": subTask.completed ? "Mark sub-task incomplete" : "Complete sub-task"
        }
      });
      const checkboxPriorityColor = getPriorityColor(subTask.priority);
      checkbox.setCssProps({
        "--belki-priority-text": checkboxPriorityColor.color,
        "--belki-priority-bg": checkboxPriorityColor.light
      });
      checkbox.toggleClass("is-checked", subTask.completed);
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextCompleted = !subTask.completed;
        subTask.completed = nextCompleted;
        row.toggleClass("is-completed", nextCompleted);
        checkbox.toggleClass("is-checked", nextCompleted);
        this.updateSubtaskPreviewCounter(parent);
        this.suppressNextStoreRender = true;
        void this.store.toggleComplete(subTask.id).catch((error) => {
          console.error("[belki] Failed to toggle sub-task completion.", error);
          this.suppressNextStoreRender = false;
          this.renderPreservingMainScroll();
        });
      });

      const content = row.createDiv({ cls: "belki-subtask-preview-content" });
      renderLinkedText(subTask.title, content.createDiv({ cls: "belki-subtask-preview-title" }), {
        app: this.app,
        sourcePath: subTask.sourcePath
      });

      const meta = content.createDiv({ cls: "belki-subtask-preview-meta" });
      if (subTask.due) {
        meta.createSpan({
          cls: `belki-task-date${isBeforeToday(subTask.due) ? " is-overdue" : ""}`,
          text: formatDueChip(subTask.due)
        });
      }
      if (subTask.labels.length > 0) {
        for (const label of subTask.labels.slice(0, 3)) {
          const chip = meta.createSpan({ cls: "belki-task-label", text: displayLabel(label) });
          const labelColor = getLabelColor(label, this.settings.labelColors);
          chip.setCssStyles({
            borderColor: labelColor.light,
            backgroundColor: labelColor.light
          });
        }
      }
    }
  }

  private updateSubtaskPreviewCounter(item: HTMLElement): void {
    const counterEl = item.querySelector<HTMLElement>(".belki-task-subtask-counter");
    if (!counterEl) return;

    const total = item.querySelectorAll(".belki-task-subtask-preview-row").length;
    const done = item.querySelectorAll(".belki-task-subtask-preview-row.is-completed").length;
    const textEl = counterEl.querySelector<HTMLElement>("span:last-child");
    if (textEl) {
      textEl.textContent = `${done}/${total}`;
    }
  }

  private toggleTaskActionMenu(task: BelkiTask, trigger: HTMLElement): void {
    const wasOpen = this.taskActionsOpenId === task.id;
    this.removeTaskActionMenu();
    if (wasOpen) {
      return;
    }

    this.taskActionsOpenId = task.id;
    this.taskActionMenuEl = renderTaskActionMenu({
      container: this.containerEl,
      task,
      trigger,
      onMoveDue: (due) => {
        this.moveTaskDue(task, due);
      },
      onDelete: () => {
        this.removeTaskActionMenu();
        void this.store.deleteTask(task.id);
      }
    });
  }

  private moveTaskDue(task: BelkiTask, due: string | undefined): void {
    if (task.completed || task.due === due) {
      this.removeTaskActionMenu();
      return;
    }

    this.removeTaskActionMenu();
    void this.store.updateTask(task.id, { due });
  }

  private openTaskDetail(task: BelkiTask): void {
    new TaskDetailModal(this.app, {
      task,
      projects: this.getActiveProjects(),
      labels: this.getAllLabels(),
      settings: this.settings,
      store: this.store,
      onChange: () => this.renderPreservingMainScroll(),
      onProjectUsed: (project) => {
        this.ensureProjectInRegistry(project);
        void this.saveSettings();
      }
    }).open();
  }

  private getVisibleTasks(tasks: BelkiTask[]): BelkiTask[] {
    const active = this.getActiveTopLevelTasks(tasks);

    if (this.mode === "inbox") {
      return this.getInboxTasks(active);
    }

    if (this.mode === "today") {
      return this.getTodayTasks(active);
    }

    if (this.mode === "upcoming") {
      return this.getUpcomingTasks(active);
    }

    if (this.mode === "completed") {
      return this.getCompletedDisplayTasks(tasks);
    }

    if (this.mode === "activity") {
      return [];
    }

    if (this.mode === "daily-note") {
      return this.dailyNoteDate
        ? this.store.getCompletedTasksForDate(this.dailyNoteDate)
        : [];
    }

    if (this.mode === "projects") {
      return this.sortTasks(this.selectedProject
        ? active.filter((task) => normalizeTaskProject(task.project) === this.selectedProject)
        : active.filter((task) => Boolean(normalizeTaskProject(task.project)))
      );
    }

    if (this.mode === "archived") {
      return [];
    }

    if (this.mode === "filters") {
      if (this.activeFilter) {
        const definition = this.getFilterDefinitions(tasks).find(
          (filter) => filter.id === this.activeFilter
        );
        return definition ? definition.tasks : [];
      }

      if (this.activeLabel) {
        return this.sortTasks(
          this.getActiveFilterTasks(tasks).filter((task) => task.labels.includes(this.activeLabel || ""))
        );
      }

      return [];
    }

    if (this.mode === "search") {
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) {
        return [];
      }

      return tasks
        .filter((task) => searchableText(task).includes(query))
        .sort((a, b) => this.compareTasks(a, b));
    }

    return this.sortTasks(active);
  }

  private getInboxTasks(tasks: BelkiTask[]): BelkiTask[] {
    return this.sortTasks(
      tasks.filter((task) => !normalizeTaskProject(task.project))
    );
  }

  private getActiveTopLevelTasks(tasks: BelkiTask[]): BelkiTask[] {
    return this.getActiveFilterTasks(tasks).filter((task) => !task.parentId);
  }

  private getActiveFilterTasks(tasks: BelkiTask[]): BelkiTask[] {
    const archivedSet = new Set(this.settings.archivedProjects);
    return tasks.filter((task) =>
      !task.completed &&
      !archivedSet.has(normalizeTaskProject(task.project) || "")
    );
  }

  private getCompletedDisplayTasks(tasks: BelkiTask[]): BelkiTask[] {
    const archivedSet = new Set(this.settings.archivedProjects);
    return this.sortTasks(tasks.filter((task) =>
      task.completed &&
      !archivedSet.has(normalizeTaskProject(task.project) || "")
    ));
  }

  private getTodayTasks(tasks: BelkiTask[]): BelkiTask[] {
    const today = todayIso();
    return [
      ...tasks.filter((task) => task.due === today),
      ...this.getOverdueTasks(tasks)
    ]
      .sort((a, b) => {
        if (a.due && b.due && a.due !== b.due) {
          return compareIsoDates(b.due, a.due);
        }

        return this.compareTasks(a, b);
      });
  }

  private getOverdueTasks(tasks: BelkiTask[]): BelkiTask[] {
    return tasks.filter((task) => this.isInSelectedOverdueRange(task));
  }

  private isInSelectedOverdueRange(task: BelkiTask): boolean {
    if (task.completed || !task.due || task.due >= todayIso()) {
      return false;
    }

    if (this.settings.defaultOverdueRange === "yesterday") {
      return task.due === yesterdayIso();
    }

    if (this.settings.defaultOverdueRange === "last7") {
      return task.due >= addDaysIso(-7);
    }

    if (this.settings.defaultOverdueRange === "last30") {
      return task.due >= addDaysIso(-30);
    }

    return task.due < addDaysIso(-30);
  }

  private getUpcomingTasks(tasks: BelkiTask[]): BelkiTask[] {
    return tasks
      .filter((task) => isAfterToday(task.due))
      .sort((a, b) => {
        if (a.due && b.due && a.due !== b.due) {
          return compareIsoDates(a.due, b.due);
        }

        return this.compareTasks(a, b);
      });
  }

  private getUpcomingDropDates(): string[] {
    return [...new Set(
      this.store
        .getTasks()
        .filter((task) => !task.completed && isAfterToday(task.due))
        .map((task) => task.due)
        .filter((due): due is string => Boolean(due))
    )].sort(compareIsoDates);
  }

  private sortTasks(tasks: BelkiTask[]): BelkiTask[] {
    return [...tasks].sort((a, b) => this.compareTasks(a, b));
  }

  private compareTasks(a: BelkiTask, b: BelkiTask): number {
    return compareTasksByMode(a, b, this.settings.sortMode);
  }

  private getTitle(): string {
    if (this.mode === "inbox") {
      return "Inbox";
    }
    if (this.mode === "today") {
      return "Today";
    }
    if (this.mode === "upcoming") {
      return "Upcoming";
    }
    if (this.mode === "projects") {
      return this.selectedProject || "Projects";
    }
    if (this.mode === "completed") {
      return "Completed";
    }
    if (this.mode === "activity") {
      return "Activity";
    }
    if (this.mode === "daily-note") {
      return "Daily Note";
    }
    if (this.mode === "archived") {
      return "Archived projects";
    }
    if (this.mode === "filters") {
      if (this.activeFilter) {
        return this.getFilterDefinitions(this.store.getTasks()).find(
          (filter) => filter.id === this.activeFilter
        )?.name || "Filters & Labels";
      }
      if (this.activeLabel) {
        return displayLabel(this.activeLabel);
      }
      return "Filters & Labels";
    }

    return "Search";
  }

  private getFilterDefinitions(tasks: BelkiTask[]): FilterDefinition[] {
    const active = this.getActiveFilterTasks(tasks);
    const today = todayIso();

    const definitions = [
      {
        id: "p1",
        name: "Priority 1",
        icon: "priority",
        tasks: active.filter((task) => task.priority === "P1")
      },
      {
        id: "p2",
        name: "Priority 2",
        icon: "priority",
        tasks: active.filter((task) => task.priority === "P2")
      },
      {
        id: "p3",
        name: "Priority 3",
        icon: "priority",
        tasks: active.filter((task) => task.priority === "P3")
      },
      {
        id: "p4",
        name: "Priority",
        icon: "priority",
        tasks: active.filter((task) => isDefaultPriority(task.priority))
      },
      {
        id: "all",
        name: "View all",
        icon: "completed",
        tasks: active
      },
      {
        id: "no-due",
        name: "No due date",
        icon: "calendar",
        tasks: active.filter((task) => !task.due)
      },
      {
        id: "today",
        name: "Today",
        icon: "today",
        tasks: active.filter((task) => task.due === today)
      },
      {
        id: "overdue",
        name: "Overdue",
        icon: "overdue",
        tasks: active.filter((task) => task.due && task.due < today)
      },
      {
        id: "with-deadline",
        name: "With deadline",
        icon: "deadline",
        tasks: active.filter((task) => Boolean(task.deadline))
      },
      {
        id: "no-label",
        name: "No label",
        icon: "labels",
        tasks: active.filter((task) => task.labels.length === 0)
      }
    ];

    return definitions.map((definition) => ({
      ...definition,
      tasks: this.sortTasks(definition.tasks),
      count: definition.tasks.length
    }));
  }

  private renderSearchOverlay(parent: HTMLElement): void {
    const backdrop = parent.createDiv({ cls: "belki-search-backdrop" });
    const modal = backdrop.createDiv({ cls: "belki-search-modal" });
    const input = modal.createEl("input", {
      cls: "belki-search-input",
      attr: {
        type: "search",
        placeholder: "Search tasks...",
        value: this.searchQuery,
        autofocus: "true"
      }
    });
    const results = modal.createDiv({ cls: "belki-search-results" });
    let matches: BelkiTask[] = [];
    let selectedIndex = 0;

    const close = () => {
      this.searchOpen = false;
      this.searchQuery = "";
      this.render();
    };

    const openSelected = () => {
      const selected = matches[selectedIndex];
      if (selected) {
        this.openTaskLocation(selected);
      }
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(matches.length - 1, 0));
        renderResults();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderResults();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openSelected();
      }
    });
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      selectedIndex = 0;
      renderResults();
    });

    const renderResults = () => {
      results.empty();
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) {
        matches = [];
        results.createDiv({ cls: "belki-search-empty", text: "Type to search tasks" });
        return;
      }

      matches = this.store
        .getTasks()
        .filter((task) => searchableText(task).includes(query))
        .slice(0, 25);
      selectedIndex = Math.min(selectedIndex, Math.max(matches.length - 1, 0));

      if (matches.length === 0) {
        results.createDiv({ cls: "belki-search-empty", text: "No matching tasks." });
        return;
      }

      for (const [index, task] of matches.entries()) {
        const result = results.createEl("button", { cls: "belki-search-result" });
        result.toggleClass("is-selected", index === selectedIndex);
        result.createDiv({ cls: "belki-search-title", text: task.title });
        if (task.description) {
          renderLinkedText(
            markdownPreviewText(task.description),
            result.createDiv({ cls: "belki-search-description" }),
            {
              app: this.app,
              sourcePath: task.sourcePath
            }
          );
        }
        const meta = result.createDiv({ cls: "belki-search-meta" });
        meta.createSpan({ text: projectDisplayName(task.project) });
        if (task.due) {
          meta.createSpan({ text: formatDueChip(task.due) });
        }
        if (task.deadline) {
          meta.createSpan({ text: `Deadline ${formatShortDate(task.deadline)}` });
        }
        for (const label of task.labels) {
          meta.createSpan({ text: displayLabel(label) });
        }
        result.addEventListener("click", () => {
          this.openTaskLocation(task);
        });
      }
    };

    renderResults();
    window.setTimeout(() => input.focus(), 0);
  }

  private openTaskLocation(task: BelkiTask): void {
    this.searchOpen = false;
    this.searchQuery = "";
    this.composerOpen = false;
    this.mobileComposerOpen = false;
    this.mobileComposerReturnScroll = null;
    this.highlightedTaskId = task.id;

    if (task.completed) {
      this.mode = "completed";
      this.selectedProject = null;
    } else if (task.due === todayIso() || this.isInSelectedOverdueRange(task)) {
      this.mode = "today";
      this.selectedProject = null;
    } else if (task.due && isAfterToday(task.due)) {
      this.mode = "upcoming";
      this.selectedProject = null;
    } else if (!normalizeTaskProject(task.project)) {
      this.mode = "inbox";
      this.selectedProject = null;
    } else {
      this.mode = "projects";
      this.selectedProject = normalizeTaskProject(task.project) || null;
    }

    this.render();
  }

  private getAllLabels(): string[] {
    const labels: string[] = [];
    labels.push(...this.settings.labelRegistry);
    for (const task of this.store.getTasks()) {
      for (const label of task.labels) {
        labels.push(label);
      }
    }
    for (const label of Object.keys(this.settings.labelColors)) {
      labels.push(label);
    }

    return dedupeLabels(labels).sort((a, b) => a.localeCompare(b));
  }

  private ensureLabelColor(label: string): void {
    const normalized = normalizeLabelName(label);
    if (!normalized || this.settings.labelRegistry.includes(normalized)) {
      return;
    }

    this.settings.labelRegistry = dedupeLabels([
      ...this.settings.labelRegistry,
      normalized
    ]);
    void this.saveSettings();
  }

  private createLabelFromPrompt(): void {
    new LabelPromptModal(this.app, (rawName) => {
      const label = normalizeLabelName(rawName);
      if (!label) {
        return;
      }

      this.settings.labelRegistry = dedupeLabels([
        ...this.settings.labelRegistry,
        label
      ]);
      this.activeLabel = label;
      this.activeFilter = null;
      void (async () => {
        await this.saveSettings();
        this.render();
      })();
    }).open();
  }

  private async renameLabel(oldLabel: string, newLabel: string): Promise<void> {
    const oldNormalized = normalizeLabelName(oldLabel);
    const newNormalized = normalizeLabelName(newLabel);
    if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) {
      return;
    }

    await this.store.renameLabel(oldNormalized, newNormalized);
    const preservedColor = this.settings.labelColors[oldNormalized];
    if (preservedColor) {
      this.settings.labelColors[newNormalized] = preservedColor;
    }
    delete this.settings.labelColors[oldNormalized];
    this.settings.labelRegistry = dedupeLabels([
      ...this.settings.labelRegistry.filter(
        (label) => normalizeLabelName(label) !== oldNormalized
      ),
      newNormalized
    ]);
    if (this.activeLabel === oldNormalized) {
      this.activeLabel = newNormalized;
    }
    await this.saveSettings();
    this.render();
  }

  private async deleteLabel(label: string): Promise<void> {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      return;
    }

    await this.store.deleteLabel(normalized);
    delete this.settings.labelColors[normalized];
    this.settings.labelRegistry = this.settings.labelRegistry.filter(
      (candidate) => normalizeLabelName(candidate) !== normalized
    );
    if (this.activeLabel === normalized) {
      this.activeLabel = null;
    }
    await this.saveSettings();
    this.render();
  }

  private stopEscape(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}

class LabelPromptModal extends Modal {
  constructor(
    app: App,
    private onSubmit: (value: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-label-prompt");
    contentEl.createEl("h2", { text: "Create label" });

    const input = contentEl.createEl("input", {
      cls: "belki-label-prompt-input",
      attr: {
        type: "text",
        placeholder: "#label"
      }
    });

    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions
      .createEl("button", {
        cls: "belki-button",
        text: "Cancel",
        attr: { type: "button" }
      })
      .addEventListener("click", () => this.close());

    const submitButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Create",
      attr: { type: "button" }
    });

    const submit = () => {
      this.onSubmit(input.value);
      this.close();
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

function byOrder(a: BelkiTask, b: BelkiTask): number {
  return a.order - b.order;
}

function formatDueChip(value: string): string {
  const today = todayIso();
  const diffFromToday = daysBetweenIsoDates(today, value);
  if (diffFromToday === 0) {
    return "Today";
  }

  if (diffFromToday === -1) {
    return "Yesterday";
  }

  if (diffFromToday !== null && diffFromToday < -1) {
    return `${Math.abs(diffFromToday)} days ago`;
  }

  if (diffFromToday === 1) {
    return "Tomorrow";
  }

  return formatShortDate(value);
}

function formatGroupHeader(value: string): string {
  const day = formatShortDate(value);
  const weekday = formatWeekday(value);

  if (value === todayIso()) {
    return `${day} - Today - ${weekday}`;
  }

  if (value === addDaysIso(1)) {
    return `${day} - Tomorrow - ${weekday}`;
  }

  return `${day} - ${weekday}`;
}

function formatCompletedHeader(date: string): string {
  if (date === todayIso()) return "Today";
  if (date === yesterdayIso()) return "Yesterday";
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(parsed);
}

function formatShortDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function formatWeekday(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long"
  }).format(date);
}

function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysIso(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupByDueDate(tasks: BelkiTask[]): Array<[string, BelkiTask[]]> {
  const map = new Map<string, BelkiTask[]>();
  for (const task of tasks.sort((a, b) => {
    if (a.due && b.due && a.due !== b.due) {
      return compareIsoDates(a.due, b.due);
    }

    return byOrder(a, b);
  })) {
    if (!task.due) {
      continue;
    }

    const group = map.get(task.due) || [];
    group.push(task);
    map.set(task.due, group);
  }

  return [...map.entries()];
}

function searchableText(task: BelkiTask): string {
  return [
    task.title,
    task.description,
    projectDisplayName(task.project),
    ...task.labels
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
