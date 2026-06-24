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
  normalizeSortMode
} from "./settings";
import { dedupeLabels } from "./labels";
import { TaskStore } from "./taskStore";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./views/TaskBoardView";
import { DEMO_LABELS } from "./demoData";
import { cleanProjectName, uniqueRealProjects } from "./projects";

export default class BelkiPlugin extends Plugin {
  settings: BelkiSettings;
  store: TaskStore;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new TaskStore(this.app, this.settings);
    await this.store.load();

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

    this.addCommand({
      id: "reset-and-seed-demo-data",
      name: "Reset and seed demo data",
      callback: async () => {
        try {
          const taskCount = await this.store.resetAndSeedDemoData();
          this.settings.labelRegistry = normalizeLabelRegistry([
            ...this.settings.labelRegistry,
            ...DEMO_LABELS
          ]);
          await this.saveSettings();
          await this.activateView();
          new Notice(`belki seeded ${taskCount} demo tasks.`);
        } catch (error) {
          new Notice("belki could not seed demo data.");
          console.error(error);
        }
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
          void this.reloadTasks();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.store.isTaskStorageFile(file.path)) {
          void this.reloadTasks();
        }
      })
    );
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
      ...Object.keys(this.settings.projectColors).map(cleanProjectName)
    ]);
  }

  getLabelNames(): string[] {
    const taskLabels = this.store
      .getTasks()
      .flatMap((task) => task.labels);

    return dedupeLabels([
      ...this.settings.labelRegistry,
      ...Object.keys(this.settings.labelColors),
      ...taskLabels
    ]).sort((a, b) => a.localeCompare(b));
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

  private async refreshIfTaskFile(file: TAbstractFile): Promise<void> {
    if (this.store.isTaskStorageFile(file.path)) {
      await this.reloadTasks();
    }
  }
}

function toSettingsData(value: unknown): Partial<BelkiSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Partial<BelkiSettings>;
}
