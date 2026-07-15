import { compareIsoDates, isIsoDate, toIsoDate } from "../dateUtils";
import type { CalendarEvent, CalendarFetchRange } from "./calendarTypes";
import type { CalendarDefinition } from "./calendarTypes";

const DEFAULT_CALENDAR_COLOR = "var(--belki-accent)";

export function parseLocalIsoDate(value: string): Date | null {
  if (!isIsoDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToIsoDate(value: string, days: number): string {
  const date = parseLocalIsoDate(value);
  if (!date) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function createTodayCalendarRange(today: string): CalendarFetchRange {
  return {
    startDate: today,
    endDate: addDaysToIsoDate(today, 1)
  };
}

export function createUpcomingCalendarRange(today: string, days = 60): CalendarFetchRange {
  return {
    startDate: addDaysToIsoDate(today, 1),
    endDate: addDaysToIsoDate(today, days + 1)
  };
}

export function normalizeCalendarColor(value: string | undefined): string {
  if (!value) {
    return DEFAULT_CALENDAR_COLOR;
  }

  const color = value.trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
    return color;
  }

  return DEFAULT_CALENDAR_COLOR;
}

export function eventDisplayDates(event: CalendarEvent): string[] {
  if (!event.allDay) {
    return localDateFromDateTime(event.start) ? [localDateFromDateTime(event.start)!] : [];
  }

  if (!isIsoDate(event.start)) {
    return [];
  }

  const endExclusive = isIsoDate(event.end) ? event.end : addDaysToIsoDate(event.start, 1);
  const dates: string[] = [];
  let cursor = event.start;

  // Google all-day end dates are exclusive. Multi-day all-day events are shown
  // on each covered local date. Timed cross-midnight events intentionally stay
  // on their starting local date for this MVP.
  while (cursor < endExclusive) {
    dates.push(cursor);
    cursor = addDaysToIsoDate(cursor, 1);
    if (dates.length > 366) {
      break;
    }
  }

  return dates;
}

export function localDateFromDateTime(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return toIsoDate(date);
}

export function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) {
    return a.allDay ? -1 : 1;
  }

  if (!a.allDay && a.start !== b.start) {
    return a.start < b.start ? -1 : 1;
  }

  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) {
    return byTitle;
  }

  return a.id.localeCompare(b.id);
}

export function groupCalendarEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    for (const date of eventDisplayDates(event)) {
      const group = groups.get(date) || [];
      group.push(event);
      groups.set(date, group);
    }
  }

  for (const [date, group] of groups) {
    groups.set(date, [...group].sort(compareCalendarEvents));
  }

  return groups;
}

export function getCalendarTaskDateUnion(
  taskDates: Iterable<string>,
  eventDates: Iterable<string>
): string[] {
  return [...new Set([...taskDates, ...eventDates].filter(isIsoDate))].sort(compareIsoDates);
}

export function formatCalendarEventTime(event: CalendarEvent): string {
  if (event.allDay) {
    return "All day";
  }

  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
  const startText = formatter.format(start);

  if (!end || Number.isNaN(end.getTime())) {
    return startText;
  }

  return `${startText}-${formatter.format(end)}`;
}

export function filterVisibleCalendars(
  calendars: CalendarDefinition[]
): CalendarDefinition[] {
  return calendars.filter((calendar) => calendar.enabled);
}

export function visibleCalendarEventCount(total: number, expanded: boolean, limit = 3): number {
  if (expanded || total <= limit) {
    return total;
  }

  return limit;
}
