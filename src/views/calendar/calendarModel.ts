import { todayIso, toIsoDate } from "../../dateUtils";
import type { BelkiTask } from "../../types";
import {
  CALENDAR_WEEK_START,
  isValidCalendarDate,
  parseIsoDateLocal
} from "./calendarUtils";
import type {
  CalendarDay,
  CalendarMonth,
  CalendarTaskEntry,
  CalendarTaskGroups
} from "./calendarTypes";

interface BuildMonthGridOptions {
  month: CalendarMonth;
  taskGroups: CalendarTaskGroups;
  selectedDate?: string;
  today?: string;
  weekStartsOn?: number;
}

export function buildCalendarTaskGroups(tasks: BelkiTask[]): CalendarTaskGroups {
  const dueTasksByDate = new Map<string, BelkiTask[]>();
  const deadlineTasksByDate = new Map<string, BelkiTask[]>();

  for (const task of tasks) {
    if (isValidCalendarDate(task.due)) {
      appendTask(dueTasksByDate, task.due, task);
    }

    if (isValidCalendarDate(task.deadline) && task.deadline !== task.due) {
      appendTask(deadlineTasksByDate, task.deadline, task);
    }
  }

  sortTaskGroups(dueTasksByDate);
  sortTaskGroups(deadlineTasksByDate);

  return {
    dueTasksByDate,
    deadlineTasksByDate
  };
}

export function buildMonthGrid(options: BuildMonthGridOptions): CalendarDay[] {
  const today = isValidCalendarDate(options.today) ? options.today : todayIso();
  const selectedDate = isValidCalendarDate(options.selectedDate)
    ? options.selectedDate
    : undefined;
  const weekStartsOn = options.weekStartsOn ?? CALENDAR_WEEK_START;
  const firstOfMonth = new Date(options.month.year, options.month.month, 1);
  const leadingDayCount = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  const gridStart = new Date(options.month.year, options.month.month, 1 - leadingDayCount);
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const isoDate = toIsoDate(date);
    const dueTasks = options.taskGroups.dueTasksByDate.get(isoDate) || [];
    const deadlineTasks = options.taskGroups.deadlineTasksByDate.get(isoDate) || [];

    days.push({
      date: isoDate,
      dayNumber: date.getDate(),
      isCurrentMonth:
        date.getFullYear() === options.month.year &&
        date.getMonth() === options.month.month,
      isToday: isoDate === today,
      isSelected: isoDate === selectedDate,
      isOverdue: isoDate < today && dueTasks.some((task) => !task.completed),
      dueTasks,
      deadlineTasks,
      deadlineCount: deadlineTasks.length,
      totalCount: dueTasks.length + deadlineTasks.length
    });
  }

  return days;
}

export function getCalendarTasksForDate(
  taskGroups: CalendarTaskGroups,
  date: string
): CalendarTaskEntry[] {
  const dueTasks = taskGroups.dueTasksByDate.get(date) || [];
  const deadlineTasks = taskGroups.deadlineTasksByDate.get(date) || [];
  const entries: CalendarTaskEntry[] = dueTasks.map((task) => ({ task, role: "due" }));
  const seenTaskIds = new Set(dueTasks.map((task) => task.id));

  for (const task of deadlineTasks) {
    if (!seenTaskIds.has(task.id)) {
      entries.push({ task, role: "deadline" });
    }
  }

  return entries;
}

export function hasCalendarDate(task: BelkiTask): boolean {
  return isValidCalendarDate(task.due) || isValidCalendarDate(task.deadline);
}

function appendTask(
  groups: Map<string, BelkiTask[]>,
  date: string,
  task: BelkiTask
): void {
  const tasks = groups.get(date);
  if (tasks) {
    tasks.push(task);
  } else {
    groups.set(date, [task]);
  }
}

function sortTaskGroups(groups: Map<string, BelkiTask[]>): void {
  for (const [date, tasks] of groups) {
    if (!parseIsoDateLocal(date)) {
      groups.delete(date);
      continue;
    }

    groups.set(date, [...tasks].sort((a, b) => a.order - b.order));
  }
}
