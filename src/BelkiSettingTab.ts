import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
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
import { CalendarService } from "./calendar/CalendarService";
import type { IcalCalendarFeed } from "./calendar/calendarTypes";
import {
  calendarErrorMessage,
  describeIcalFeedUrl,
  maskIcalFeedUrl,
  type IcalFeedDraft
} from "./calendar/icalFeedSettings";
import { t } from "./i18n";

interface BelkiSettingsPlugin extends Plugin {
  settings: BelkiSettings;
  saveSettings(): Promise<void>;
  reloadTasks(): Promise<void>;
  refreshBelkiViews(): void;
  calendarService: CalendarService;
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

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }

  display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    applyBelkiFontSettings(containerEl, this.plugin.settings);

    new Setting(containerEl)
      .setName(t("settings.oldTaskFile"))
      .setDesc(t("settings.oldTaskFileDesc"))
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
      .setName(t("settings.dataFolder"))
      .setDesc(t("settings.dataFolderDesc"))
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
      .setName(t("settings.defaultOverdueRange"))
      .setDesc(t("settings.defaultOverdueRangeDesc"))
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

    new Setting(containerEl).setName(t("settings.dailyNotes")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.enableDailyNotesIntegration"))
      .setDesc(t("settings.enableDailyNotesIntegrationDesc"))
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
      .setName(t("settings.dailyNoteDateFormat"))
      .setDesc(t("settings.dailyNoteDateFormatDesc"))
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
      .setName(t("settings.autoAddCompletedTasksBlock"))
      .setDesc(t("settings.autoAddCompletedTasksBlockDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyNotesAutoInsertCompletedBlock)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesAutoInsertCompletedBlock = value;
            await this.plugin.saveSettings();
          });
      });

    this.renderCalendarSettings();

    new Setting(containerEl).setName(t("settings.fonts")).setHeading();

    this.addFontSetting(
      t("settings.uiFont"),
      t("settings.uiFontDesc"),
      "uiFont"
    );
    this.addFontSetting(
      t("settings.taskTitleFont"),
      t("settings.taskTitleFontDesc"),
      "taskTitleFont"
    );
    this.addFontSetting(
      t("settings.taskDescriptionFont"),
      t("settings.taskDescriptionFontDesc"),
      "taskDescriptionFont"
    );
    this.addFontSetting(
      t("settings.labelFont"),
      t("settings.labelFontDesc"),
      "labelFont"
    );

    new Setting(containerEl).setName(t("settings.projectColors")).setHeading();

    const projects = this.plugin.getProjectNames();
    if (projects.length === 0) {
      containerEl.createDiv({
        cls: "setting-item-description",
        text: t("settings.noProjectsYet")
      });
    }

    for (const project of projects) {
      this.addProjectColorSetting(project);
    }

    new Setting(containerEl).setName(t("settings.labelColors")).setHeading();

    this.addLabelRegistrySetting();

    const labels = this.plugin.getLabelNames();
    if (labels.length === 0) {
      containerEl.createDiv({
        cls: "setting-item-description",
        text: t("settings.noLabelsYet")
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

  private renderCalendarSettings(): void {
    new Setting(this.containerEl).setName(t("settings.dailyNotes")).setHeading();
    this.containerEl.createDiv({
      cls: "setting-item-description belki-calendar-settings-description",
      text: t("calendar.description")
    });

    this.containerEl.createDiv({
      cls: "setting-item-description belki-calendar-help",
      text: t("calendar.googleCalendarHelp")
    });

    const service = this.plugin.calendarService;
    const state = service.getConnectionState();

    new Setting(this.containerEl)
      .setName(t("calendar.addIcalCalendar"))
      .setDesc(t("calendar.acceptsHttpsAndWebcal"))
      .addButton((button) => {
        button.setButtonText(t("calendar.addIcalCalendar")).onClick(() => {
          new IcalCalendarFeedModal(this.app, {
            title: t("calendar.addIcalCalendar"),
            service,
            onSaved: () => this.renderSettings()
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText(state.loading ? t("common.refreshing") : t("common.refresh")).setDisabled(state.loading).onClick(() => {
          void (async () => {
            const pending = service.manualRefresh();
            this.renderSettings();
            await pending;
            this.renderSettings();
          })();
        });
      });

    if (state.loading) {
      this.renderCalendarStatus(t("calendar.refreshingCalendarFeeds"), "loading");
    }

    if (state.partialErrors.length > 0) {
      this.renderCalendarStatus(
        `${state.partialErrors.length} calendar feed${state.partialErrors.length === 1 ? "" : "s"} could not be refreshed.`,
        "warning"
      );
    }

    const calendars = service.getCalendars();
    if (calendars.length === 0) {
      this.containerEl.createDiv({
        cls: "setting-item-description",
        text: t("calendar.noIcalCalendarsYet")
      });
      return;
    }

    for (const calendar of calendars) {
      const feed = this.plugin.settings.icalCalendarFeeds.find((candidate) => candidate.id === calendar.id);
      if (!feed) {
        continue;
      }

      const setting = new Setting(this.containerEl)
        .setName(calendar.name)
        .setDesc(this.calendarFeedDescription(feed, calendar.loading))
        .addToggle((toggle) => {
          toggle
            .setValue(calendar.enabled)
            .onChange(async (value) => {
              await service.setFeedEnabled(calendar.id, value);
              this.renderSettings();
            });
        })
        .addButton((button) => {
          button
            .setButtonText(calendar.loading ? t("common.refreshing") : t("common.refresh"))
            .setDisabled(calendar.loading)
            .onClick(() => {
              void (async () => {
                const pending = service.manualRefresh(calendar.id);
                this.renderSettings();
                await pending;
                this.renderSettings();
              })();
            });
        })
        .addButton((button) => {
          button.setButtonText(t("common.edit")).onClick(() => {
            new IcalCalendarFeedModal(this.app, {
              title: t("calendar.editIcalCalendar"),
              service,
              feed,
              onSaved: () => this.renderSettings()
            }).open();
          });
        })
        .addButton((button) => {
          button.setButtonText(t("common.delete")).onClick(() => {
            new RemoveIcalCalendarFeedModal(this.app, feed, async () => {
              await service.removeFeed(feed.id);
              this.renderSettings();
            }).open();
          });
        });

      setting.nameEl.createSpan({
        cls: "belki-calendar-feed-color",
        attr: { "aria-hidden": "true" }
      }).setCssProps({ "--belki-calendar-color": calendar.color });

      if (calendar.error) {
        setting.settingEl.addClass("is-error");
        setting.descEl.createDiv({
          cls: "belki-calendar-feed-error",
          text: calendar.error.message
        });
      }
    }
  }

  private calendarFeedDescription(feed: IcalCalendarFeed, loading: boolean): DocumentFragment {
    return createFragment((fragment) => {
      fragment.appendText(maskIcalFeedUrl(feed.url));
      fragment.appendText(` - ${calendarFeedStatusText(feed, loading)}`);
    });
  }

  private renderCalendarStatus(message: string, kind: "loading" | "warning" | "error"): void {
    this.containerEl.createDiv({
      cls: `setting-item-description belki-calendar-status is-${kind}`,
      text: message
    });
  }

  private addProjectColorSetting(project: string): void {
    const automaticColor = colorForName(project).regular;
    const override = this.plugin.settings.projectColors[project];

    new Setting(this.containerEl)
      .setName(project)
      .setDesc(override ? t("calendar.customColorOverride") : t("calendar.automaticPaletteColor"))
      .addColorPicker((picker) => {
        picker.setValue(override || automaticColor).onChange(async (value) => {
          this.plugin.settings.projectColors[project] = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("common.reset")).onClick(() => {
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
      .setName(t("settings.addLabel"))
      .setDesc(t("settings.addLabelDesc"))
      .addText((text) => {
        text.setPlaceholder("#label").onChange((value) => {
          pendingLabel = value;
        });
      })
      .addButton((button) => {
        button.setButtonText(t("common.addTask")).onClick(() => {
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
      .setDesc(override ? t("calendar.customColorOverride") : t("calendar.automaticPaletteColor"))
      .addColorPicker((picker) => {
        picker.setValue(override || automaticColor).onChange(async (value) => {
          this.plugin.settings.labelColors[label] = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("common.rename")).onClick(() => {
          new RenameLabelModal(this.app, label, this.plugin.getLabelNames(), async (newLabel) => {
            await this.plugin.renameLabel(label, newLabel);
            this.renderSettings();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("common.delete")).onClick(() => {
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
        button.setButtonText(t("common.reset")).onClick(() => {
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

interface IcalCalendarFeedModalOptions {
  title: string;
  service: CalendarService;
  feed?: IcalCalendarFeed;
  onSaved(): void;
}

class IcalCalendarFeedModal extends Modal {
  private name = "";
  private url = "";
  private color = "#3b82f6";
  private enabled = true;
  private statusEl: HTMLElement | null = null;
  private urlHintEl: HTMLElement | null = null;

  constructor(app: App, private options: IcalCalendarFeedModalOptions) {
    super(app);
    if (options.feed) {
      this.name = options.feed.name;
      this.color = options.feed.color;
      this.enabled = options.feed.enabled;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.options.title });

    new Setting(contentEl)
      .setName(t("calendar.calendarName"))
      .addText((text) => {
        text
          .setPlaceholder("Personal")
          .setValue(this.name)
          .onChange((value) => {
            this.name = value;
          });
      });

    if (this.options.feed) {
      contentEl.createDiv({
        cls: "setting-item-description",
        text: `Saved URL: ${maskIcalFeedUrl(this.options.feed.url)}`
      });
    }

    const urlSetting = new Setting(contentEl)
      .setName(this.options.feed ? t("calendar.replaceIcalUrl") : t("calendar.privateOrPublicIcalUrl"))
      .setDesc(this.options.feed
        ? t("calendar.leaveEmptyToKeepSavedUrl")
        : t("calendar.acceptsHttpsAndWebcal"))
      .addText((text) => {
        text
          .setPlaceholder("https://example.com/calendar.ics")
          .onChange((value) => {
            this.url = value;
            this.renderUrlHint();
          });
      });
    urlSetting.settingEl.addClass("belki-calendar-url-setting");

    this.urlHintEl = contentEl.createDiv({
      cls: "setting-item-description belki-calendar-url-hint"
    });
    this.renderUrlHint();

    new Setting(contentEl)
      .setName(t("calendar.calendarColor"))
      .addColorPicker((picker) => {
        picker
          .setValue(this.color)
          .onChange((value) => {
            this.color = value;
          });
      });

    new Setting(contentEl)
      .setName(t("common.enabled"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.enabled)
          .onChange((value) => {
            this.enabled = value;
          });
      });

    this.statusEl = contentEl.createDiv({ cls: "setting-item-description belki-calendar-modal-status" });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("calendar.testConnection")).onClick(() => {
          void this.testConnection();
        });
      })
      .addButton((button) => {
        button
          .setButtonText(this.options.feed ? t("calendar.saveChanges") : t("calendar.addCalendar"))
          .setCta()
          .onClick(() => {
            void this.save();
          });
      })
      .addButton((button) => {
        button.setButtonText(t("common.cancel")).onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private draftForTest(): IcalFeedDraft {
    const fallbackUrl = this.options.feed?.url || "";
    return {
      name: this.name,
      url: this.url.trim() || fallbackUrl,
      color: this.color,
      enabled: this.enabled
    };
  }

  private async testConnection(): Promise<void> {
    this.setStatus(t("calendar.testingCalendarFeed"), "loading");
    try {
      const result = await this.options.service.testFeed(this.draftForTest());
      this.setStatus(
        `${t("calendar.connectionWorks")}${result.name ? `: ${result.name}` : ""}. ${result.eventCount} event${result.eventCount === 1 ? "" : "s"} found in the current window.`,
        "success"
      );
    } catch (error) {
      this.setStatus(calendarErrorMessage(error, t("calendar.calendarFeedCouldNotBeTested")), "error");
    }
  }

  private async save(): Promise<void> {
    try {
      if (this.options.feed) {
        await this.options.service.updateFeed(this.options.feed.id, {
          name: this.name,
          color: this.color,
          enabled: this.enabled,
          replacementUrl: this.url
        });
      } else {
        await this.options.service.addFeed(this.draftForTest());
      }

      new Notice(this.options.feed ? t("calendar.calendarUpdated") : t("calendar.calendarAdded"));
      this.options.onSaved();
      this.close();
    } catch (error) {
      this.setStatus(calendarErrorMessage(error, t("calendar.calendarFeedCouldNotBeSaved")), "error");
    }
  }

  private setStatus(message: string, kind: "loading" | "success" | "error"): void {
    if (!this.statusEl) {
      return;
    }

    this.statusEl.setText(message);
    this.statusEl.className = `setting-item-description belki-calendar-modal-status is-${kind}`;
  }

  private renderUrlHint(): void {
    if (!this.urlHintEl) {
      return;
    }

    const value = this.url.trim() || this.options.feed?.url || "";
    this.urlHintEl.setText(describeIcalFeedUrl(value));
  }
}

class RemoveIcalCalendarFeedModal extends Modal {
  constructor(
    app: App,
    private feed: IcalCalendarFeed,
    private onConfirm: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("calendar.removeCalendar") });
    contentEl.createDiv({
      cls: "setting-item-description",
      text: t("calendar.removeCalendarDesc", { name: this.feed.name })
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("common.delete"));
        button.buttonEl.addClass("mod-warning");
        button.onClick(() => {
          void (async () => {
            await this.onConfirm();
            new Notice(t("calendar.calendarRemoved"));
            this.close();
          })();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("common.cancel")).onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function formatSettingsRefreshTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function calendarFeedStatusText(feed: IcalCalendarFeed, loading: boolean): string {
  if (!feed.enabled) {
    return t("common.disabled");
  }

  if (loading) {
    return t("common.refreshing");
  }

  if (feed.lastError) {
    const retryText = retryStatusText(feed.nextAutomaticRefreshAt);
    if (feed.lastSuccessfulRefreshAt) {
      return `Couldn't refresh - showing last successful data${retryText}`;
    }
    return `Couldn't refresh - never refreshed successfully${retryText}`;
  }

  if (feed.lastSuccessfulRefreshAt) {
    return `Updated ${relativeSettingsTime(feed.lastSuccessfulRefreshAt)}`;
  }

  if (feed.lastAttemptedRefreshAt) {
    return "Never refreshed successfully";
  }

  return "Never refreshed successfully";
}

function retryStatusText(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const retryAt = new Date(value).getTime();
  const now = Date.now();
  if (!Number.isFinite(retryAt) || retryAt <= now) {
    return "";
  }

  return ` - automatic retry in ${formatDuration(retryAt - now)}`;
}

function relativeSettingsTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return formatSettingsRefreshTime(value);
  }

  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60 * 1000) {
    return "just now";
  }

  return `${formatDuration(elapsed)} ago`;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
