import { todayIso, yesterdayIso } from "./dateUtils";
import { normalizeTaskProject } from "./projects";
import { BelkiTask } from "./types";

export interface ActivityDay {
  count: number;
  date: string;
  level: number;
}

export interface ActivityData {
  allTimeCount: number;
  byDate: Map<string, BelkiTask[]>;
  currentStreak: number;
  defaultSelectedDate: string | null;
  heatmapDays: ActivityDay[];
  monthCount: number;
  todayCount: number;
  weekCount: number;
  yesterdayCount: number;
}

export function getActivityDataSignature(allTasks: BelkiTask[]): string {
  return getCompletedActivityTasks(allTasks)
    .map((task) => [
      task.id,
      task.completedDate,
      task.title,
      normalizeTaskProject(task.project) || "",
      task.priority,
      task.labels.join(",")
    ].join(":"))
    .join("|");
}

export function buildActivityData(allTasks: BelkiTask[]): ActivityData {
  const completedTasks = getCompletedActivityTasks(allTasks);
  const byDate = new Map<string, BelkiTask[]>();
  for (const task of completedTasks) {
    const date = task.completedDate!;
    const group = byDate.get(date) || [];
    group.push(task);
    byDate.set(date, group);
  }

  for (const tasks of byDate.values()) {
    tasks.sort(byOrder);
  }

  const today = todayIso();
  const yesterday = yesterdayIso();
  const weekStart = startOfWeekIso(today);
  const monthPrefix = today.slice(0, 7);
  const heatmapDays: ActivityDay[] = [];
  for (let offset = -181; offset <= 0; offset += 1) {
    const date = addDaysToIso(today, offset);
    const count = byDate.get(date)?.length || 0;
    heatmapDays.push({
      count,
      date,
      level: activityLevel(count)
    });
  }

  let currentStreak = 0;
  for (let date = today; (byDate.get(date)?.length || 0) > 0; date = addDaysToIso(date, -1)) {
    currentStreak += 1;
  }

  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  const defaultSelectedDate =
    (byDate.get(today)?.length || 0) > 0 ? today : sortedDates[0] || null;

  return {
    allTimeCount: completedTasks.length,
    byDate,
    currentStreak,
    defaultSelectedDate,
    heatmapDays,
    monthCount: completedTasks.filter((task) => task.completedDate?.startsWith(monthPrefix)).length,
    todayCount: byDate.get(today)?.length || 0,
    weekCount: completedTasks.filter((task) => {
      const date = task.completedDate || "";
      return date >= weekStart && date <= today;
    }).length,
    yesterdayCount: byDate.get(yesterday)?.length || 0
  };
}

export function formatActivityDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatActivityDayHeading(date: string, count: number): string {
  return `${formatShortDate(date)} · ${formatWeekday(date)} · ${count}`;
}

function getCompletedActivityTasks(allTasks: BelkiTask[]): BelkiTask[] {
  return allTasks.filter((task) =>
    task.completed &&
    Boolean(task.completedDate) &&
    parseIsoDate(task.completedDate || "") !== null
  );
}

function byOrder(a: BelkiTask, b: BelkiTask): number {
  return a.order - b.order;
}

function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysToIso(value: string, offset: number): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  date.setDate(date.getDate() + offset);
  return toLocalIsoDate(date);
}

function startOfWeekIso(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return toLocalIsoDate(date);
}

function activityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatShortDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function formatWeekday(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long"
  }).format(date);
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
