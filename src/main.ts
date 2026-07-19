import { Notice, Platform, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { dailyNoteDateFromPath, normalizeDailyNoteDateFormat } from "./dailyNotes";
import { BelkiSettingTab } from "./BelkiSettingTab";
import {
  BelkiSettings,
  DEFAULT_SETTINGS,
  normalizeDefaultProject,
  normalizeDataFolderPath,
  normalizeFontOption,
  normalizeLabelColorMap,
  normalizeLabelRegistry,
  normalizeCalendarSettings,
  normalizeOverdueRange,
  normalizeSortMode,
  normalizeProjectRegistry
} from "./settings";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { TaskStore } from "./taskStore";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./views/TaskBoardView";
import { cleanProjectName, uniqueRealProjects } from "./projects";
import { QuickAddModal } from "./views/QuickAddModal";
import { DailyNoteCompletedBlock } from "./views/DailyNoteCompletedBlock";
import { CalendarService } from "./calendar/CalendarService";
import { IcalCalendarProvider } from "./calendar/IcalCalendarProvider";
import { InitializationGate } from "./startup/initializationGate";
import {
  QUICK_ADD_TASK_HOTKEYS,
  QUICK_ADD_TASK_COMMAND_ID,
  QUICK_ADD_TASK_COMMAND_NAME,
  resolveQuickAddCommandTarget
} from "./quickAddCommand";

const BELKI_COMPLETED_CODE_BLOCK = "```belki-completed\n```";
const BELKI_COMPLETED_CODE_BLOCK_RE = /```belki-completed\b[\s\S]*?```/i;

export default class BelkiPlugin extends Plugin {
  settings: BelkiSettings;
  store: TaskStore;
  calendarService: CalendarService;
  private reloadDebounceTimer: number | null = null;
  private storeInitializationGate = new InitializationGate();
  private storeInitializationError: string | null = null;
  private layoutReady = false;
  private storeInitialized = false;
  private unloaded = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new TaskStore(this.app, this.settings);
    this.calendarService = new CalendarService({
      settings: this.settings,
      provider: new IcalCalendarProvider(),
      saveSettings: () => this.saveSettings(),
      onChanged: () => {}
    });

    this.registerView(
      VIEW_TYPE_BELKI,
      (leaf: WorkspaceLeaf) =>
        new TaskBoardView(
          leaf,
          this.store,
          this.settings,
          () => this.saveSettings(),
          this.calendarService,
          {
            getError: () => this.storeInitializationError,
            retry: () => {
              void this.initializeStore().catch(() => {});
            }
          }
        )
    );

    this.addRibbonIcon("check-circle-2", "Open belki", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open",
      name: "Open",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: QUICK_ADD_TASK_COMMAND_ID,
      name: QUICK_ADD_TASK_COMMAND_NAME,
      hotkeys: QUICK_ADD_TASK_HOTKEYS,
      callback: () => {
        this.handleQuickAddTaskCommand();
      }
    });

    this.addCommand({
      id: "show-active-daily-note-completed-tasks",
      name: "Show Completed Tasks for Active Daily Note",
      callback: () => {
        void this.openActiveDailyNoteCompletedTasks();
      }
    });

    this.addCommand({
      id: "insert-active-daily-note-completed-block",
      name: "Insert Completed Tasks Block in Active Daily Note",
      callback: () => {
        void this.insertActiveDailyNoteCompletedBlock();
      }
    });

    this.addCommand({
      id: "normalize-labels",
      name: "Normalize Labels",
      callback: async () => {
        await this.store.normalizeLabels();
        this.settings.labelColors = normalizeLabelColorMap(this.settings.labelColors);
        this.settings.labelRegistry = normalizeLabelRegistry([
          ...this.settings.labelRegistry,
          ...Object.keys(this.settings.labelColors)
        ]);
        await this.saveSettings();
        new Notice("belki labels normalized.");
      }
    });

    this.addCommand({
      id: "migrate-old-task-file",
      name: "Migrate old task file",
      callback: async () => {
        const migratedCount = await this.store.migrateOldTaskFile();
        if (migratedCount === 0) {
          new Notice("belki found no old tasks to migrate.");
          return;
        }

        new Notice(`belki migrated ${migratedCount} task${migratedCount === 1 ? "" : "s"}.`);
      }
    });

    this.addSettingTab(new BelkiSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        void this.refreshIfTaskFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        void this.refreshIfTaskFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (
          this.store.isTaskStorageFile(oldPath) ||
          this.store.isTaskStorageFile(file.path)
        ) {
          this.scheduleReload();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.store.isTaskStorageFile(file.path)) {
          this.scheduleReload();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        void this.handleDailyNoteFileOpen(file);
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.calendarService.requestStaleRefresh();
      })
    );

    this.registerDomEvent(window, "focus", () => {
      this.calendarService.requestStaleRefresh();
    });

    this.registerDomEvent(activeDocument, "visibilitychange", () => {
      if (activeDocument.visibilityState === "visible") {
        this.calendarService.requestStaleRefresh();
      }
    });

    this.registerMarkdownCodeBlockProcessor("belki-completed", (source, el, ctx) => {
      this.renderCompletedTasksCodeBlock(source, el, ctx);
    });

    this.register(() => {
      this.unloaded = true;
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) {
        return;
      }

      this.layoutReady = true;
      void this.initializeStore().catch(() => {});
    });
  }

  onunload(): void {
    this.unloaded = true;
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer);
    }
    this.calendarService?.dispose();
  }

  async loadSettings(): Promise<void> {
    const data = toPluginData(await this.loadData());
    const saved = data.settings;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      dataFolderPath: normalizeDataFolderPath(saved?.dataFolderPath),
      defaultProject: normalizeDefaultProject(saved?.defaultProject),
      icons: {
        ...DEFAULT_SETTINGS.icons,
        ...saved?.icons
      },
      projectColors: {
        ...DEFAULT_SETTINGS.projectColors,
        ...saved?.projectColors
      },
      labelColors: normalizeLabelColorMap({
        ...DEFAULT_SETTINGS.labelColors,
        ...saved?.labelColors
      }),
      labelRegistry: normalizeLabelRegistry([
        ...DEFAULT_SETTINGS.labelRegistry,
        ...(saved?.labelRegistry || []),
        ...Object.keys(saved?.labelColors || {})
      ]),
      projectRegistry: normalizeProjectRegistry([
        ...(saved?.projectRegistry || []),
        ...Object.keys(saved?.projectColors || {})
      ]),
      sortMode: normalizeSortMode(saved?.sortMode),
      defaultOverdueRange: normalizeOverdueRange(saved?.defaultOverdueRange),
      uiFont: normalizeFontOption(saved?.uiFont),
      taskTitleFont: normalizeFontOption(saved?.taskTitleFont),
      taskDescriptionFont: normalizeFontOption(saved?.taskDescriptionFont),
      labelFont: normalizeFontOption(saved?.labelFont),
      sidebarCollapsed: saved?.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
      dailyNotesIntegrationEnabled:
        saved?.dailyNotesIntegrationEnabled ?? DEFAULT_SETTINGS.dailyNotesIntegrationEnabled,
      dailyNotesAutoInsertCompletedBlock:
        saved?.dailyNotesAutoInsertCompletedBlock ??
        DEFAULT_SETTINGS.dailyNotesAutoInsertCompletedBlock,
      dailyNoteDateFormat: normalizeDailyNoteDateFormat(saved?.dailyNoteDateFormat),
      ...normalizeCalendarSettings(saved)
    };
  }

  async saveSettings(): Promise<void> {
    await this.savePluginData();
  }

  async reloadTasks(): Promise<void> {
    try {
      if (!this.layoutReady) {
        return;
      }
      if (!this.storeInitialized) {
        await this.initializeStore();
        return;
      }

      await this.store.reloadFromDisk();
    } catch (error) {
      new Notice("belki could not reload task data.");
      console.error(error);
    }
  }

  refreshBelkiViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI)) {
      const view = leaf.view;
      if (view instanceof TaskBoardView) {
        view.refresh();
      }
    }
  }

  getProjectNames(): string[] {
    return uniqueRealProjects([
      cleanProjectName(this.settings.defaultProject),
      ...this.store.getProjects().map(cleanProjectName),
      ...Object.keys(this.settings.projectColors).map(cleanProjectName),
      ...this.settings.projectRegistry.map(cleanProjectName)
    ]);
  }

  getLabelNames(): string[] {
    const taskLabels: string[] = [];
    for (const task of this.store.getTasks()) {
      taskLabels.push(...task.labels);
    }

    return dedupeLabels([
      ...this.settings.labelRegistry,
      ...Object.keys(this.settings.labelColors),
      ...taskLabels
    ]).sort((a, b) => a.localeCompare(b));
  }

  getLabelTaskCount(label: string): number {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      return 0;
    }

    return this.store
      .getTasks()
      .filter((task) => task.labels.some((candidate) => normalizeLabelName(candidate) === normalized))
      .length;
  }

  async renameLabel(oldLabel: string, newLabel: string): Promise<void> {
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
    await this.saveSettings();
    this.refreshBelkiViews();
  }

  async deleteLabel(label: string): Promise<void> {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      return;
    }

    await this.store.deleteLabel(normalized);
    delete this.settings.labelColors[normalized];
    this.settings.labelRegistry = this.settings.labelRegistry.filter(
      (candidate) => normalizeLabelName(candidate) !== normalized
    );
    await this.saveSettings();
    this.refreshBelkiViews();
  }

  private async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        view.openToday();
      }
      this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BELKI, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async activateDailyNoteView(date: string, sourcePath: string): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        view.openDailyNote(date, sourcePath);
      }
      this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BELKI, active: true });
    const view = leaf.view;
    if (view instanceof TaskBoardView) {
      view.openDailyNote(date, sourcePath);
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async openActiveDailyNoteCompletedTasks(): Promise<void> {
    if (!this.settings.dailyNotesIntegrationEnabled) {
      new Notice("belki Daily Notes integration is disabled in settings.");
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a daily note first.");
      return;
    }

    const date = this.dateFromDailyNoteFile(file);
    if (!date) {
      new Notice("belki could not detect a date from the active note.");
      return;
    }

    await this.activateDailyNoteView(date, file.path);
  }

  private handleQuickAddTaskCommand(): void {
    const activeLeaf = this.app.workspace.getMostRecentLeaf();
    const target = resolveQuickAddCommandTarget({
      activeView: activeLeaf?.view,
      isMobile: Platform.isMobile,
      isTaskBoardView: (view) => view instanceof TaskBoardView
    });

    if (target === "contextual-composer" && activeLeaf?.view instanceof TaskBoardView) {
      activeLeaf.view.openContextualTaskComposer();
      return;
    }

    this.openQuickAddModal();
  }

  private openQuickAddModal(): void {
    new QuickAddModal(this.app, async (title) => {
      await this.store.createTask({ title });
      new Notice("Task added to Inbox");
    }).open();
  }

  private async insertActiveDailyNoteCompletedBlock(): Promise<void> {
    if (!this.settings.dailyNotesIntegrationEnabled) {
      new Notice("belki Daily Notes integration is disabled in settings.");
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a daily note first.");
      return;
    }

    if (!this.dateFromDailyNoteFile(file)) {
      new Notice("belki could not detect a date from the active note.");
      return;
    }

    const result = await this.ensureDailyNoteCompletedBlock(file);
    if (result === "inserted") {
      new Notice("belki completed tasks block added.");
    } else if (result === "exists") {
      new Notice("This note already has a belki completed tasks block.");
    }
  }

  private async handleDailyNoteFileOpen(file: TFile | null): Promise<void> {
    this.refreshDailyNoteViews(file);

    if (!this.settings.dailyNotesAutoInsertCompletedBlock || !file) {
      return;
    }

    const date = this.dateFromDailyNoteFile(file);
    if (!date) {
      return;
    }

    await this.ensureDailyNoteCompletedBlock(file);
  }

  private refreshDailyNoteViews(file: TFile | null): void {
    if (!this.settings.dailyNotesIntegrationEnabled || !file) {
      return;
    }

    const date = this.dateFromDailyNoteFile(file);
    if (!date) {
      return;
    }

    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI)) {
      const view = leaf.view;
      if (view instanceof TaskBoardView) {
        view.openDailyNote(date, file.path);
      }
    }
  }

  private async ensureDailyNoteCompletedBlock(file: TFile): Promise<"inserted" | "exists" | "skipped"> {
    if (!this.settings.dailyNotesIntegrationEnabled || !file.path.toLowerCase().endsWith(".md")) {
      return "skipped";
    }

    const content = await this.app.vault.read(file);
    if (BELKI_COMPLETED_CODE_BLOCK_RE.test(content)) {
      return "exists";
    }

    const separator = content.trim().length > 0
      ? content.endsWith("\n") ? "\n" : "\n\n"
      : "";
    await this.app.vault.modify(file, `${content}${separator}${BELKI_COMPLETED_CODE_BLOCK}\n`);
    return "inserted";
  }

  private renderCompletedTasksCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    ctx.addChild(new DailyNoteCompletedBlock({
      app: this.app,
      containerEl: el,
      source,
      sourcePath: ctx.sourcePath,
      store: this.store,
      settings: this.settings,
      openDailyNote: (date, sourcePath) => {
        void this.activateDailyNoteView(date, sourcePath);
      }
    }));
  }

  private dateFromDailyNoteFile(file: TFile): string | null {
    return dailyNoteDateFromPath(file.path, this.settings.dailyNoteDateFormat);
  }

  private scheduleReload(): void {
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer);
    }
    this.reloadDebounceTimer = window.setTimeout(() => {
      this.reloadDebounceTimer = null;
      void this.reloadTasks();
    }, 300);
  }

  private refreshIfTaskFile(file: TAbstractFile): void {
    if (!this.store.isTaskStorageFile(file.path)) return;
    if (this.store.isCurrentlyWriting(file.path)) return;
    this.scheduleReload();
  }

  private async initializeStore(): Promise<void> {
    return this.storeInitializationGate.run(async () => {
      this.storeInitializationError = null;
      this.refreshBelkiViews();

      try {
        await this.store.load();
        this.storeInitialized = true;
        void this.calendarService.refreshStartup();
      } catch (error) {
        this.storeInitializationError = "belki could not initialize task storage.";
        new Notice("belki could not initialize task storage. Open the developer console for details.");
        console.error("[belki] Failed to initialize task storage.", error, {
          dataFolderPath: this.settings.dataFolderPath,
          tasksFilePath: this.settings.tasksFilePath
        });
        this.refreshBelkiViews();
        throw error;
      }
    });
  }

  private async savePluginData(): Promise<void> {
    await this.saveData({
      settings: this.settings
    });
  }
}

function toSettingsData(value: unknown): Partial<BelkiSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

interface BelkiPluginData {
  settings: Partial<BelkiSettings>;
}

function toPluginData(value: unknown): BelkiPluginData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { settings: {} };
  }

  const record = value as Record<string, unknown>;
  const settings = toSettingsData(record.settings || value);
  return {
    settings
  };
}
