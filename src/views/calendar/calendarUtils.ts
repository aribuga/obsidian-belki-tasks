import { isIsoDate, toIsoDate } from "../../dateUtils";
import type { CalendarMonth } from "./calendarTypes";

export const CALENDAR_WEEK_START = 1;
export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function calendarMonthFromDate(date: Date): CalendarMonth {
  return {
    year: date.getFullYear(),
    month: date.getMonth()
  };
}

export function calendarMonthFromIsoDate(value: string): CalendarMonth | null {
  const date = parseIsoDateLocal(value);
  return date ? calendarMonthFromDate(date) : null;
}

export function calendarMonthStartIso(month: CalendarMonth): string {
  return toIsoDate(new Date(month.year, month.month, 1));
}

export function addCalendarMonths(month: CalendarMonth, amount: number): CalendarMonth {
  return calendarMonthFromDate(new Date(month.year, month.month + amount, 1));
}

export function selectedDateForCalendarMonth(
  month: CalendarMonth,
  preferredDate?: string
): string {
  const preferred = preferredDate ? parseIsoDateLocal(preferredDate) : null;
  const preferredDay = preferred?.getDate() || 1;
  const day = Math.min(preferredDay, daysInCalendarMonth(month));
  return toIsoDate(new Date(month.year, month.month, day));
}

export function isDateInCalendarMonth(value: string, month: CalendarMonth): boolean {
  const date = parseIsoDateLocal(value);
  return Boolean(date && date.getFullYear() === month.year && date.getMonth() === month.month);
}

export function formatCalendarMonthLabel(month: CalendarMonth): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(new Date(month.year, month.month, 1));
}

export function parseIsoDateLocal(value: string | undefined): Date | null {
  if (!isIsoDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isValidCalendarDate(value: string | undefined): value is string {
  return Boolean(parseIsoDateLocal(value));
}

function daysInCalendarMonth(month: CalendarMonth): number {
  return new Date(month.year, month.month + 1, 0).getDate();
}
