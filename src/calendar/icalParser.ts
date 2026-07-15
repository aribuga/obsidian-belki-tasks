import * as ICALNamespace from "ical.js";
import type ICALDefault from "ical.js";
import type ICALComponent from "ical.js/dist/types/component";
import type ICALEvent from "ical.js/dist/types/event";
import type ICALTime from "ical.js/dist/types/time";
import type { CalendarEvent, CalendarFetchRange, IcalCalendarFeed } from "./calendarTypes";
import {
  ICAL_MAX_EXPANDED_INSTANCES_PER_FEED,
  ICAL_MAX_NORMALIZED_EVENTS_PER_FEED,
  ICAL_RECURRENCE_WINDOW_BUFFER_DAYS
} from "./calendarConstants";
import {
  addDaysToIsoDate,
  eventDisplayDates,
  localDateFromDateTime
} from "./calendarUtils";

const ICAL = ((ICALNamespace as { default?: typeof ICALDefault }).default || ICALNamespace) as unknown as typeof ICALDefault;

export interface ParsedIcalFeed {
  calendarName?: string;
  events: CalendarEvent[];
  malformedEventCount: number;
}

export function parseIcalFeed(
  ics: string,
  feed: IcalCalendarFeed,
  range: CalendarFetchRange
): ParsedIcalFeed {
  const source = normalizeIcalSource(ics);
  let component: ICALComponent;
  try {
    component = ICAL.Component.fromString(source);
  } catch {
    throw new Error("Calendar feed could not be parsed.");
  }

  if (component.name !== "vcalendar") {
    throw new Error("Calendar feed is not a VCALENDAR.");
  }

  const calendarName = stringValue(component.getFirstPropertyValue("x-wr-calname"));
  const components = component.getAllSubcomponents("vevent");
  const masters: ICALEvent[] = [];
  const exceptions: ICALEvent[] = [];
  let malformedEventCount = 0;

  for (const eventComponent of components) {
    try {
      const event = new ICAL.Event(eventComponent);
      if (!event.uid || !event.startDate) {
        malformedEventCount += 1;
        continue;
      }

      if (event.isRecurrenceException()) {
        exceptions.push(event);
      } else {
        masters.push(event);
      }
    } catch {
      malformedEventCount += 1;
    }
  }

  for (const master of masters) {
    for (const exception of exceptions) {
      if (exception.uid !== master.uid) {
        continue;
      }

      try {
        master.relateException(exception);
      } catch {
        malformedEventCount += 1;
      }
    }
  }

  const events: CalendarEvent[] = [];
  for (const master of masters) {
    try {
      const expandedEvents = expandEvent(master, feed, range);
      if (events.length + expandedEvents.length > ICAL_MAX_NORMALIZED_EVENTS_PER_FEED) {
        throw new CalendarFeedLimitError();
      }
      events.push(...expandedEvents);
    } catch (error) {
      if (error instanceof CalendarFeedLimitError) {
        throw error;
      }
      malformedEventCount += 1;
    }
  }

  return {
    calendarName: calendarName || undefined,
    events,
    malformedEventCount
  };
}

export class CalendarFeedLimitError extends Error {
  constructor() {
    super("Calendar feed contains too many events in the requested window.");
    this.name = "CalendarFeedLimitError";
  }
}

export function normalizeIcalSource(value: string): string {
  const withoutNulls = value.replace(/\0/g, "");
  const beginIndex = withoutNulls.search(/BEGIN:VCALENDAR\b/i);
  const endMatch = /END:VCALENDAR\b/i.exec(withoutNulls);
  if (beginIndex === -1 || !endMatch) {
    return withoutNulls.replace(/^\s+/, "");
  }

  const endIndex = endMatch.index + endMatch[0].length;
  return withoutNulls.slice(beginIndex, endIndex);
}

