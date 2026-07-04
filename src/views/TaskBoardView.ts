import { App, ItemView, Modal, Platform, WorkspaceLeaf } from "obsidian";
import { BELKI_COLOR_PALETTE, getLabelColor, getProjectColor } from "../colors";
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
import {
  getPriorityClass,
  getPriorityColor,
  getPriorityDisplayLabel,
  getPriorityLabel,
  hasVisiblePriority,
  isDefaultPriority
} from "../priority";
import {
  isReservedInboxProject,
  normalizeTaskProject,
  projectDisplayName,
  uniqueRealProjects
} from "../projects";
import { createBelkiIcon } from "../ui/components/BelkiIcon";

export const VIEW_TYPE_BELKI = "belki-task-board";

// Groups: 1=wikilink full, 2=note path, 3=heading, 4=alias | 5=md link full, 6=md text, 7=md target | 8=https url | 9=www url
const LINK_RE = /(\[\[([^\]|#\n]+?)(?:#([^\]|\n]+?))?(?:\|([^\]\n]+?))?\]\])|(\[([^\]]+)\]\(([^)\n]+)\))|(https?:\/\/[^\s<>"')\]]+)|(www\.[a-zA-Z0-9][^\s<>"')\]]*)/g;

interface RenderLinkedTextOptions {
  app: App;
  sourcePath?: string;
}

interface ActivityDay {
  count: number;
  date: string;
  level: number;
}

interface ActivityData {
  allTimeCount: number;
  byDate: Map<string, BelkiTask[]>;
  currentStreak: number;
  defaultSelectedDate: string | null;
  heatmapDays: ActivityDay[];
  monthCount: number;
  todayCount: number;
  weekCount: number;
  yesterdayCount: number;
}

export function renderLinkedText(
  text: string,
  el: HTMLElement,
  options?: RenderLinkedTextOptions
): void {
  LINK_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) el.appendText(text.slice(last, match.index));
    if (match[1]) {
      // Wikilink [[Note#Heading|Alias]]
      const notePath = match[2];
      const heading = match[3];
      const alias = match[4];
      const displayText = alias || notePath.split("/").pop() || notePath;
      const linkTarget = heading ? `${notePath}#${heading}` : notePath;
      if (options?.app) {
        createInternalLink(el, displayText, linkTarget, options);
      } else {
        el.appendText(displayText);
      }
      last = match.index + match[1].length;
    } else if (match[5]) {
      const target = match[7].trim();
      if (options?.app && !isExternalLinkTarget(target)) {
        createInternalLink(el, match[6], target, options);
      } else {
        createExternalLink(el, match[6], normalizeExternalHref(target));
      }
      last = match.index + match[5].length;
    } else {
      // Raw https:// or www. URL
      const full = match[0];
      const url = full.replace(/[.,;:!?)\]]+$/, "");
      const trailing = full.slice(url.length);
      const href = url.startsWith("www.") ? `https://${url}` : url;
      createExternalLink(el, url, href);
      if (trailing) el.appendText(trailing);
      last = match.index + full.length;
    }
  }
  if (last < text.length) el.appendText(text.slice(last));
}

function createInternalLink(
  parent: HTMLElement,
  text: string,
  linkTarget: string,
  options: RenderLinkedTextOptions
): void {
  const link = parent.createEl("a", {
    text,
    cls: "internal-link",
    href: linkTarget
  });
  link.setAttribute("data-href", linkTarget);
  const open = (event: MouseEvent | TouchEvent, openInNewLeaf = false) => {
    event.preventDefault();
    event.stopPropagation();
    void options.app.workspace.openLinkText(
      linkTarget,
      options.sourcePath || "",
      openInNewLeaf
    );
  };
  link.addEventListener("pointerdown", (event) => event.stopPropagation());
  link.addEventListener("touchstart", (event) => event.stopPropagation());
  link.addEventListener("touchend", (event) => open(event));
  link.addEventListener("click", (event) => {
    open(event, event.metaKey || event.ctrlKey || event.button === 1);
  });
  link.addEventListener("auxclick", (event) => {
    if (event.button === 1) open(event, true);
  });
}

