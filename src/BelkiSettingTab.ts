import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
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

    this.renderCalendarSettings();

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

  private renderCalendarSettings(): void {
    new Setting(this.containerEl).setName("Calendar").setHeading();
    this.containerEl.createDiv({
      cls: "setting-item-description belki-calendar-settings-description",
      text: "Display read-only calendar events inside Today and Upcoming by subscribing to private or public iCal feeds."
    });

    this.containerEl.createDiv({
      cls: "setting-item-description belki-calendar-help",
      text: "Google Calendar: open Google Calendar settings, select a calendar under Settings for my calendars, open Integrate calendar, copy Secret address in iCal format, and paste it into belki. Public iCal links work only when the calendar is public. Treat private links like passwords. Each calendar is added separately; belki fetches updates periodically and cannot edit events."
    });

    const service = this.plugin.calendarService;
    const state = service.getConnectionState();

    new Setting(this.containerEl)
      .setName("Add iCal calendar")
      .setDesc("Subscribe to an HTTPS or webcal iCal feed. The URL is stored locally and masked after saving.")
      .addButton((button) => {
        button.setButtonText("Add iCal calendar").onClick(() => {
          new IcalCalendarFeedModal(this.app, {
            title: "Add iCal calendar",
            service,
            onSaved: () => this.renderSettings()
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText(state.loading ? "Refreshing..." : "Refresh all").setDisabled(state.loading).onClick(() => {
          void (async () => {
            const pending = service.manualRefresh();
            this.renderSettings();
            await pending;
            this.renderSettings();
          })();
        });
      });

    if (state.loading) {
      this.renderCalendarStatus("Refreshing calendar feeds...", "loading");
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
        text: "No iCal calendars yet."
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
            .setButtonText(calendar.loading ? "Refreshing..." : "Refresh")
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
          button.setButtonText("Edit").onClick(() => {
            new IcalCalendarFeedModal(this.app, {
              title: "Edit iCal calendar",
              service,
              feed,
              onSaved: () => this.renderSettings()
            }).open();
          });
        })
        .addButton((button) => {
          button.setButtonText("Remove").onClick(() => {
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
    const fragment = document.createDocumentFragment();
    fragment.appendText(maskIcalFeedUrl(feed.url));
    fragment.appendText(` - ${calendarFeedStatusText(feed, loading)}`);
    return fragment;
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
      .setName("Calendar name")
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
      .setName(this.options.feed ? "Replace iCal URL" : "Private or public iCal URL")
      .setDesc(this.options.feed
        ? "Leave empty to keep the saved URL. The existing URL is not shown."
        : "Accepts HTTPS and webcal URLs.")
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
      .setName("Calendar color")
      .addColorPicker((picker) => {
        picker
          .setValue(this.color)
          .onChange((value) => {
            this.color = value;
          });
      });

    new Setting(contentEl)
      .setName("Enabled")
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
        button.setButtonText("Test connection").onClick(() => {
          void this.testConnection();
        });
      })
      .addButton((button) => {
        button
          .setButtonText(this.options.feed ? "Save changes" : "Add calendar")
          .setCta()
          .onClick(() => {
            void this.save();
          });
      })
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.close());
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
    this.setStatus("Testing calendar feed...", "loading");
    try {
      const result = await this.options.service.testFeed(this.draftForTest());
      this.setStatus(
        `Connection works${result.name ? `: ${result.name}` : ""}. ${result.eventCount} event${result.eventCount === 1 ? "" : "s"} found in the current window.`,
        "success"
      );
    } catch (error) {
      this.setStatus(calendarErrorMessage(error, "Calendar feed could not be tested."), "error");
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

      new Notice(this.options.feed ? "Calendar updated." : "Calendar added.");
      this.options.onSaved();
      this.close();
    } catch (error) {
      this.setStatus(calendarErrorMessage(error, "Calendar feed could not be saved."), "error");
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
    contentEl.createEl("h2", { text: "Remove calendar?" });
    contentEl.createDiv({
      cls: "setting-item-description",
      text: `Remove ${this.feed.name} from belki. This clears its saved iCal URL and cached events, but does not modify tasks.`
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Remove").setWarning().onClick(() => {
          void (async () => {
            await this.onConfirm();
            new Notice("Calendar removed.");
            this.close();
          })();
        });
      })
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.close());
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
    return "Disabled";
  }

  if (loading) {
    return "Updating...";
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
