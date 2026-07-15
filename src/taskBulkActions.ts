import { addDaysIso, todayIso } from "./dateUtils";
import type { BelkiTask, OverdueRange } from "./types";

export type BulkRescheduleShortcut = "today" | "tomorrow" | "nextWeek";

export interface OverdueRangeDates {
  today: string;
  yesterday: string;
  last7Start: string;
  last30Start: string;
}

export interface TaskDueDateUpdatePlan {
  tasks: BelkiTask[];
  changedIds: string[];
}

export function getOverdueRangeDates(today = todayIso()): OverdueRangeDates {
  return {
    today,
    yesterday: addDaysToIsoDate(today, -1),
    last7Start: addDaysToIsoDate(today, -7),
    last30Start: addDaysToIsoDate(today, -30)
  };
}

export function getVisibleOverdueTasksForBulkReschedule(
  tasks: BelkiTask[],
  range: OverdueRange,
  dates: OverdueRangeDates = getOverdueRangeDates()
): BelkiTask[] {
  return tasks.filter((task) => isVisibleOverdueTaskForRange(task, range, dates));
}

export function isVisibleOverdueTaskForRange(
  task: BelkiTask,
  range: OverdueRange,
  dates: OverdueRangeDates = getOverdueRangeDates()
): boolean {
  if (task.completed || task.parentId || !task.due || task.due >= dates.today) {
    return false;
  }

  if (range === "yesterday") {
    return task.due === dates.yesterday;
  }

  if (range === "last7") {
    return task.due >= dates.last7Start;
  }

  if (range === "last30") {
    return task.due >= dates.last30Start;
  }

  return task.due < dates.last30Start;
}

export function dueDateForBulkRescheduleShortcut(shortcut: BulkRescheduleShortcut): string {
  if (shortcut === "today") {
    return todayIso();
  }

  if (shortcut === "tomorrow") {
    return addDaysIso(1);
  }

  return addDaysIso(7);
}

export function createTaskDueDateUpdatePlan(
  tasks: BelkiTask[],
  taskIds: string[],
  due: string
): TaskDueDateUpdatePlan {
  const idSet = new Set(taskIds);
  const changedIds: string[] = [];
  const nextTasks = tasks.map((task) => {
    if (!idSet.has(task.id) || task.due === due) {
      return task;
    }

    changedIds.push(task.id);
    return {
      ...task,
      due
    };
  });

  return {
    tasks: nextTasks,
    changedIds
  };
}

function addDaysToIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
