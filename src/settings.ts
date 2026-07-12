import { normalizePath } from "obsidian";
import {
  DEFAULT_DAILY_NOTE_DATE_FORMAT
} from "./dailyNotes";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { normalizeTaskProject } from "./projects";
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
  dailyNotesIntegrationEnabled: boolean;
  dailyNotesAutoInsertCompletedBlock: boolean;
  dailyNoteDateFormat: string;
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
  labelFont: "system",
  dailyNotesIntegrationEnabled: true,
  dailyNotesAutoInsertCompletedBlock: false,
  dailyNoteDateFormat: DEFAULT_DAILY_NOTE_DATE_FORMAT
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
