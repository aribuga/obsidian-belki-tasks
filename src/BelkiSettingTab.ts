import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { colorForName } from "./colors";
import {
  DEFAULT_DAILY_NOTE_DATE_FORMAT,
  normalizeDailyNoteDateFormat
} from "./dailyNotes";
import { dedupeLabels, displayLabel, normalizeLabelName } from "./labels";
import {
  applyBelkiFontSettings,
  BelkiSettings,
  DEFAULT_DATA_FOLDER_PATH,
  DEFAULT_SETTINGS,
  fontOptionLabel,
  normalizeDataFolderPath,
  normalizeFontOption,
  normalizeOverdueRange,
  overdueRangeLabel
} from "./settings";
import { FONT_OPTIONS, OVERDUE_RANGES } from "./types";
import { DeleteLabelModal, RenameLabelModal } from "./views/LabelManagementModals";

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
    this.renderSettings();
  }

  private renderSettings(): void {
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

    new Setting(containerEl).setName("Daily Notes").setHeading();

    new Setting(containerEl)
      .setName("Enable Daily Notes integration")
      .setDesc("Allow belki to show completed tasks for the active daily note date.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyNotesIntegrationEnabled)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesIntegrationEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
          });
      });

    new Setting(containerEl)
      .setName("Daily note date format")
      .setDesc("Used to match the active note file to a date. Default: YYYY-MM-DD.")
      .addText((text) => {
        let draftFormat = this.plugin.settings.dailyNoteDateFormat;
        const commitFormat = async () => {
          const normalized = normalizeDailyNoteDateFormat(draftFormat);
          this.plugin.settings.dailyNoteDateFormat = normalized;
          text.setValue(normalized);
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        };

        text
          .setPlaceholder(DEFAULT_DAILY_NOTE_DATE_FORMAT)
          .setValue(this.plugin.settings.dailyNoteDateFormat)
          .onChange((value) => {
            draftFormat = value;
          });

        text.inputEl.addEventListener("blur", () => {
          void commitFormat();
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
      .setName("Auto-add completed tasks block")
      .setDesc("When a daily note is opened, append a belki-completed code block if the note does not already have one.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyNotesAutoInsertCompletedBlock)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesAutoInsertCompletedBlock = value;
            await this.plugin.saveSettings();
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
            this.renderSettings();
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
            this.renderSettings();
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
            this.renderSettings();
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
            this.renderSettings();
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
              this.renderSettings();
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
            this.renderSettings();
          })();
        });
      });
  }
}
