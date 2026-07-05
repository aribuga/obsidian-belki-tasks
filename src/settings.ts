import { App, normalizePath, Plugin, PluginSettingTab, Setting } from "obsidian";
import { colorForName } from "./colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "./labels";
import { normalizeTaskProject } from "./projects";
import { DeleteLabelModal, RenameLabelModal } from "./views/LabelManagementModals";
import {
  BelkiFontOption,
  BelkiSortMode,
  FONT_OPTIONS,
  OVERDUE_RANGES,
  OverdueRange,
  SORT_MODES
} from "./types";

export const DEFAULT_DATA_FOLDER_PATH = "_belki_files";

export interface BelkiSettings {
  tasksFilePath: string;
  dataFolderPath: string;
  defaultProject: string;
  icons: BelkiIconSettings;
  projectColors: Record<string, string>;
  labelColors: Record<string, string>;
  labelRegistry: string[];
  projectRegistry: string[];
  sortMode: BelkiSortMode;
  groupBy: "none" | "label" | "priority";
  defaultOverdueRange: OverdueRange;
  uiFont: BelkiFontOption;
  taskTitleFont: BelkiFontOption;
  taskDescriptionFont: BelkiFontOption;
  labelFont: BelkiFontOption;
  archivedProjects: string[];
}

export interface BelkiIconSettings {
  search: string;
  inbox: string;
  today: string;
  upcoming: string;
  filters: string;
  projects: string;
  activity: string;
  completed: string;
}

export const DEFAULT_SETTINGS: BelkiSettings = {
  tasksFilePath: "belki/tasks.md",
  dataFolderPath: DEFAULT_DATA_FOLDER_PATH,
  defaultProject: "",
  icons: {
    search: "search",
    inbox: "inbox",
    today: "today",
    upcoming: "upcoming",
    filters: "filters",
    projects: "projects",
    activity: "activity",
    completed: "completed"
  },
  projectColors: {},
  labelColors: {},
  labelRegistry: [],
  projectRegistry: [],
  archivedProjects: [],
  sortMode: "smart",
  groupBy: "none",
  defaultOverdueRange: "last7",
  uiFont: "system",
  taskTitleFont: "system",
  taskDescriptionFont: "system",
  labelFont: "system"
};

const OVERDUE_RANGE_LABELS: Record<OverdueRange, string> = {
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  older: "Older"
};

const FONT_OPTION_LABELS: Record<BelkiFontOption, string> = {
  system: "System Font",
  ibmPlexSans: "IBM Plex Sans",
  ibmPlexMono: "IBM Plex Mono",
  spaceGrotesk: "Space Grotesk",
  spaceMono: "Space Mono",
  manrope: "Manrope",
  jetBrainsMono: "JetBrains Mono",
  sourceSans3: "Source Sans 3",
  inter: "Inter",
  geistMono: "Geist Mono",
  dmSans: "DM Sans"
};

const BELKI_FONT_STACKS: Record<BelkiFontOption, string> = {
  system: 'var(--font-interface), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ibmPlexSans: '"IBM Plex Sans", var(--font-interface), system-ui, sans-serif',
  ibmPlexMono: '"IBM Plex Mono", var(--font-monospace), monospace',
  spaceGrotesk: '"Space Grotesk", var(--font-interface), system-ui, sans-serif',
  spaceMono: '"Space Mono", var(--font-monospace), monospace',
  manrope: '"Manrope", var(--font-interface), system-ui, sans-serif',
  jetBrainsMono: '"JetBrains Mono", var(--font-monospace), monospace',
  sourceSans3: '"Source Sans 3", var(--font-interface), system-ui, sans-serif',
  inter: '"Inter", var(--font-interface), system-ui, sans-serif',
  geistMono: '"Geist Mono", var(--font-monospace), monospace',
  dmSans: '"DM Sans", var(--font-interface), system-ui, sans-serif'
};

export function normalizeLabelColorMap(
  colors: Record<string, string> | undefined
): Record<string, string> {
  const normalizedColors: Record<string, string> = {};

  for (const [label, color] of Object.entries(colors || {})) {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      continue;
    }

    normalizedColors[normalized] = color;
  }

  return normalizedColors;
}

export function normalizeLabelRegistry(labels: string[] | undefined): string[] {
  return dedupeLabels(labels || []);
}

