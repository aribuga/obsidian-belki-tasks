import { MarkdownRenderChild } from "obsidian";
import type { App } from "obsidian";
import { getLabelColor, getProjectColor } from "../colors";
import { dailyNoteDateFromPath } from "../dailyNotes";
import { displayLabel } from "../labels";
import { getPriorityClass, getPriorityDisplayLabel, hasVisiblePriority } from "../priority";
import { normalizeTaskProject } from "../projects";
import { BelkiSettings } from "../settings";
import { TaskStore } from "../taskStore";
import { BelkiTask } from "../types";
import { renderLinkedText } from "./linkedText";

interface DailyNoteCompletedBlockOptions {
  containerEl: HTMLElement;
  source: string;
  sourcePath: string;
  app: App;
  store: TaskStore;
  settings: BelkiSettings;
  openDailyNote: (date: string, sourcePath: string) => void;
}

const DATE_OPTION_RE = /(?:^|\n)\s*date\s*:\s*(\d{4}-\d{2}-\d{2})\s*(?:\n|$)/i;
const DATE_LINE_RE = /^\s*(\d{4}-\d{2}-\d{2})\s*$/m;

export class DailyNoteCompletedBlock extends MarkdownRenderChild {
  private readonly source: string;
  private readonly sourcePath: string;
  private readonly app: App;
  private readonly store: TaskStore;
  private readonly settings: BelkiSettings;
  private readonly openDailyNote: (date: string, sourcePath: string) => void;
  private unsubscribe?: () => void;

  constructor(options: DailyNoteCompletedBlockOptions) {
    super(options.containerEl);
    this.source = options.source;
    this.sourcePath = options.sourcePath;
    this.app = options.app;
    this.store = options.store;
    this.settings = options.settings;
    this.openDailyNote = options.openDailyNote;
  }

  onload(): void {
    this.unsubscribe = this.store.subscribe(() => {
      this.render();
    });
    this.render();
  }

  onunload(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: "belki-daily-codeblock" });

    if (!this.settings.dailyNotesIntegrationEnabled) {
      root.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "belki Daily Notes integration is disabled in settings."
      });
      return;
    }

    const date = this.resolveDate();
    if (!date) {
      root.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "belki could not detect a date for this note."
      });
      return;
    }

    const tasks = this.store.getCompletedTasksForDate(date);
    const header = root.createDiv({ cls: "belki-daily-codeblock-header" });
    const heading = header.createDiv();
    heading.createDiv({
      cls: "belki-daily-codeblock-title",
      text: formatDailyBlockTitle(date)
    });
    heading.createDiv({
      cls: "belki-daily-codeblock-subtitle",
      text: tasks.length === 1 ? "1 completed task" : `${tasks.length} completed tasks`
    });

    const openButton = header.createEl("button", {
      cls: "belki-daily-codeblock-open",
      text: "Open in belki"
    });
    openButton.addEventListener("click", () => {
      this.openDailyNote(date, this.sourcePath);
    });

    if (tasks.length === 0) {
      root.createDiv({
        cls: "belki-empty belki-empty-small",
        text: "No tasks completed on this day."
      });
      return;
    }

    const list = root.createDiv({ cls: "belki-daily-codeblock-list" });
    for (const task of tasks) {
      this.renderTaskRow(list, task);
    }
  }

  private renderTaskRow(parent: HTMLElement, task: BelkiTask): void {
    const row = parent.createDiv({ cls: "belki-daily-codeblock-row" });
    renderLinkedText(task.title, row.createDiv({ cls: "belki-daily-codeblock-task-title" }), {
      app: this.app,
      sourcePath: task.sourcePath || this.sourcePath
    });

    const meta = row.createDiv({ cls: "belki-daily-codeblock-meta" });
    const project = normalizeTaskProject(task.project);
    if (project) {
      const color = getProjectColor(project, this.settings.projectColors);
      const chip = meta.createSpan({ cls: "belki-daily-codeblock-chip" });
      chip.setCssStyles({ backgroundColor: color.light });
      chip.createSpan({ cls: "belki-project-dot" }).setCssStyles({
        backgroundColor: color.regular
      });
      chip.createSpan({ text: project });
    }

    if (hasVisiblePriority(task.priority)) {
      meta.createSpan({
        cls: `belki-daily-codeblock-chip belki-activity-priority ${getPriorityClass(task.priority)}`,
        text: getPriorityDisplayLabel(task.priority)
      });
    }

    for (const label of task.labels) {
      const color = getLabelColor(label, this.settings.labelColors);
      const chip = meta.createSpan({
        cls: "belki-daily-codeblock-chip belki-daily-codeblock-label",
        text: displayLabel(label)
      });
      chip.setCssStyles({
        backgroundColor: color.light,
        borderColor: color.light
      });
    }

    if (meta.childElementCount === 0) {
      meta.createSpan({ text: "Completed" });
    }
  }

  private resolveDate(): string | null {
    const optionMatch = this.source.match(DATE_OPTION_RE);
    if (optionMatch) {
      return optionMatch[1];
    }

    const lineMatch = this.source.match(DATE_LINE_RE);
    if (lineMatch) {
      return lineMatch[1];
    }

    return dailyNoteDateFromPath(this.sourcePath, this.settings.dailyNoteDateFormat);
  }
}

function formatDailyBlockTitle(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `Completed tasks · ${date}`;
  }

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    weekday: "short"
  }).format(parsed);
  return `Completed tasks · ${formatted}`;
}
