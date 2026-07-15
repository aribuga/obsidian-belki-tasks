import type { CalendarEvent } from "./calendarTypes";
import {
  getCalendarTaskDateUnion,
  groupCalendarEventsByDate
} from "./calendarUtils";

export function groupVisibleCalendarEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  return groupCalendarEventsByDate(events);
}

export function collectUpcomingSectionDates(
  taskDates: Iterable<string>,
  calendarDates: Iterable<string>
): string[] {
  return getCalendarTaskDateUnion(taskDates, calendarDates);
}