export function normalizeProjectRegistry(projects: string[] | undefined): string[] {
  return [...new Set((projects || []).map(normalizeTaskProject).filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeDataFolderPath(value: string | undefined): string {
  const trimmed = (value || "").trim().replace(/^\/+/, "");
  const normalized = normalizePath(trimmed || DEFAULT_DATA_FOLDER_PATH)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized || DEFAULT_DATA_FOLDER_PATH;
}

export function normalizeSortMode(value: string | undefined): BelkiSortMode {
  return SORT_MODES.includes(value as BelkiSortMode)
    ? (value as BelkiSortMode)
    : DEFAULT_SETTINGS.sortMode;
}

export function normalizeOverdueRange(value: string | undefined): OverdueRange {
  return OVERDUE_RANGES.includes(value as OverdueRange)
    ? (value as OverdueRange)
    : DEFAULT_SETTINGS.defaultOverdueRange;
}

export function normalizeFontOption(value: string | undefined): BelkiFontOption {
  return FONT_OPTIONS.includes(value as BelkiFontOption)
    ? (value as BelkiFontOption)
    : "system";
}

export function normalizeDefaultProject(value: string | undefined): string {
  return normalizeTaskProject(value) || "";
}

export function fontOptionLabel(option: BelkiFontOption): string {
  return FONT_OPTION_LABELS[option];
}

export function overdueRangeLabel(range: OverdueRange): string {
  return OVERDUE_RANGE_LABELS[range];
}

export function fontStackForOption(option: BelkiFontOption): string {
  return BELKI_FONT_STACKS[option] || BELKI_FONT_STACKS.system;
}

export function applyBelkiFontSettings(
  element: HTMLElement,
  settings: BelkiSettings
): void {
  element.setCssProps({
    "--belki-font-ui": fontStackForOption(settings.uiFont),
    "--belki-font-task-title": fontStackForOption(settings.taskTitleFont),
    "--belki-font-task-description": fontStackForOption(settings.taskDescriptionFont),
    "--belki-font-label": fontStackForOption(settings.labelFont)
  });
}

interface BelkiSettingsPlugin extends Plugin {
  settings: BelkiSettings;
  saveSettings(): Promise<void>;
  reloadTasks(): Promise<void>;
  refreshBelkiViews(): void;
  getProjectNames(): string[];
  getLabelNames(): string[];
  getLabelTaskCount(label: string): number;
  renameLabel(oldLabel: string, newLabel: string): Promise<void>;
  deleteLabel(label: string): Promise<void>;
}

export class BelkiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BelkiSettingsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    applyBelkiFontSettings(containerEl, this.plugin.settings);

    new Setting(containerEl)
      .setName("Old task file")
      .setDesc("Legacy Markdown file used by older belki versions.")
      .addText((text) => {
        text
          .setPlaceholder("belki/tasks.md")
          .setValue(this.plugin.settings.tasksFilePath)
          .onChange(async (value) => {
            this.plugin.settings.tasksFilePath = value.trim() || DEFAULT_SETTINGS.tasksFilePath;
            await this.plugin.saveSettings();
            await this.plugin.reloadTasks();
          });
      });

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Folder where belki stores task data and attachments.")
      .addText((text) => {
        let draftPath = this.plugin.settings.dataFolderPath;
        const commitPathChange = async () => {
          const normalizedPath = normalizeDataFolderPath(draftPath);
          if (normalizedPath === this.plugin.settings.dataFolderPath) {
            text.setValue(normalizedPath);
            return;
          }

          this.plugin.settings.dataFolderPath = normalizedPath;
          text.setValue(normalizedPath);
          await this.plugin.saveSettings();
          await this.plugin.reloadTasks();
        };

        text
          .setPlaceholder(DEFAULT_DATA_FOLDER_PATH)
          .setValue(this.plugin.settings.dataFolderPath)
          .onChange((value) => {
            draftPath = value;
          });

        text.inputEl.addEventListener("blur", () => {
          void commitPathChange();
        });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          text.inputEl.blur();
        });
      });

    new Setting(containerEl)
      .setName("Default overdue range")
      .setDesc("Default range used by the Today overdue section.")
      .addDropdown((dropdown) => {
        for (const range of OVERDUE_RANGES) {
          dropdown.addOption(range, overdueRangeLabel(range));
        }
        dropdown
          .setValue(this.plugin.settings.defaultOverdueRange)
          .onChange(async (value) => {
            this.plugin.settings.defaultOverdueRange = normalizeOverdueRange(value);
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
          });
      });

    new Setting(containerEl).setName("Fonts").setHeading();

    this.addFontSetting(
      "UI Font",
      "Used for sidebar, headings, buttons, settings, and the general interface.",
      "uiFont"
    );
    this.addFontSetting(
      "Task Title Font",
      "Used for task row titles and the task detail title input.",
      "taskTitleFont"
    );
    this.addFontSetting(
      "Task Description Font",
      "Used for task row descriptions and the task detail description textarea.",
      "taskDescriptionFont"
    );
    this.addFontSetting(
      "Label Font",
      "Used for label chip text.",
      "labelFont"
    );

    new Setting(containerEl).setName("Project colors").setHeading();

    const projects = this.plugin.getProjectNames();
    if (projects.length === 0) {
      containerEl.createDiv({
        cls: "setting-item-description",
        text: "No projects yet. belki will generate stable colors when projects appear."
      });
    }

    for (const project of projects) {
      this.addProjectColorSetting(project);
    }

    new Setting(containerEl).setName("Label colors").setHeading();

    this.addLabelRegistrySetting();

    const labels = this.plugin.getLabelNames();
    if (labels.length === 0) {
      containerEl.createDiv({
        cls: "setting-item-description",
        text: "No labels yet. Add one here or create one from Filters & Labels."
      });
    }

    for (const label of labels) {
      this.addLabelColorSetting(label);
    }
  }

  private addFontSetting(
    name: string,
    description: string,
    key: "uiFont" | "taskTitleFont" | "taskDescriptionFont" | "labelFont"
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addDropdown((dropdown) => {
        for (const option of FONT_OPTIONS) {
          dropdown.addOption(option, fontOptionLabel(option));
        }
        dropdown
          .setValue(this.plugin.settings[key])
          .onChange(async (value) => {
            this.plugin.settings[key] = normalizeFontOption(value);
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          });
      });
  }

  private addProjectColorSetting(project: string): void {
    const automaticColor = colorForName(project).regular;
    const override = this.plugin.settings.projectColors[project];

    new Setting(this.containerEl)
      .setName(project)
      .setDesc(override ? "Custom color override" : "Automatic palette color")
      .addColorPicker((picker) => {
        picker.setValue(override || automaticColor).onChange(async (value) => {
          this.plugin.settings.projectColors[project] = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      })
      .addButton((button) => {
        button.setButtonText("Reset").onClick(() => {
          void (async () => {
            delete this.plugin.settings.projectColors[project];
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          })();
        });
      });
  }

  private addLabelRegistrySetting(): void {
    let pendingLabel = "";

    new Setting(this.containerEl)
      .setName("Add label")
      .setDesc("Create a label without assigning it to a task yet.")
      .addText((text) => {
        text.setPlaceholder("#label").onChange((value) => {
          pendingLabel = value;
        });
      })
      .addButton((button) => {
        button.setButtonText("Add").onClick(() => {
          void (async () => {
            const label = normalizeLabelName(pendingLabel);
            if (!label) {
              return;
            }

            this.plugin.settings.labelRegistry = dedupeLabels([
              ...this.plugin.settings.labelRegistry,
              label
            ]);
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          })();
        });
      });
  }

  private addLabelColorSetting(label: string): void {
    const automaticColor = colorForName(label).regular;
    const override = this.plugin.settings.labelColors[label];

    new Setting(this.containerEl)
      .setName(displayLabel(label))
      .setDesc(override ? "Custom color override" : "Automatic palette color")
      .addColorPicker((picker) => {
        picker.setValue(override || automaticColor).onChange(async (value) => {
          this.plugin.settings.labelColors[label] = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      })
      .addButton((button) => {
        button.setButtonText("Rename").onClick(() => {
          new RenameLabelModal(this.app, label, this.plugin.getLabelNames(), async (newLabel) => {
            await this.plugin.renameLabel(label, newLabel);
            this.display();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Delete").onClick(() => {
          new DeleteLabelModal(
            this.app,
            label,
            this.plugin.getLabelTaskCount(label),
            async () => {
              await this.plugin.deleteLabel(label);
              this.display();
            }
          ).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Reset").onClick(() => {
          void (async () => {
            delete this.plugin.settings.labelColors[label];
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          })();
        });
      });
  }
}