function expandEvent(
  event: ICALEvent,
  feed: IcalCalendarFeed,
  range: CalendarFetchRange
): CalendarEvent[] {
  if (isCancelled(event)) {
    return [];
  }

  if (!event.isRecurring()) {
    const normalized = normalizeIcalEventOccurrence(event, event, event.startDate, event.startDate, feed);
    return normalized && isEventRelevantToRange(normalized, range) ? [normalized] : [];
  }

  const events: CalendarEvent[] = [];
  const windowStart = addDaysToIsoDate(range.startDate, -ICAL_RECURRENCE_WINDOW_BUFFER_DAYS);
  const windowEnd = addDaysToIsoDate(range.endDate, ICAL_RECURRENCE_WINDOW_BUFFER_DAYS);
  const iterator = event.iterator();
  let next: ICALTime | null;
  let expandedCount = 0;

  while ((next = iterator.next())) {
    expandedCount += 1;
    if (expandedCount > ICAL_MAX_EXPANDED_INSTANCES_PER_FEED) {
      break;
    }

    const occurrenceDate = icalTimeLocalDate(next);
    if (occurrenceDate >= windowEnd) {
      break;
    }

    if (occurrenceDate < windowStart) {
      continue;
    }

    const details = event.getOccurrenceDetails(next);
    if (isCancelled(details.item)) {
      continue;
    }

    const normalized = normalizeIcalEventOccurrence(
      event,
      details.item,
      details.startDate,
      details.recurrenceId,
      feed,
      details.endDate
    );

    if (normalized && isEventRelevantToRange(normalized, range)) {
      events.push(normalized);
    }
  }

  return events;
}

function normalizeIcalEventOccurrence(
  master: ICALEvent,
  occurrence: ICALEvent,
  startDate: ICALTime,
  recurrenceId: ICALTime,
  feed: IcalCalendarFeed,
  endDate = occurrence.endDate
): CalendarEvent | null {
  if (!master.uid || !startDate) {
    return null;
  }

  const title = normalizeSummary(occurrence.summary || master.summary);
  const recurrenceIdentity = timeIdentity(recurrenceId || startDate);
  const allDay = Boolean(startDate.isDate);
  const sourceTimeZone = sourceTimezone(occurrence) || sourceTimezone(master);
  const url = normalizeEventUrl(stringValue(occurrence.component.getFirstPropertyValue("url")));
  const status = stringValue(occurrence.component.getFirstPropertyValue("status")) || undefined;
  const start = allDay ? icalDateToIsoDate(startDate) : startDate.toJSDate().toISOString();
  const end = allDay
    ? icalDateToIsoDate(endDate)
    : endDate?.toJSDate().toISOString();

  return {
    id: stableCalendarEventId(feed.id, master.uid, recurrenceIdentity),
    feedId: feed.id,
    uid: master.uid,
    recurrenceId: recurrenceIdentity,
    calendarId: feed.id,
    calendarName: feed.name,
    calendarColor: feed.color,
    title,
    start,
    end,
    allDay,
    url,
    status,
    sourceTimeZone
  };
}

function isEventRelevantToRange(event: CalendarEvent, range: CalendarFetchRange): boolean {
  return eventDisplayDates(event).some((date) => date >= range.startDate && date < range.endDate);
}

function isCancelled(event: ICALEvent): boolean {
  return stringValue(event.component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED";
}

function normalizeSummary(value: string | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ") || "Untitled event";
}

function sourceTimezone(event: ICALEvent): string | undefined {
  const property = event.component.getFirstProperty("dtstart");
  const parameter = property?.getParameter("tzid");
  if (Array.isArray(parameter)) {
    const match = parameter
      .filter((value): value is string => typeof value === "string")
      .find((value) => value.trim().length > 0);
    return match?.trim();
  }

  if (typeof parameter !== "string") {
    return undefined;
  }

  const trimmed = parameter.trim();
  return trimmed || undefined;
}

function normalizeEventUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function timeIdentity(value: ICALTime | undefined): string {
  return value?.toICALString() || "";
}

function icalTimeLocalDate(value: ICALTime): string {
  return value.isDate ? icalDateToIsoDate(value) : localDateFromDateTime(value.toJSDate().toISOString()) || icalDateToIsoDate(value);
}

function icalDateToIsoDate(value: ICALTime): string {
  return [
    String(value.year).padStart(4, "0"),
    String(value.month).padStart(2, "0"),
    String(value.day).padStart(2, "0")
  ].join("-");
}

function stableCalendarEventId(feedId: string, uid: string, recurrenceIdentity: string): string {
  return `${feedId}-${hashString(`${feedId}|${uid}|${recurrenceIdentity}`)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}
