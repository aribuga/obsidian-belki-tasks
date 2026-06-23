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

export function isBeforeToday(value: string | undefined): boolean {
  return isIsoDate(value) && value < todayIso();
}

export function isToday(value: string | undefined): boolean {
  return isIsoDate(value) && value === todayIso();
}

export function isAfterToday(value: string | undefined): boolean {
  return isIsoDate(value) && value > todayIso();
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
