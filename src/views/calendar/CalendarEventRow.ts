import type { CalendarEvent } from "../../calendar/calendarTypes";
import type { IcalCalendarFeed } from "../../calendar/calendarTypes";
import { resolveCalendarEventDestination } from "../../calendar/calendarEventDestinations";
import { openExternalUrl } from "../../calendar/externalLinks";
import { formatCalendarEventTime } from "../../calendar/calendarUtils";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export function renderCalendarEventRow(
  parent: HTMLElement,
  event: CalendarEvent,
  feed: IcalCalendarFeed | undefined
): HTMLElement {
  const eventTime = formatCalendarEventTime(event);
  const destination = resolveCalendarEventDestination(event, feed);
  const accessibilityLabel = calendarEventAccessibilityLabel(event, eventTime);
  const row = parent.createDiv({
    cls: `belki-calendar-event-row${destination ? " is-clickable" : ""}`,
    attr: destination
      ? {
          role: "button",
          tabindex: "0",
          "aria-label": `Open calendar event externally: ${accessibilityLabel}`
        }
      : {
          "aria-label": accessibilityLabel
        }
  });
  row.title = accessibilityLabel;

  row.createSpan({
    cls: "belki-calendar-event-color",
    attr: { "aria-hidden": "true" }
  }).setCssProps({ "--belki-calendar-color": event.calendarColor });

  row.createSpan({
    cls: "belki-calendar-event-time",
    text: eventTime
  });

  row.createSpan({
    cls: "belki-calendar-event-title",
    text: event.title
  });

  if (destination) {
    createBelkiIcon(row, "external-link", {
      className: "belki-calendar-event-link-icon",
      size: 14
    });
    row.addEventListener("click", (domEvent) => {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      void openExternalUrl(destination.url);
    });
    row.addEventListener("keydown", (domEvent) => {
      if (domEvent.key !== "Enter" && domEvent.key !== " ") {
        return;
      }

      domEvent.preventDefault();
      domEvent.stopPropagation();
      void openExternalUrl(destination.url);
    });
  }

  return row;
}

function calendarEventAccessibilityLabel(event: CalendarEvent, eventTime: string): string {
  return [
    eventTime,
    event.title,
    calendarNameForLabel(event.calendarName)
  ].filter(Boolean).join(", ");
}

function calendarNameForLabel(name: string): string {
  return /\bcalendar\b/i.test(name) ? name : `${name} calendar`;
}
