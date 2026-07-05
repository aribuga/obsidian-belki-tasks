import { Notice, Plugin, TAbstractFile, WorkspaceLeaf } from "obsidian";
import {
  BelkiSettingTab,
  BelkiSettings,
  DEFAULT_SETTINGS,
  normalizeDefaultProject,
  normalizeDataFolderPath,
  normalizeFontOption,
  normalizeLabelColorMap,
  normalizeLabelRegistry,
  normalizeOverdueRange,
  normalizeSortMode,
  normalizeProjectRegistry
} from "./settings";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { TaskStore } from "./taskStore";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./views/TaskBoardView";
import { cleanProjectName, uniqueRealProjects } from "./projects";
import { QuickAddModal } from "./views/QuickAddModal";

export default class BelkiPlugin extends Plugin {
  settings: BelkiSettings;
  store: TaskStore;
  private reloadDebounceTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new TaskStore(this.app, this.settings);

    this.registerView(
      VIEW_TYPE_BELKI,
      (leaf: WorkspaceLeaf) =>
        new TaskBoardView(leaf, this.store, this.settings, () => this.saveSettings())
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
      id: "quick-add-task",
      name: "Quick Add Task",
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "A"
        }
      ],
      callback: () => {
        new QuickAddModal(this.app, async (title) => {
          await this.store.createTask({ title });
          new Notice("Task added to Inbox");
        }).open();
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

    void this.initializeStore();
  }

  onunload(): void {
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer);
    }
  }

  async loadSettings(): Promise<void> {
    const saved = toSettingsData(await this.loadData());
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
      labelFont: normalizeFontOption(saved?.labelFont)
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async reloadTasks(): Promise<void> {
    try {
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
    try {
      await this.store.load();
    } catch (error) {
      new Notice("belki could not initialize task storage. Open the developer console for details.");
      console.error("[belki] Failed to initialize task storage.", error, {
        dataFolderPath: this.settings.dataFolderPath,
        tasksFilePath: this.settings.tasksFilePath
      });
    }
  }
}

function toSettingsData(value: unknown): Partial<BelkiSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}
