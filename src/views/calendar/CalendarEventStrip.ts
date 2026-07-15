import type { CalendarEvent } from "../../calendar/calendarTypes";
import type { IcalCalendarFeed } from "../../calendar/calendarTypes";
import { visibleCalendarEventCount } from "../../calendar/calendarUtils";
import { renderCalendarEventRow } from "./CalendarEventRow";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

const DEFAULT_VISIBLE_EVENT_COUNT = 3;

interface CalendarEventStripOptions {
  date: string;
  events: CalendarEvent[];
  feedById: Map<string, IcalCalendarFeed>;
  expanded: boolean;
  onToggle(date: string): void;
}

export function renderCalendarEventStrip(
  parent: HTMLElement,
  options: CalendarEventStripOptions
): HTMLElement | null {
  if (options.events.length === 0) {
    return null;
  }

  const canCollapse = options.events.length > DEFAULT_VISIBLE_EVENT_COUNT;
  const visibleEvents = options.events.slice(
    0,
    visibleCalendarEventCount(options.events.length, options.expanded, DEFAULT_VISIBLE_EVENT_COUNT)
  );
  const hiddenCount = options.events.length - DEFAULT_VISIBLE_EVENT_COUNT;

  const strip = parent.createDiv({
    cls: `belki-calendar-event-strip${canCollapse ? " has-overflow" : ""}`
  });

  if (canCollapse) {
    const toggle = strip.createEl("button", {
      cls: "belki-calendar-event-toggle",
      attr: {
        type: "button",
        "aria-expanded": String(options.expanded),
        "aria-label": options.expanded
          ? "Collapse calendar events"
          : `Show ${hiddenCount} more calendar events`
      }
    });

    if (!options.expanded) {
      toggle.createSpan({
        cls: "belki-calendar-event-more",
        text: `+${hiddenCount}`
      });
    }

    createBelkiIcon(toggle, options.expanded ? "collapse" : "expand", { size: 14 });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onToggle(options.date);
    });
  }

  const list = strip.createDiv({ cls: "belki-calendar-event-list" });
  for (const event of visibleEvents) {
    renderCalendarEventRow(list, event, options.feedById.get(event.feedId));
  }

  return strip;
}
