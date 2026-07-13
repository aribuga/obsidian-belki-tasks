import type { BelkiTask } from "../../types";

export interface CalendarMonth {
  year: number;
  month: number;
}

export type CalendarTaskRole = "due" | "deadline";

export interface CalendarTaskEntry {
  task: BelkiTask;
  role: CalendarTaskRole;
}

export interface CalendarTaskGroups {
  dueTasksByDate: Map<string, BelkiTask[]>;
  deadlineTasksByDate: Map<string, BelkiTask[]>;
}

export interface CalendarDay {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isOverdue: boolean;
  dueTasks: BelkiTask[];
  deadlineTasks: BelkiTask[];
  deadlineCount: number;
  totalCount: number;
}
