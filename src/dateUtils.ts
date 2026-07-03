const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(): string {
  const now = new Date();
  return toIsoDate(now);
}

export function yesterdayIso(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toIsoDate(yesterday);
}

export function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && ISO_DATE_PATTERN.test(value));
}

export function compareIsoDates(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

export function daysBetweenIsoDates(from: string, to: string): number | null {
  const fromDay = isoDateToUtcDay(from);
  const toDay = isoDateToUtcDay(to);
  if (fromDay === null || toDay === null) {
    return null;
  }

  return toDay - fromDay;
}

export function isBeforeToday(value: string | undefined): boolean {
  return isIsoDate(value) && value < todayIso();
}

export function isToday(value: string | undefined): boolean {
  return isIsoDate(value) && value === todayIso();
}

export function isAfterToday(value: string | undefined): boolean {
  return isIsoDate(value) && value > todayIso();
}

export function nextWeekdayIso(targetDay: number): string {
  const today = new Date();
  const current = today.getDay();
  let daysUntil = targetDay - current;
  if (daysUntil <= 0) daysUntil += 7;
  const date = new Date();
  date.setDate(date.getDate() + daysUntil);
  return toIsoDate(date);
}

export function formatDueDateChip(value: string | undefined): string {
  if (!isIsoDate(value)) return "Date";
  if (value === todayIso()) return "Today";
  if (value === addDaysIso(1)) return "Tomorrow";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const thisYear = new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year !== thisYear ? { year: "numeric" } : {})
  }).format(date);
}

export function formatDateLabel(value: string): string {
  if (!isIsoDate(value)) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function isoDateToUtcDay(value: string): number | null {
  if (!isIsoDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