function createExternalLink(parent: HTMLElement, text: string, href: string): void {
  const link = parent.createEl("a", { text, href, cls: "external-link" });
  link.setAttribute("rel", "noopener noreferrer");
  link.addEventListener("pointerdown", (event) => event.stopPropagation());
  link.addEventListener("touchstart", (event) => event.stopPropagation());
  link.addEventListener("click", (event) => event.stopPropagation());
  link.addEventListener("auxclick", (event) => event.stopPropagation());
}

function isExternalLinkTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("www.");
}

function normalizeExternalHref(target: string): string {
  return target.startsWith("www.") ? `https://${target}` : target;
}

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
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1$2")
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
  private activitySelectedDate: string | null = null;
  private activityCache: { signature: string; data: ActivityData } | null = null;
  private draggedTaskId: string | null = null;
  private sortPopoverOpen = false;
  private projectActionsOpen: string | null = null;
  private taskActionsOpenId: string | null = null;
  private projectMenuEl: HTMLElement | null = null;
  private taskActionMenuEl: HTMLElement | null = null;
  private sidebarScrollLeft = 0;
  private pendingScrollSnapshot: { top: number; left: number } | null = null;
  private mobileComposerReturnScroll: { top: number; left: number } | null = null;
  private composerCleanup: (() => void) | null = null;
  private renderScheduled = false;
  private handleRootClick = (event: MouseEvent): void => {
    if (!this.taskActionsOpenId) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(".belki-task-actions, .belki-task-action-menu")
    ) {
      return;
    }

    this.removeTaskActionMenu();
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
      this.projectActionsOpen = null;
      this.render();
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
    this.unsubscribe = this.store.subscribe(() => this.renderPreservingMainScroll());
    this.render();
  }

  async onClose(): Promise<void> {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    this.removeTaskActionMenu();
    this.containerEl.removeEventListener("keydown", this.handleRootKeyDown, true);
    this.containerEl.removeEventListener("click", this.handleRootClick, true);
    this.unsubscribe?.();
  }

  private removeProjectMenu(): void {
    this.projectMenuEl?.remove();
    this.projectMenuEl = null;
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

  refresh(): void {
    this.render();
  }

  openToday(): void {
    this.mode = "today";
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
    this.render();
  }

  private render(): void {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    this.removeTaskActionMenu();
    const { containerEl } = this;
    const sidebarScrollLeft =
      containerEl.querySelector<HTMLElement>(".belki-sidebar")?.scrollLeft ??
      this.sidebarScrollLeft;
    containerEl.empty();
    containerEl.addClass("belki-root");
    containerEl.addClass("belki-view");
    containerEl.toggleClass("is-mobile", Platform.isMobile);
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

    const sidebarAdd = sidebar.createEl("button", { cls: "belki-add-sidebar" });
    createBelkiIcon(sidebarAdd, "add", { className: "belki-add-plus", size: 18 });
    sidebarAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
    sidebarAdd.addEventListener("click", () => {
      this.openAddComposer();
    });

    const tasks = this.store.getTasks();
    const active = tasks.filter((task) => !task.completed);
    const nav = sidebar.createDiv({ cls: "belki-nav" });

    this.renderNavButton(nav, "Search", "search", undefined, "search");
    this.renderNavButton(nav, "Inbox", "inbox", this.getInboxTasks(active).length, "inbox");
    this.renderNavButton(nav, "Today", "today", this.getTodayTasks(active).length, "today");
    this.renderNavButton(nav, "Upcoming", "upcoming", this.getUpcomingTasks(active).length, "upcoming");
    this.renderNavButton(nav, "Filters & Labels", "filters", undefined, "filters");
    this.renderNavButton(nav, "Projects", "projects", undefined, "projects");
    this.renderNavButton(nav, "Activity", "activity", undefined, "activity");

    const projectsSection = sidebar.createDiv({ cls: "belki-sidebar-section" });
    const projectsHeadingRow = projectsSection.createDiv({ cls: "belki-sidebar-heading-row" });
    projectsHeadingRow.createDiv({ cls: "belki-sidebar-heading", text: "Projects" });
    const addProjectBtn = projectsHeadingRow.createEl("button", {
      cls: "belki-sidebar-add-project",
      attr: { type: "button", "aria-label": "New project" }
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

    const activeTasks = active.filter((task) => {
      const p = normalizeTaskProject(task.project);
      return !p || !new Set(this.settings.archivedProjects).has(p);
    });

    for (const cleanProject of this.getActiveProjects()) {
      const count = activeTasks.filter((task) => normalizeTaskProject(task.project) === cleanProject).length;
      const button = projectsSection.createEl("button", {
        cls: "belki-project-button"
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
        this.composerOpen = false;
        this.mobileComposerOpen = false;
        this.mobileComposerReturnScroll = null;
        this.render();
      });
    }

    if (this.settings.archivedProjects.length > 0) {
      const archiveButton = projectsSection.createEl("button", {
        cls: "belki-project-button belki-archived-button"
      });
      archiveButton.toggleClass("is-active", this.mode === "archived");
      createBelkiIcon(archiveButton, "archive", { className: "belki-nav-icon", size: 18 });
      archiveButton.createEl("span", { cls: "belki-nav-label", text: "Archived" });
      archiveButton.createEl("span", { cls: "belki-count", text: String(this.settings.archivedProjects.length) });
      archiveButton.addEventListener("click", () => {
        this.mode = "archived";
        this.selectedProject = null;
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
      tasks.filter((task) => task.completed || (task.completedOccurrences && task.completedOccurrences.length > 0)).length,
      "completed"
    );
  }

  private renderNavButton(
    parent: HTMLElement,
    label: string,
    mode: BoardViewMode,
    count?: number,
    iconKey?: keyof BelkiIconSettings
  ): void {
    const button = parent.createEl("button", { cls: "belki-nav-button" });
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
      this.composerOpen = false;
      this.mobileComposerOpen = false;
      this.mobileComposerReturnScroll = null;
      this.searchOpen = false;
      this.sortPopoverOpen = false;
      this.render();
    });
  }

  private renderMain(parent: HTMLElement): void {
    const main = parent.createEl("main", { cls: "belki-main" });
    const tasks = this.store.getTasks();
    const active = tasks.filter((task) => !task.completed);
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
    if (this.mode !== "activity") {
      this.renderSortingControl(header);
    }

    const sections = main.createDiv({ cls: "belki-sections" });

    this.renderTaskSections(sections, tasks);

    if (this.mode === "activity") {
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

    if (active.length === 0 && tasks.length === 0) {
      main.createDiv({
        cls: "belki-empty",
        text: `No tasks yet. Add one and belki will write it to ${this.store.dataDir}/YYYY-MM.md.`
      });
    }
  }

  private openAddComposer(): void {
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
      defaultDue: this.mode === "today" ? todayIso() : undefined,
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
    if (this.searchOpen) {
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

    const active = allTasks.filter((task) => !task.completed && !task.parentId);

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

    if (this.mode === "completed") {
      this.renderCompletedView(parent, allTasks);
      return;
    }

    const visible = this.getVisibleTasks(allTasks);
    const section = this.createSection(parent, this.getTitle(), visible.length);
    this.renderTaskList(section, visible);
  }

  private renderCompletedView(parent: HTMLElement, allTasks: BelkiTask[]): void {
    const archivedSet = new Set(this.settings.archivedProjects);
    const completed = allTasks.filter((task) =>
      !archivedSet.has(normalizeTaskProject(task.project) || "") &&
      task.completed
    );

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
    const completedTasks = allTasks.filter((task) =>
      task.completed &&
      Boolean(task.completedDate) &&
      parseIsoDate(task.completedDate || "") !== null
    );
    const signature = completedTasks
      .map((task) => [
        task.id,
        task.completedDate,
        task.title,
        normalizeTaskProject(task.project) || "",
        task.priority,
        task.labels.join(",")
      ].join(":"))
      .join("|");

    if (this.activityCache?.signature === signature) {
      return this.activityCache.data;
    }

    const byDate = new Map<string, BelkiTask[]>();
    for (const task of completedTasks) {
      const date = task.completedDate!;
      const group = byDate.get(date) || [];
      group.push(task);
      byDate.set(date, group);
    }

    for (const tasks of byDate.values()) {
      tasks.sort(byOrder);
    }

    const today = todayIso();
    const yesterday = yesterdayIso();
    const weekStart = startOfWeekIso(today);
    const monthPrefix = today.slice(0, 7);
    const heatmapDays: ActivityDay[] = [];
    for (let offset = -181; offset <= 0; offset += 1) {
      const date = addDaysToIso(today, offset);
      const count = byDate.get(date)?.length || 0;
      heatmapDays.push({
        count,
        date,
        level: activityLevel(count)
      });
    }

    let currentStreak = 0;
    for (let date = today; (byDate.get(date)?.length || 0) > 0; date = addDaysToIso(date, -1)) {
      currentStreak += 1;
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
    const defaultSelectedDate =
      (byDate.get(today)?.length || 0) > 0 ? today : sortedDates[0] || null;

    const data: ActivityData = {
      allTimeCount: completedTasks.length,
      byDate,
      currentStreak,
      defaultSelectedDate,
      heatmapDays,
      monthCount: completedTasks.filter((task) => task.completedDate?.startsWith(monthPrefix)).length,
      todayCount: byDate.get(today)?.length || 0,
      weekCount: completedTasks.filter((task) => {
        const date = task.completedDate || "";
        return date >= weekStart && date <= today;
      }).length,
      yesterdayCount: byDate.get(yesterday)?.length || 0
    };

    this.activityCache = { signature, data };
    return data;
  }

  private renderFiltersAndLabels(parent: HTMLElement, allTasks: BelkiTask[]): void {
    if (this.activeFilter) {
      const definition = this.getFilterDefinitions(allTasks).find(
        (filter) => filter.id === this.activeFilter
      );
      const tasks = definition ? this.sortTasks(definition.tasks) : [];
      const section = this.createSection(parent, definition?.name || "Filter", tasks.length);
      this.renderBackToFilters(section);
      this.renderTaskList(section, tasks);
      return;
    }

    if (this.activeLabel) {
      const label = this.activeLabel;
      const tasks = this.sortTasks(
        allTasks.filter((task) => !task.completed && task.labels.includes(label))
      );
      const section = this.createSection(parent, displayLabel(label), tasks.length);
      this.renderBackToFilters(section);
      this.renderTaskList(section, tasks);
      return;
    }

    const filtersSection = parent.createDiv({ cls: "belki-filter-section" });
    filtersSection.createEl("h2", { text: "My Filters" });
    const filterList = filtersSection.createDiv({ cls: "belki-filter-list" });
    for (const filter of this.getFilterDefinitions(allTasks)) {
      this.renderFilterRow(filterList, filter.name, filter.count, filter.icon, () => {
        this.activeFilter = filter.id;
        this.activeLabel = null;
        this.render();
      });
    }

    const labelsSection = parent.createDiv({ cls: "belki-filter-section" });
    const labelsHeader = labelsSection.createDiv({ cls: "belki-labels-header" });
    labelsHeader.createEl("h2", { text: "Labels" });
    const labelAddButton = labelsHeader.createEl("button", {
      cls: "belki-label-add",
      attr: { type: "button", "aria-label": "Create label" }
    });
    createBelkiIcon(labelAddButton, "add");
    labelAddButton.addEventListener("click", () => {
      this.createLabelFromPrompt();
    });

    const labelList = labelsSection.createDiv({ cls: "belki-filter-list" });
    const labels = this.getAllLabels();
    if (labels.length === 0) {
      labelList.createDiv({ cls: "belki-empty belki-empty-small", text: "No labels yet." });
      return;
    }

    for (const label of labels) {
      const count = allTasks.filter((task) => !task.completed && task.labels.includes(label)).length;
      this.renderFilterRow(labelList, displayLabel(label), count, "", () => {
        this.activeLabel = label;
        this.activeFilter = null;
        this.render();
      }, getLabelColor(label, this.settings.labelColors).regular);
    }
  }

  private renderBackToFilters(parent: HTMLElement): void {
    parent
      .createEl("button", { cls: "belki-back-button", text: "Back to Filters & Labels" })
      .addEventListener("click", () => {
        this.activeFilter = null;
        this.activeLabel = null;
        this.render();
      });
  }

  private renderFilterRow(
    parent: HTMLElement,
    name: string,
    count: number,
    icon: string,
    onClick: () => void,
    color?: string
  ): void {
    const row = parent.createEl("button", { cls: "belki-filter-row", attr: { type: "button" } });
    row.toggleClass("belki-label-row", Boolean(color));
    const dot = row.createSpan({ cls: "belki-filter-dot" });
    if (color) {
      dot.addClass("belki-label-dot");
      dot.setCssStyles({ backgroundColor: color });
    } else if (icon) {
      createBelkiIcon(dot, icon);
    }
    row.createSpan({ cls: "belki-filter-name", text: name });
    row.createSpan({ cls: "belki-row-count", text: String(count) });
    row.addEventListener("click", onClick);
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
    const wrapper = header.createDiv({ cls: "belki-project-actions-wrap" });
    const button = wrapper.createEl("button", {
      cls: "belki-project-actions-button",
      attr: { type: "button", "aria-label": "Project actions" }
    });
    createBelkiIcon(button, "more");

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.projectActionsOpen = this.projectActionsOpen === project ? null : project;
      this.render();
    });

    if (this.projectActionsOpen !== project) return;

    // Appended to body so Obsidian panel transforms don't trap it
    const menu = activeDocument.body.createDiv({ cls: "belki-project-menu" });
    this.projectMenuEl = menu;
    menu.setCssStyles({ visibility: "hidden" });

    const renameItem = menu.createEl("button", { cls: "belki-project-option", text: "Rename project", attr: { type: "button" } });
    renameItem.addEventListener("click", (event) => {
      event.stopPropagation();
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
    });

    const archiveItem = menu.createEl("button", { cls: "belki-project-option", text: "Archive project", attr: { type: "button" } });
    archiveItem.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeProjectActionsMenu();
      this.settings.archivedProjects = [...this.settings.archivedProjects, project];
      if (this.selectedProject === project) {
        this.selectedProject = null;
        this.mode = "projects";
      }
      void this.saveSettings().then(() => this.render());
    });

    const deleteItem = menu.createEl("button", { cls: "belki-project-option is-destructive", text: "Delete project", attr: { type: "button" } });
    deleteItem.addEventListener("click", (event) => {
      event.stopPropagation();
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
    });

    // Position after browser layout so getBoundingClientRect returns real values
    window.requestAnimationFrame(() => {
      if (!menu.isConnected) return;
      const btnRect = button.getBoundingClientRect();
      const margin = 8;
      const menuW = menu.offsetWidth || 220;
      const menuH = menu.offsetHeight || 120;

      let left = btnRect.left;
      if (left + menuW > window.innerWidth - margin) {
        left = btnRect.right - menuW;
      }
      const fitsBelow = btnRect.bottom + menuH + margin <= window.innerHeight;
      const fitsAbove = btnRect.top - menuH - margin >= 0;
      if (!fitsBelow && fitsAbove) {
        menu.setCssStyles({
          left: `${Math.max(margin, left)}px`,
          bottom: `${window.innerHeight - btnRect.top + 4}px`,
          visibility: ""
        });
        menu.addClass("is-open-up");
      } else {
        menu.setCssStyles({
          left: `${Math.max(margin, left)}px`,
          top: `${btnRect.bottom + 4}px`,
          visibility: ""
        });
        menu.addClass("is-open-down");
      }
    });
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

    for (const task of tasks) {
      this.renderTaskRow(list, task);
    }
  }

  private renderTaskRow(parent: HTMLElement, task: BelkiTask): void {
    const row = parent.createDiv({ cls: "belki-task-row" });
    row.dataset.taskId = task.id;
    row.toggleClass("is-completed", task.completed);
    row.toggleClass("is-highlighted", this.highlightedTaskId === task.id);
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
    const allTasks = this.store.getTasks();
    const subTasks = allTasks.filter((t) => t.parentId === task.id);
    if (subTasks.length > 0) {
      const done = subTasks.filter((t) => t.completed).length;
      const counterEl = meta.createSpan({ cls: "belki-task-subtask-counter" });
      createBelkiIcon(counterEl, "subtasks", { className: "belki-chip-icon" });
      counterEl.createSpan({ text: `${done}/${subTasks.length}` });
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

    const actions = row.createDiv({ cls: "belki-task-actions" });
    const actionButton = actions.createEl("button", {
      cls: "belki-task-actions-button",
      attr: {
        type: "button",
        "aria-label": "Task actions"
      }
    });
    createBelkiIcon(actionButton, "more");
    actionButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = this.taskActionsOpenId === task.id;
      this.removeTaskActionMenu();
      if (wasOpen) {
        return;
      }

      this.taskActionsOpenId = task.id;
      this.taskActionMenuEl = this.renderTaskActionMenu(task, actionButton);
    });

    const deleteButton = actions.createEl("button", {
      cls: "belki-task-delete",
      attr: {
        type: "button",
        "aria-label": "Delete task"
      }
    });
    createBelkiIcon(deleteButton, "delete");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.store.deleteTask(task.id);
    });
  }

  private renderTaskActionMenu(task: BelkiTask, trigger: HTMLElement): HTMLElement {
    const menu = this.containerEl.createDiv({ cls: "belki-task-action-menu" });
    menu.addEventListener("click", (event) => event.stopPropagation());

    if (!task.completed && task.due !== todayIso()) {
      this.createTaskActionMenuButton(menu, "Move to Today", () => {
        this.moveTaskDue(task, todayIso());
      });
    }

    const tomorrow = addDaysIso(1);
    if (!task.completed && task.due !== tomorrow) {
      this.createTaskActionMenuButton(menu, "Move to Tomorrow", () => {
        this.moveTaskDue(task, tomorrow);
      });
    }

    if (!task.completed) {
      const pickDateItem = menu.createEl("label", { cls: "belki-task-action-menu-item" });
      pickDateItem.createSpan({ text: "Pick date" });
      const dateInput = pickDateItem.createEl("input", {
        cls: "belki-task-action-date-input",
        attr: {
          type: "date",
          value: task.due || todayIso(),
          "aria-label": "Pick task date"
        }
      });
      dateInput.addEventListener("click", (event) => event.stopPropagation());
      dateInput.addEventListener("change", () => {
        this.moveTaskDue(task, dateInput.value || undefined);
      });
    }

    if (!task.completed && task.due) {
      this.createTaskActionMenuButton(menu, "Clear date", () => {
        this.moveTaskDue(task, undefined);
      });
    }

    this.createTaskActionMenuButton(menu, "Delete task", () => {
      this.removeTaskActionMenu();
      void this.store.deleteTask(task.id);
    });
    this.positionTaskActionMenu(menu, trigger);
    return menu;
  }

  private positionTaskActionMenu(menu: HTMLElement, trigger: HTMLElement): void {
    const ownerWindow = this.containerEl.ownerDocument.defaultView || window;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const menuWidth = menu.offsetWidth || 170;
    const menuHeight = menu.offsetHeight || 180;
    const maxLeft = ownerWindow.innerWidth - menuWidth - margin;
    let left = Math.min(Math.max(margin, rect.right - menuWidth), Math.max(margin, maxLeft));
    let top = rect.bottom + gap;

    if (top + menuHeight > ownerWindow.innerHeight - margin) {
      top = rect.top - menuHeight - gap;
    }

    if (top < margin) {
      top = margin;
    }

    menu.setCssStyles({
      left: `${left}px`,
      top: `${top}px`
    });
  }

  private createTaskActionMenuButton(
    parent: HTMLElement,
    label: string,
    onClick: () => void
  ): void {
    parent
      .createEl("button", {
        cls: "belki-task-action-menu-item",
        text: label,
        attr: { type: "button" }
      })
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
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
    const archivedSet = new Set(this.settings.archivedProjects);
    const active = tasks.filter(
      (task) => !task.completed && !archivedSet.has(normalizeTaskProject(task.project) || "") && !task.parentId
    );

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
      return this.sortTasks(tasks.filter((task) =>
        !archivedSet.has(normalizeTaskProject(task.project) || "") &&
        (task.completed || (task.completedOccurrences && task.completedOccurrences.length > 0))
      ));
    }

    if (this.mode === "activity") {
      return [];
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
          active.filter((task) => task.labels.includes(this.activeLabel || ""))
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

  private getFilterDefinitions(tasks: BelkiTask[]): Array<{
    id: string;
    name: string;
    icon: string;
    tasks: BelkiTask[];
    count: number;
  }> {
    const active = tasks.filter((task) => !task.completed);
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

  private stopEscape(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}

class RenameProjectModal extends Modal {
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

class DeleteProjectModal extends Modal {
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

function compareTasksByMode(a: BelkiTask, b: BelkiTask, mode: BelkiSortMode): number {
  if (mode === "due") {
    return (
      compareOptionalDateAsc(a.due, b.due) ||
      byOrder(a, b)
    );
  }

  if (mode === "priority") {
    return (
      comparePriority(a, b) ||
      compareOptionalDateAsc(a.deadline, b.deadline) ||
      compareOptionalDateAsc(a.due, b.due) ||
      byOrder(a, b)
    );
  }

  if (mode === "deadline") {
    return (
      compareOptionalDateAsc(a.deadline, b.deadline) ||
      byOrder(a, b)
    );
  }

  if (mode === "created") {
    return (
      compareOptionalDateDesc(a.created, b.created) ||
      byOrder(a, b)
    );
  }

  if (mode === "project") {
    return (
      projectDisplayName(a.project).localeCompare(projectDisplayName(b.project)) ||
      compareSmart(a, b)
    );
  }

  if (mode === "alphabetical") {
    return a.title.localeCompare(b.title) || byOrder(a, b);
  }

  return compareSmart(a, b);
}

function compareSmart(a: BelkiTask, b: BelkiTask): number {
  return (
    comparePriority(a, b) ||
    compareOptionalDateAsc(a.deadline, b.deadline) ||
    compareOptionalDateAsc(a.due, b.due) ||
    compareOptionalDateAsc(a.created, b.created) ||
    byOrder(a, b)
  );
}

function comparePriority(a: BelkiTask, b: BelkiTask): number {
  return priorityRank(a.priority) - priorityRank(b.priority);
}

function priorityRank(priority: BelkiTask["priority"]): number {
  if (priority === "P1") {
    return 0;
  }
  if (priority === "P2") {
    return 1;
  }
  if (priority === "P3") {
    return 2;
  }
  return 3;
}

function compareOptionalDateAsc(
  a: string | undefined,
  b: string | undefined
): number {
  if (a && b) {
    return compareIsoDates(a, b);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
}

function compareOptionalDateDesc(
  a: string | undefined,
  b: string | undefined
): number {
  if (a && b) {
    return compareIsoDates(b, a);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
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

function addDaysToIso(value: string, offset: number): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  date.setDate(date.getDate() + offset);
  return toLocalIsoDate(date);
}

function startOfWeekIso(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return toLocalIsoDate(date);
}

function activityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatActivityDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatActivityDayHeading(date: string, count: number): string {
  return `${formatShortDate(date)} · ${formatWeekday(date)} · ${count}`;
}

function toLocalIsoDate(date: Date): string {
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

class CreateProjectModal extends Modal {
  private selectedColor: string | null = null;
  private autoPreviewName = "New project";

  constructor(
    app: App,
    private existingProjects: string[],
    private onSubmit: (project: { name: string; colorOverride?: string }) => void
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
