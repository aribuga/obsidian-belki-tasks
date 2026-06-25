import { App, ItemView, Modal, WorkspaceLeaf, setIcon } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import {
  compareIsoDates,
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
import { BelkiSortMode, BelkiTask, BoardViewMode, OVERDUE_RANGES } from "../types";
import { AddTaskComposer } from "./AddTaskComposer";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { TaskDetailModal } from "./TaskDetailModal";
import { getPriorityClass, getPriorityColor } from "../priority";
import {
  normalizeTaskProject,
  projectDisplayName,
  uniqueRealProjects
} from "../projects";

export const VIEW_TYPE_BELKI = "belki-task-board";

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
  private highlightedTaskId: string | null = null;
  private activeFilter: string | null = null;
  private activeLabel: string | null = null;
  private draggedTaskId: string | null = null;
  private sortPopoverOpen = false;
  private sidebarScrollLeft = 0;
  private handleRootKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    const openPopover = this.containerEl.querySelector<HTMLElement>(
      ".belki-composer-popover:not(.is-hidden), .belki-project-menu:not(.is-hidden)"
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
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.containerEl.removeEventListener("keydown", this.handleRootKeyDown, true);
    this.unsubscribe?.();
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
    this.sortPopoverOpen = false;
    this.render();
  }

  private render(): void {
    const { containerEl } = this;
    const sidebarScrollLeft =
      containerEl.querySelector<HTMLElement>(".belki-sidebar")?.scrollLeft ??
      this.sidebarScrollLeft;
    containerEl.empty();
    containerEl.addClass("belki-root");
    containerEl.addClass("belki-view");
    applyBelkiFontSettings(containerEl, this.settings);
    containerEl.addEventListener("keydown", this.handleRootKeyDown, true);

    const shell = containerEl.createDiv({ cls: "belki-shell" });
    this.renderSidebar(shell);
    this.renderMain(shell);

    if (this.searchOpen) {
      this.renderSearchOverlay(containerEl);
    }

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

  private renderPreservingMainScroll(
    snapshot = this.getMainScrollSnapshot()
  ): void {
    this.render();

    if (!snapshot) {
      return;
    }

    window.requestAnimationFrame(() => {
      const main = this.containerEl.querySelector<HTMLElement>(".belki-main");
      if (!main) {
        return;
      }

      main.scrollTop = snapshot.top;
      main.scrollLeft = snapshot.left;
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
    sidebarAdd.createSpan({ cls: "belki-add-plus", text: "+" });
    sidebarAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
    sidebarAdd.addEventListener("click", () => {
        this.composerOpen = true;
        this.sortPopoverOpen = false;
        this.render();
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

    const projectsSection = sidebar.createDiv({ cls: "belki-sidebar-section" });
    projectsSection.createDiv({ cls: "belki-sidebar-heading", text: "Projects" });

    for (const project of this.store.getProjects()) {
      const cleanProject = normalizeTaskProject(project);
      if (!cleanProject) {
        continue;
      }

      const count = active.filter((task) => normalizeTaskProject(task.project) === cleanProject).length;
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
        this.render();
      });
    }

    this.renderNavButton(
      nav,
      "Completed",
      "completed",
      tasks.filter((task) => task.completed).length,
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
    button.createEl("span", {
      cls: "belki-nav-icon",
      text: iconKey ? this.settings.icons[iconKey] : ""
    });
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

    const header = main.createDiv({ cls: "belki-main-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h1", { text: this.getTitle() });
    titleWrap.createDiv({ cls: "belki-subtitle", text: `${visible.length} task${visible.length === 1 ? "" : "s"}` });
    this.renderSortingControl(header);

    const sections = main.createDiv({ cls: "belki-sections" });

    this.renderTaskSections(sections, tasks);

    const addArea = main.createDiv({ cls: "belki-add-area" });
    if (this.composerOpen) {
      const composer = new AddTaskComposer();
      composer.render(addArea, {
        projects: this.store.getProjects(),
        labels: this.getAllLabels(),
        labelColors: this.settings.labelColors,
        projectColors: this.settings.projectColors,
        defaultProject: this.selectedProject || "",
        defaultDue: this.mode === "today" ? todayIso() : undefined,
        onCancel: () => {
          this.composerOpen = false;
          this.render();
        },
        onEnsureLabel: (label) => {
          this.ensureLabelColor(label);
        },
        onSubmit: async (input) => {
          await this.store.createTask(input);
          this.composerOpen = false;
          this.render();
        }
      });
      composer.focus();
    } else {
      const inlineAdd = addArea.createEl("button", { cls: "belki-add-inline" });
      inlineAdd.createSpan({ cls: "belki-add-plus", text: "+" });
      inlineAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
      inlineAdd.addEventListener("click", () => {
          this.composerOpen = true;
          this.sortPopoverOpen = false;
          this.render();
        });
    }

    if (active.length === 0 && tasks.length === 0) {
      main.createDiv({
        cls: "belki-empty",
        text: `No tasks yet. Add one and belki will write it to ${this.store.dataDir}/YYYY-MM.md.`
      });
    }
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
    const icon = button.createSpan({ cls: "belki-sorting-icon" });
    setIcon(icon, "arrow-up-down");
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
  }

  private renderTaskSections(parent: HTMLElement, allTasks: BelkiTask[]): void {
    parent.empty();

    const active = allTasks.filter((task) => !task.completed);

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
        : uniqueRealProjects([
          this.settings.defaultProject,
          ...this.store.getProjects(),
          ...Object.keys(this.settings.projectColors)
        ]);

      if (projects.length === 0) {
        this.renderEmptySection(parent, "No projects yet.");
        return;
      }

      for (const project of projects) {
        const projectTasks = this.sortTasks(
          active.filter((task) => normalizeTaskProject(task.project) === project)
        );
        const section = this.createSection(parent, project, projectTasks.length);
        this.enableProjectDrop(section, project);
        this.renderTaskList(section, projectTasks);
      }
      return;
    }

    if (this.mode === "filters") {
      this.renderFiltersAndLabels(parent, allTasks);
      return;
    }

    const visible = this.getVisibleTasks(allTasks);
    const section = this.createSection(parent, this.getTitle(), visible.length);
    this.renderTaskList(section, visible);
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
    labelsHeader
      .createEl("button", { cls: "belki-label-add", text: "+", attr: { type: "button" } })
      .addEventListener("click", () => {
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
    const dot = row.createSpan({ cls: "belki-filter-dot", text: icon });
    if (color) {
      dot.setText("");
      dot.addClass("belki-label-dot");
      dot.setCssStyles({ backgroundColor: color });
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
      const scrollSnapshot = this.getMainScrollSnapshot();
      this.settings.defaultOverdueRange = normalizeOverdueRange(select.value);
      void (async () => {
        await this.saveSettings();
        this.renderPreservingMainScroll(scrollSnapshot);
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
    const canMoveToProject = uniqueRealProjects([
      this.settings.defaultProject,
      ...this.store.getProjects(),
      ...Object.keys(this.settings.projectColors)
    ])
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
    row.toggleClass("is-completed", task.completed);
    row.toggleClass("is-highlighted", this.highlightedTaskId === task.id);
    row.addEventListener("click", () => {
      this.openTaskDetail(task);
    });

    const dragHandle = row.createEl("button", {
      cls: "belki-task-drag-handle",
      text: "⋮⋮",
      attr: {
        type: "button",
        "aria-label": `Drag ${task.title}`
      }
    });
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
    content.createDiv({ cls: "belki-task-title", text: task.title });

    if (task.description) {
      content.createDiv({ cls: "belki-task-description", text: task.description });
    }

    const meta = content.createDiv({ cls: "belki-task-meta" });
    if (task.due) {
      meta.createSpan({
        cls: `belki-task-date${isBeforeToday(task.due) ? " is-overdue" : ""}`,
        text: formatDueChip(task.due)
      });
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
      }
    }
    if (task.attachments.length > 0) {
      meta.createSpan({
        cls: "belki-task-attachments",
        text: `📎 ${task.attachments.length}`
      });
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

    row
      .createEl("button", {
        cls: "belki-task-delete",
        text: "×",
        attr: {
          type: "button",
          "aria-label": "Delete task"
        }
      })
      .addEventListener("click", (event) => {
        event.stopPropagation();
        void this.store.deleteTask(task.id);
      });
  }

  private openTaskDetail(task: BelkiTask): void {
    new TaskDetailModal(this.app, {
      task,
      projects: uniqueRealProjects([
        this.settings.defaultProject,
        ...this.store.getProjects(),
        ...Object.keys(this.settings.projectColors)
      ]),
      labels: this.getAllLabels(),
      settings: this.settings,
      store: this.store,
      onChange: () => this.render()
    }).open();
  }

  private getVisibleTasks(tasks: BelkiTask[]): BelkiTask[] {
    const active = tasks.filter((task) => !task.completed);

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
      return this.sortTasks(tasks.filter((task) => task.completed));
    }

    if (this.mode === "projects") {
      return this.sortTasks(this.selectedProject
        ? active.filter((task) => normalizeTaskProject(task.project) === this.selectedProject)
        : active.filter((task) => Boolean(normalizeTaskProject(task.project)))
      );
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
        icon: "1",
        tasks: active.filter((task) => task.priority === "P1")
      },
      {
        id: "p2",
        name: "Priority 2",
        icon: "2",
        tasks: active.filter((task) => task.priority === "P2")
      },
      {
        id: "p3",
        name: "Priority 3",
        icon: "3",
        tasks: active.filter((task) => task.priority === "P3")
      },
      {
        id: "p4",
        name: "Priority 4",
        icon: "4",
        tasks: active.filter((task) => task.priority === "P4")
      },
      {
        id: "all",
        name: "View all",
        icon: "•",
        tasks: active
      },
      {
        id: "no-due",
        name: "No due date",
        icon: "○",
        tasks: active.filter((task) => !task.due)
      },
      {
        id: "today",
        name: "Today",
        icon: "●",
        tasks: active.filter((task) => task.due === today)
      },
      {
        id: "overdue",
        name: "Overdue",
        icon: "!",
        tasks: active.filter((task) => task.due && task.due < today)
      },
      {
        id: "with-deadline",
        name: "With deadline",
        icon: "◆",
        tasks: active.filter((task) => Boolean(task.deadline))
      },
      {
        id: "no-label",
        name: "No label",
        icon: "#",
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
          result.createDiv({ cls: "belki-search-description", text: task.description });
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
  if (priority === "P4") {
    return 3;
  }
  return 4;
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
  if (value === today) {
    return "Today";
  }

  if (value === addDaysIso(-1)) {
    return "Yesterday";
  }

  if (value === addDaysIso(1)) {
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
