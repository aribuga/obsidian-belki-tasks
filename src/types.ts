export type Priority = "none" | "P1" | "P2" | "P3" | "P4";
export type BelkiSortMode =
  | "smart"
  | "due"
  | "priority"
  | "deadline"
  | "created"
  | "project"
  | "alphabetical";
export type OverdueRange = "yesterday" | "last7" | "last30" | "older";
export type BelkiFontOption =
  | "system"
  | "ibmPlexSans"
  | "ibmPlexMono"
  | "spaceGrotesk"
  | "spaceMono"
  | "manrope"
  | "jetBrainsMono"
  | "sourceSans3"
  | "inter"
  | "geistMono"
  | "dmSans";

export type RepeatFrequency = "daily" | "weekly" | "weekdays" | "monthly" | "yearly";
export type RepeatMode = "scheduledDate" | "completedDate";
export type RepeatEndsType = "never" | "onDate" | "afterOccurrences";

export interface RepeatRule {
  frequency: RepeatFrequency;
  interval: number;
  mode: RepeatMode;
  weekday?: number;
  weekdays?: number[];
  dayOfMonth?: number;
  month?: number;
  ends: RepeatEndsType;
  endsDate?: string;
  endsCount?: number;
}

export interface BelkiTask {
  id: string;
  title: string;
  completed: boolean;
  completedDate?: string;
  created?: string;
  due?: string;
  deadline?: string;
  project?: string;
  priority: Priority;
  description?: string;
  labels: string[];
  attachments: string[];
  repeat?: RepeatRule;
  completedOccurrences?: string[];
  parentId?: string;
  extraProperties: TaskProperty[];
  order: number;
  sourcePath?: string;
}

export interface TaskProperty {
  name: string;
  value: string;
}

export type TaskDocumentBlock =
  | {
      type: "raw";
      lines: string[];
    }
  | {
      type: "task";
      taskId: string;
    };

export interface ParsedTaskDocument {
  blocks: TaskDocumentBlock[];
  tasks: BelkiTask[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  due?: string;
  deadline?: string;
  project?: string;
  priority?: Priority;
  labels?: string[];
  attachments?: string[];
  pendingAttachments?: File[];
  repeat?: RepeatRule;
  parentId?: string;
}

export type TaskPatch = Partial<Omit<BelkiTask, "id" | "order">>;

export type BoardViewMode =
  | "inbox"
  | "today"
  | "upcoming"
  | "projects"
  | "completed"
  | "search"
  | "filters"
  | "archived";

export const PRIORITIES: Priority[] = ["none", "P1", "P2", "P3", "P4"];
export const SORT_MODES: BelkiSortMode[] = [
  "smart",
  "due",
  "priority",
  "deadline",
  "created",
  "project",
  "alphabetical"
];
export const OVERDUE_RANGES: OverdueRange[] = [
  "yesterday",
  "last7",
  "last30",
  "older"
];
export const FONT_OPTIONS: BelkiFontOption[] = [
  "system",
  "ibmPlexSans",
  "ibmPlexMono",
  "spaceGrotesk",
  "spaceMono",
  "manrope",
  "jetBrainsMono",
  "sourceSans3",
  "inter",
  "geistMono",
  "dmSans"
];
