import type { CalendarEvent, IcalCalendarFeed } from "./calendarTypes";
import { eventDisplayDates } from "./calendarUtils";

export interface CalendarEventDestination {
  url: string;
  kind: "event-url" | "google-day";
}

export function resolveCalendarEventDestination(
  event: CalendarEvent,
  feed: IcalCalendarFeed | undefined
): CalendarEventDestination | null {
  if (event.url && isHttpUrl(event.url)) {
    return {
      url: event.url,
      kind: "event-url"
    };
  }

  if (!feed || !isGoogleCalendarFeed(feed)) {
    return null;
  }

  const localDate = eventDisplayDates(event)[0];
  if (!localDate) {
    return null;
  }

  return {
    url: googleCalendarDayUrl(localDate),
    kind: "google-day"
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isGoogleCalendarFeed(feed: IcalCalendarFeed): boolean {
  try {
    const parsed = new URL(feed.url);
    return parsed.hostname.toLowerCase() === "calendar.google.com" &&
      parsed.pathname.toLowerCase().startsWith("/calendar/ical/");
  } catch {
    return false;
  }
}

function googleCalendarDayUrl(localDate: string): string {
  const [year, month, day] = localDate.split("-");
  return `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;
}
