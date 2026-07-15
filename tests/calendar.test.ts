import { test } from "node:test";
import * as assert from "node:assert/strict";
import { CalendarCache } from "../src/calendar/calendarCache";
import type {
  CalendarFetchRange,
  CalendarProviderError,
  IcalCalendarFeed,
  IcalCalendarProvider,
  IcalFeedFetchResult
} from "../src/calendar/calendarTypes";
import {
  eventDisplayDates,
  filterVisibleCalendars,
  getCalendarTaskDateUnion,
  groupCalendarEventsByDate,
  visibleCalendarEventCount
} from "../src/calendar/calendarUtils";
import {
  buildIcalFeed,
  calendarErrorMessage,
  describeIcalFeedUrl,
  icalMalformedResponseMessage,
  icalNotFoundMessage,
  isDuplicateIcalFeedUrl,
  isLikelyIcalFeedText,
  isIcalFeedFresh,
  maskIcalFeedUrl,
  normalizeIcalCalendarFeeds,
  normalizeIcalFeedUrl,
  sanitizeIcalErrorMessage,
  sanitizeUrlForDiagnostics
} from "../src/calendar/icalFeedSettings";
import { normalizeIcalSource, parseIcalFeed } from "../src/calendar/icalParser";
import { CalendarService } from "../src/calendar/CalendarService";
import { resolveCalendarEventDestination } from "../src/calendar/calendarEventDestinations";
import {
  ICAL_BACKOFF_MAX_MS,
  ICAL_BACKOFF_SECOND_FAILURE_MS,
  ICAL_BACKOFF_THIRD_FAILURE_MS,
  ICAL_MAX_NORMALIZED_EVENTS_PER_FEED,
  ICAL_REQUEST_FRESHNESS_MS
} from "../src/calendar/calendarConstants";
import {
  buildIcalRequestHeaders,
  buildIcalResponseDiagnostics,
  calendarTextByteLength,
  decodeIcalResponseText,
  getIcalResponseHeader,
  icalResponseByteLength
} from "../src/calendar/icalNetwork";
import type { BelkiSettings } from "../src/settings";

const range: CalendarFetchRange = {
  startDate: "2026-03-01",
  endDate: "2026-04-01"
};

const feed: IcalCalendarFeed = {
  id: "feed-a",
  name: "Personal",
  url: "https://example.com/basic.ics",
  color: "#3b82f6",
  enabled: true
};

test("validates HTTPS and converts webcal feed URLs", () => {
  assert.equal(normalizeIcalFeedUrl("https://example.com/calendar"), "https://example.com/calendar");
  assert.equal(normalizeIcalFeedUrl("webcal://example.com/calendar.ics"), "https://example.com/calendar.ics");
});

test("rejects unsafe or malformed feed URLs", () => {
  for (const value of [
    "",
    "javascript:alert(1)",
    "data:text/calendar,BEGIN:VCALENDAR",
    "file:///tmp/calendar.ics",
    "ftp://example.com/calendar.ics",
    "http://example.com/calendar.ics",
    "https://user:pass@example.com/calendar.ics",
    "https://localhost/calendar.ics",
    "https://metadata.google.internal/calendar.ics",
    "https://127.0.0.1/calendar.ics",
    "https://10.0.0.1/calendar.ics",
    "https://172.16.0.1/calendar.ics",
    "https://192.168.1.1/calendar.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/calendar.ics",
    "https://198.18.0.1/calendar.ics",
    "https://[::1]/calendar.ics",
    "https://[fd00::1]/calendar.ics",
    "https://[fe80::1]/calendar.ics",
    "not a url"
  ]) {
    assert.throws(() => normalizeIcalFeedUrl(value));
  }
});

test("detects duplicate feed URLs after safe normalization", () => {
  const feeds = [
    buildIcalFeed({
      name: "A",
      url: "webcal://EXAMPLE.com:443/team.ics#ignored",
      color: "#111111",
      enabled: true
    }, "feed-a")
  ];

  assert.equal(isDuplicateIcalFeedUrl(feeds, "https://example.com/team.ics"), true);
  assert.equal(isDuplicateIcalFeedUrl(feeds, "https://example.com/other.ics"), false);
  assert.equal(isDuplicateIcalFeedUrl(feeds, "https://example.com/team.ics", "feed-a"), false);
});

test("masks feed URLs without exposing query parameters or long path tokens", () => {
  assert.equal(maskIcalFeedUrl("https://calendar.google.com/calendar/basic.ics?secret=abc"), "****************/basic.ics");
  assert.equal(maskIcalFeedUrl("https://example.com/abcdefghijklmnopqrstuvwxyz1234567890"), "****************/feed");
});

test("describes Google iCal URL variants without exposing secrets", () => {
  assert.equal(
    describeIcalFeedUrl("https://calendar.google.com/calendar/ical/me%40example.com/public/basic.ics"),
    "Google public iCal link detected. It works only when the calendar is publicly shared."
  );
  assert.equal(
    describeIcalFeedUrl("webcal://calendar.google.com/calendar/ical/me%40example.com/private-secret123/basic.ics"),
    "Google Secret address detected. Keep this URL private."
  );
  assert.equal(
    describeIcalFeedUrl("https://calendar.google.com/calendar/embed?src=me%40example.com"),
    "Google Calendar URL detected. Use the Secret address in iCal format from Integrate calendar."
  );
});

test("sanitizes feed URLs and path tokens from errors", () => {
  const message = sanitizeIcalErrorMessage(
    "Failed https://example.com/private/token123456789012345678901234567890?secret=yes"
  );
  assert.equal(message.includes("secret=yes"), false);
  assert.equal(message.includes("token123456789012345678901234567890"), false);
  assert.equal(sanitizeUrlForDiagnostics("https://example.com/private/basic.ics?secret=yes"), "https://example.com/[calendar-url]");
});

test("detects non-iCal calendar responses without exposing private URLs", () => {
  assert.equal(isLikelyIcalFeedText("BEGIN:VCALENDAR\nEND:VCALENDAR"), true);
  assert.equal(isLikelyIcalFeedText("<html>not a calendar</html>"), false);

  const message = icalMalformedResponseMessage(
    "Personal",
    "https://calendar.google.com/calendar/ical/me%40example.com/private-token12345678901234567890/basic.ics",
    "<html>not a calendar</html>",
    "text/html"
  );

  assert.equal(message.includes("returned a web page instead of an iCal file"), true);
  assert.equal(message.includes("download an .ics file"), true);
  assert.equal(message.includes("private-token"), false);
});

test("extracts safe calendar provider errors for settings UI", () => {
  assert.equal(
    calendarErrorMessage({
      kind: "network",
      message: "Personal calendar feed returned HTTP 403.",
      calendarId: "a"
    }, "Fallback"),
    "Personal calendar feed returned HTTP 403."
  );
  assert.equal(
    calendarErrorMessage({
      message: "Bad https://example.com/private/abcdefghijklmnopqrstuvwxyz1234567890/basic.ics?secret=yes"
    }, "Fallback").includes("secret=yes"),
    false
  );
});

test("404 feed errors explain Google public versus secret iCal links", () => {
  assert.equal(
    calendarErrorMessage({
      kind: "not_found",
      message: icalNotFoundMessage(
        "Personal",
        "https://calendar.google.com/calendar/ical/me%40example.com/public/basic.ics"
      ),
      calendarId: "a"
    }, "Fallback").includes("publicly shared"),
    true
  );
  assert.equal(
    calendarErrorMessage({
      kind: "not_found",
      message: icalNotFoundMessage(
        "Personal",
        "https://calendar.google.com/calendar/ical/me%40example.com/private-token1234567890/basic.ics"
      ),
      calendarId: "a"
    }, "Fallback").includes("reset the secret iCal URL"),
    true
  );
});

test("normalizes feed settings and ignores invalid legacy data safely", () => {
  const normalized = normalizeIcalCalendarFeeds([{
    id: "a",
    name: " Work ",
    url: "webcal://example.com/work.ics",
    color: "#ff0000",
    enabled: true,
    etag: "etag"
  }]);

  assert.equal(normalized[0].url, "https://example.com/work.ics");
  assert.equal(normalized[0].name, "Work");
  assert.deepEqual(normalizeIcalCalendarFeeds([{ id: "bad", url: "javascript:alert(1)" }]), []);
});

test("freshness helper uses the configured refresh interval", () => {
  const now = Date.parse("2026-03-10T10:15:00Z");
  assert.equal(isIcalFeedFresh({
    ...feed,
    lastSuccessfulRefreshAt: "2026-03-10T10:01:00Z"
  }, now, ICAL_REQUEST_FRESHNESS_MS), true);
  assert.equal(isIcalFeedFresh({
    ...feed,
    lastSuccessfulRefreshAt: "2026-03-10T09:59:00Z"
  }, now, ICAL_REQUEST_FRESHNESS_MS), false);
});

test("task view calendar range includes today while upcoming display starts tomorrow", () => {
  const service = new CalendarService({
    settings: testSettings(),
    provider: new FakeIcalProvider(),
    saveSettings: async () => {},
    onChanged: () => {}
  });

  assert.deepEqual(service.getTodayRange("2026-03-10"), {
    startDate: "2026-03-10",
    endDate: "2026-03-11"
  });
  assert.deepEqual(service.getUpcomingRange("2026-03-10"), {
    startDate: "2026-03-11",
    endDate: "2026-05-10"
  });
  assert.deepEqual(service.getTaskViewCalendarRange("2026-03-10"), {
    startDate: "2026-03-10",
    endDate: "2026-05-10"
  });
  service.dispose();
});

test("builds conditional iCal request headers and reads response metadata", () => {
  const headers = buildIcalRequestHeaders({
    ...feed,
    etag: "\"abc\"",
    lastModified: "Mon, 02 Mar 2026 10:00:00 GMT"
  });

  assert.equal(headers["If-None-Match"], "\"abc\"");
  assert.equal(headers["If-Modified-Since"], "Mon, 02 Mar 2026 10:00:00 GMT");
  assert.equal(headers.Accept.includes("text/calendar"), true);
  assert.equal(getIcalResponseHeader({ ETag: "\"def\"" }, "etag"), "\"def\"");
  assert.equal(calendarTextByteLength("abc"), 3);
});

test("decodes iCal response bodies from downloaded array buffers", () => {
  const text = "BEGIN:VCALENDAR\nEND:VCALENDAR";
  const arrayBuffer = new TextEncoder().encode(text).buffer;

  assert.equal(decodeIcalResponseText({ text: "", arrayBuffer }), text);
  assert.equal(icalResponseByteLength({ text: "", arrayBuffer }), text.length);
  assert.equal(decodeIcalResponseText({ text: "broken text fallback", arrayBuffer }), text);
  assert.equal(decodeIcalResponseText({ text }), text);
});

test("formats safe iCal response diagnostics without leaking content", () => {
  const text = "BEGIN:VCALENDAR\nSUMMARY:Private thing\nEND:VCALENDAR";
  const diagnostics = buildIcalResponseDiagnostics(
    {
      status: 200,
      text,
      arrayBuffer: new TextEncoder().encode(text).buffer
    },
    text,
    "text/calendar; charset=utf-8",
    { name: "Parser Error!" }
  );

  assert.equal(diagnostics.includes("status 200"), true);
  assert.equal(diagnostics.includes("type text/calendar"), true);
  assert.equal(diagnostics.includes("BEGIN 0"), true);
  assert.equal(diagnostics.includes("Private thing"), false);
  assert.equal(diagnostics.includes("ParserError"), true);
});

test("normalizes wrapped iCal response bodies before parsing", () => {
  const wrapped = [
    "\uFEFFdownload-wrapper",
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:wrapped",
    "SUMMARY:Wrapped",
    "DTSTART:20260307T090000",
    "DTEND:20260307T100000",
    "END:VEVENT",
    "END:VCALENDAR",
    "trailing-wrapper"
  ].join("\n");

  assert.equal(normalizeIcalSource(wrapped).startsWith("BEGIN:VCALENDAR"), true);
  assert.equal(normalizeIcalSource(wrapped).endsWith("END:VCALENDAR"), true);
  assert.equal(parseIcalFeed(wrapped, feed, range).events[0].title, "Wrapped");
});

test("parses valid VCALENDAR with multiple VEVENT entries", () => {
  const parsed = parseIcalFeed(ics([
    eventLines("a", "First", "20260307T090000", "20260307T100000"),
    eventLines("b", "Second", "20260308T090000", "20260308T100000")
  ]), feed, range);

  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events.map((event) => event.title), ["First", "Second"]);
});

test("rejects malformed calendar response", () => {
  assert.throws(() => parseIcalFeed("not ics", feed, range));
});

test("supports folded lines and escaped text", () => {
  const parsed = parseIcalFeed([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:folded",
    "SUMMARY:Hello\\,",
    " world",
    "DTSTART:20260307T090000",
    "DTEND:20260307T100000",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n"), feed, range);

  assert.equal(parsed.events[0].title, "Hello,world");
});

test("uses fallback title and does not retain descriptions or attendees", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:missing-summary",
    "DTSTART:20260307T090000",
    "DTEND:20260307T100000",
    "DESCRIPTION:Private notes",
    "ATTENDEE:mailto:a@example.com",
    "ORGANIZER:mailto:b@example.com",
    "END:VEVENT"
  ]]), feed, range);

  assert.equal(parsed.events[0].title, "Untitled event");
  assert.equal("description" in parsed.events[0], false);
  assert.equal("attendee" in parsed.events[0], false);
});

test("normalizes timed, UTC, floating, and TZID events", () => {
  const parsed = parseIcalFeed(ics([
    eventLines("utc", "UTC", "20260307T090000Z", "20260307T100000Z"),
    eventLines("floating", "Floating", "20260308T090000", "20260308T100000"),
    [
      "BEGIN:VEVENT",
      "UID:tzid",
      "SUMMARY:TZID",
      "DTSTART;TZID=Europe/Istanbul:20260309T090000",
      "DTEND;TZID=Europe/Istanbul:20260309T100000",
      "END:VEVENT"
    ]
  ]), feed, range);

  assert.equal(parsed.events.length, 3);
  assert.equal(parsed.events.find((event) => event.uid === "tzid")?.sourceTimeZone, "Europe/Istanbul");
});

test("normalizes all-day events and exclusive all-day DTEND", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:all-day",
    "SUMMARY:All day",
    "DTSTART;VALUE=DATE:20260307",
    "DTEND;VALUE=DATE:20260308",
    "END:VEVENT"
  ]]), feed, range);

  assert.equal(parsed.events[0].allDay, true);
  assert.deepEqual(eventDisplayDates(parsed.events[0]), ["2026-03-07"]);
});

test("shows multi-day all-day events on every covered date", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:multi",
    "SUMMARY:Trip",
    "DTSTART;VALUE=DATE:20260307",
    "DTEND;VALUE=DATE:20260310",
    "END:VEVENT"
  ]]), feed, range);

  assert.deepEqual(eventDisplayDates(parsed.events[0]), ["2026-03-07", "2026-03-08", "2026-03-09"]);
});

test("supports DURATION-based end times", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:duration",
    "SUMMARY:Duration",
    "DTSTART:20260307T090000",
    "DURATION:PT2H",
    "END:VEVENT"
  ]]), feed, range);

  const start = new Date(parsed.events[0].start).getTime();
  const end = new Date(parsed.events[0].end || "").getTime();
  assert.equal(end - start, 2 * 60 * 60 * 1000);
});

test("expands RRULE and RDATE while honoring EXDATE", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:rrule",
    "SUMMARY:Yoga",
    "DTSTART:20260302T090000",
    "DTEND:20260302T100000",
    "RRULE:FREQ=DAILY;COUNT=3",
    "RDATE:20260306T090000",
    "EXDATE:20260303T090000",
    "END:VEVENT"
  ]]), feed, range);

  assert.deepEqual(parsed.events.map((event) => eventDisplayDates(event)[0]), [
    "2026-03-02",
    "2026-03-04",
    "2026-03-06"
  ]);
});

test("supports RECURRENCE-ID overrides", () => {
  const parsed = parseIcalFeed(ics([
    [
      "BEGIN:VEVENT",
      "UID:override",
      "SUMMARY:Standup",
      "DTSTART:20260302T090000",
      "DTEND:20260302T093000",
      "RRULE:FREQ=DAILY;COUNT=2",
      "END:VEVENT"
    ],
    [
      "BEGIN:VEVENT",
      "UID:override",
      "RECURRENCE-ID:20260303T090000",
      "SUMMARY:Moved standup",
      "DTSTART:20260303T110000",
      "DTEND:20260303T113000",
      "END:VEVENT"
    ]
  ]), feed, range);

  assert.equal(parsed.events.find((event) => event.recurrenceId === "20260303T090000")?.title, "Moved standup");
  assert.equal(parsed.events.some((event) => event.start.includes("09:00:00") && eventDisplayDates(event)[0] === "2026-03-03"), false);
});

test("cancelled events and cancelled recurring instances do not appear", () => {
  const parsed = parseIcalFeed(ics([
    [
      "BEGIN:VEVENT",
      "UID:cancelled",
      "SUMMARY:Cancelled",
      "STATUS:CANCELLED",
      "DTSTART:20260302T090000",
      "DTEND:20260302T100000",
      "END:VEVENT"
    ],
    [
      "BEGIN:VEVENT",
      "UID:series",
      "SUMMARY:Series",
      "DTSTART:20260302T090000",
      "DTEND:20260302T100000",
      "RRULE:FREQ=DAILY;COUNT=2",
      "END:VEVENT"
    ],
    [
      "BEGIN:VEVENT",
      "UID:series",
      "RECURRENCE-ID:20260303T090000",
      "STATUS:CANCELLED",
      "DTSTART:20260303T090000",
      "DTEND:20260303T100000",
      "END:VEVENT"
    ]
  ]), feed, range);

  assert.deepEqual(parsed.events.map((event) => event.uid), ["series"]);
});

test("limits recurrence expansion to the requested window", () => {
  const parsed = parseIcalFeed(ics([[
    "BEGIN:VEVENT",
    "UID:forever",
    "SUMMARY:Daily",
    "DTSTART:20200101T090000",
    "DTEND:20200101T100000",
    "RRULE:FREQ=DAILY",
    "END:VEVENT"
  ]]), feed, {
    startDate: "2026-03-10",
    endDate: "2026-03-12"
  });

  assert.deepEqual(parsed.events.map((event) => eventDisplayDates(event)[0]), ["2026-03-10", "2026-03-11"]);
});

test("rejects feeds that exceed the normalized event limit", () => {
  const events = Array.from({ length: ICAL_MAX_NORMALIZED_EVENTS_PER_FEED + 1 }, (_, index) =>
    eventLines(`limit-${index}`, `Limit ${index}`, "20260307T090000", "20260307T100000")
  );

  assert.throws(
    () => parseIcalFeed(ics(events), feed, range),
    /too many events/
  );
});

test("cross-midnight timed events appear only on their starting date", () => {
  const parsed = parseIcalFeed(ics([eventLines("late", "Late", "20260307T233000", "20260308T003000")]), feed, range);
  assert.deepEqual(eventDisplayDates(parsed.events[0]), ["2026-03-07"]);
});

test("stable IDs include feed and recurrence identity, not titles", () => {
  const first = parseIcalFeed(ics([eventLines("same", "Title A", "20260307T090000", "20260307T100000")]), feed, range);
  const second = parseIcalFeed(ics([eventLines("same", "Title B", "20260307T090000", "20260307T100000")]), feed, range);
  const otherFeed = parseIcalFeed(ics([eventLines("same", "Title A", "20260307T090000", "20260307T100000")]), {
    ...feed,
    id: "feed-b",
    name: "Work",
    color: "#ef4444"
  }, range);

  assert.equal(first.events[0].id, second.events[0].id);
  assert.notEqual(first.events[0].id, otherFeed.events[0].id);
});

test("event URLs are optional and only valid HTTP(S) URLs are retained", () => {
  const parsed = parseIcalFeed(ics([
    [
      "BEGIN:VEVENT",
      "UID:with-url",
      "SUMMARY:Link",
      "DTSTART:20260307T090000",
      "DTEND:20260307T100000",
      "URL:https://example.com/event",
      "END:VEVENT"
    ],
    [
      "BEGIN:VEVENT",
      "UID:bad-url",
      "SUMMARY:No link",
      "DTSTART:20260308T090000",
      "DTEND:20260308T100000",
      "URL:javascript:alert(1)",
      "END:VEVENT"
    ]
  ]), feed, range);

  assert.equal(parsed.events.find((event) => event.uid === "with-url")?.url, "https://example.com/event");
  assert.equal(parsed.events.find((event) => event.uid === "bad-url")?.url, undefined);
});

test("resolves calendar event destinations without inventing UID event links", () => {
  const [eventWithUrl, eventWithoutUrl] = parseIcalFeed(ics([
    [
      "BEGIN:VEVENT",
      "UID:with-url",
      "SUMMARY:Link",
      "DTSTART:20260307T090000",
      "DTEND:20260307T100000",
      "URL:https://example.com/event?x=1",
      "END:VEVENT"
    ],
    eventLines("without-url", "No link", "20260308T090000", "20260308T100000")
  ]), feed, range).events;
  const googleFeed: IcalCalendarFeed = {
    ...feed,
    id: "google",
    name: "Not Google By Name",
    url: "https://calendar.google.com/calendar/ical/me%40example.com/private-token/basic.ics"
  };
  const nonGoogleNamedFeed: IcalCalendarFeed = {
    ...feed,
    name: "Google"
  };

  assert.deepEqual(resolveCalendarEventDestination(eventWithUrl, googleFeed), {
    url: "https://example.com/event?x=1",
    kind: "event-url"
  });
  assert.deepEqual(resolveCalendarEventDestination(eventWithoutUrl, googleFeed), {
    url: "https://calendar.google.com/calendar/u/0/r/day/2026/03/08",
    kind: "google-day"
  });
  assert.equal(resolveCalendarEventDestination(eventWithoutUrl, nonGoogleNamedFeed), null);
  assert.equal(resolveCalendarEventDestination({ ...eventWithoutUrl, uid: "known-google-uid" }, undefined), null);
});

test("groups and sorts calendar events by visible date", () => {
  const parsed = parseIcalFeed(ics([
    eventLines("timed", "Timed", "20260307T100000", "20260307T110000"),
    [
      "BEGIN:VEVENT",
      "UID:all",
      "SUMMARY:All day",
      "DTSTART;VALUE=DATE:20260307",
      "DTEND;VALUE=DATE:20260308",
      "END:VEVENT"
    ]
  ]), feed, range);
  const grouped = groupCalendarEventsByDate(parsed.events);
  assert.deepEqual(grouped.get("2026-03-07")?.map((event) => event.uid), ["all", "timed"]);
});

test("unions task dates and calendar-only dates chronologically", () => {
  assert.deepEqual(
    getCalendarTaskDateUnion(["2026-03-12", "2026-03-08"], ["2026-03-10", "2026-03-08"]),
    ["2026-03-08", "2026-03-10", "2026-03-12"]
  );
});

test("filters enabled calendar definitions", () => {
  assert.deepEqual(filterVisibleCalendars([
    { id: "a", name: "A", color: "#111111", enabled: true, maskedUrl: "x", loading: false, consecutiveFailureCount: 0 },
    { id: "b", name: "B", color: "#222222", enabled: false, maskedUrl: "x", loading: false, consecutiveFailureCount: 0 }
  ]).map((item) => item.id), ["a"]);
});

test("event strip visible row count collapses to three rows", () => {
  assert.equal(visibleCalendarEventCount(0, false), 0);
  assert.equal(visibleCalendarEventCount(5, false), 3);
  assert.equal(visibleCalendarEventCount(5, true), 5);
});

test("cache reuses fresh values and deduplicates simultaneous requests", async () => {
  let now = 1_000;
  let calls = 0;
  const cache = new CalendarCache<number>(100, () => now);

  assert.equal(await cache.getOrFetch("a", async () => ++calls), 1);
  assert.equal(await cache.getOrFetch("a", async () => ++calls), 1);
  now = 1_200;
  assert.equal(await cache.getOrFetch("a", async () => ++calls), 2);

  const dedupe = new CalendarCache<number>(1000, () => 1_000);
  let dedupeCalls = 0;
  const [first, second] = await Promise.all([
    dedupe.getOrFetch("a", async () => ++dedupeCalls),
    dedupe.getOrFetch("a", async () => ++dedupeCalls)
  ]);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(dedupeCalls, 1);
});

test("service add, refresh, 304, disabled filtering, and removal preserve task storage", async () => {
  const provider = new FakeIcalProvider();
  provider.nextResult = {
    status: "ok",
    calendarName: "Remote",
    etag: "one",
    lastModified: "Mon, 02 Mar 2026 10:00:00 GMT",
    fetchedAt: Date.parse("2026-03-02T10:00:00Z"),
    events: parseIcalFeed(ics([eventLines("a", "A", "20260307T090000", "20260307T100000")]), feed, range).events
  };
  const settings = testSettings();
  let saved = 0;
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => { saved += 1; },
    onChanged: () => {},
    now: () => Date.parse("2026-03-02T10:20:00Z")
  });

  await service.addFeed({
    name: "Local",
    url: "https://example.com/basic.ics",
    color: "#3b82f6",
    enabled: true
  });

  assert.equal(settings.icalCalendarFeeds.length, 1);
  assert.equal(settings.icalCalendarFeeds[0].etag, "one");
  assert.deepEqual(service.getEventDatesInRange(range), ["2026-03-07"]);

  provider.nextResult = {
    status: "not_modified",
    fetchedAt: Date.parse("2026-03-02T10:21:00Z"),
    events: []
  };
  await service.manualRefresh(settings.icalCalendarFeeds[0].id);
  assert.deepEqual(service.getEventDatesInRange(range), ["2026-03-07"]);

  await service.setFeedEnabled(settings.icalCalendarFeeds[0].id, false);
  assert.deepEqual(service.getEventDatesInRange(range), []);

  await service.removeFeed(settings.icalCalendarFeeds[0].id);
  assert.equal(settings.icalCalendarFeeds.length, 0);
  assert.equal(saved > 0, true);
  service.dispose();
});

test("service refetches a wider date range even when the previous range is fresh", async () => {
  const now = Date.parse("2026-03-02T10:20:00Z");
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => now
  });

  provider.queueResult({ ...resultFor("a", "A", now), etag: "initial" });
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });

  const narrowRange = { startDate: "2026-03-07", endDate: "2026-03-08" };
  provider.queueResult({ ...resultFor("today", "Today only", now), etag: "today" });
  await service.refresh(narrowRange, true);

  provider.queueResult(resultFor("wide", "Wider range", now));
  await service.refresh(range);

  assert.equal(provider.calls.length, 3);
  assert.equal(provider.calls[2].feed.etag, undefined);
  assert.equal(provider.calls[2].feed.lastModified, undefined);
  assert.equal(service.getEventsForDate("2026-03-07")[0].title, "Wider range");
  service.dispose();
});

test("manual refresh bypasses conditional iCal validators", async () => {
  let now = Date.parse("2026-03-02T10:20:00Z");
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => now
  });

  provider.queueResult({
    ...resultFor("a", "A", now - ICAL_REQUEST_FRESHNESS_MS - 1),
    etag: "\"etag-a\"",
    lastModified: "Mon, 02 Mar 2026 10:00:00 GMT"
  });
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const loadedRange = provider.calls[0].range;

  now += ICAL_REQUEST_FRESHNESS_MS + 1;
  provider.queueResult({
    ...resultFor("automatic", "Automatic", now),
    etag: "\"etag-b\"",
    lastModified: "Mon, 02 Mar 2026 10:20:00 GMT"
  });
  await service.refresh(loadedRange);
  assert.equal(provider.calls[1].feed.etag, "\"etag-a\"");
  assert.equal(provider.calls[1].feed.lastModified, "Mon, 02 Mar 2026 10:00:00 GMT");

  provider.queueResult(resultFor("manual", "Manual", now + 1));
  await service.manualRefresh(settings.icalCalendarFeeds[0].id);
  assert.equal(provider.calls[2].feed.etag, undefined);
  assert.equal(provider.calls[2].feed.lastModified, undefined);
  service.dispose();
});

test("service rejects duplicate feed add and replacement without fetching", async () => {
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {}
  });

  provider.queueResult(resultFor("a", "A"));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const firstId = settings.icalCalendarFeeds[0].id;

  await assert.rejects(
    () => service.addFeed({ name: "Duplicate", url: "webcal://example.com/a.ics", color: "#222222", enabled: true }),
    /already been added/
  );
  assert.equal(provider.calls.length, 1);

  provider.queueResult(resultFor("b", "B"));
  await service.addFeed({ name: "B", url: "https://example.com/b.ics", color: "#222222", enabled: true });
  await assert.rejects(
    () => service.updateFeed(firstId, {
      name: "A",
      color: "#111111",
      enabled: true,
      replacementUrl: "https://example.com/b.ics"
    }),
    /already been added/
  );
  assert.equal(provider.calls.length, 2);
  service.dispose();
});

test("service applies automatic backoff while manual refresh bypasses retry waiting", async () => {
  let now = Date.parse("2026-03-02T10:20:00Z");
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => now
  });

  provider.queueResult(resultFor("a", "A", now - ICAL_REQUEST_FRESHNESS_MS - 1));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const feedId = settings.icalCalendarFeeds[0].id;

  provider.queueError({ kind: "network", message: "A failed", calendarId: feedId });
  await service.refresh(range);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 1);
  assert.equal(settings.icalCalendarFeeds[0].nextAutomaticRefreshAt, undefined);

  now += ICAL_REQUEST_FRESHNESS_MS + 1;
  provider.queueError({ kind: "network", message: "A failed again", calendarId: feedId });
  await service.refresh(range);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 2);
  assert.equal(
    settings.icalCalendarFeeds[0].nextAutomaticRefreshAt,
    new Date(now + ICAL_BACKOFF_SECOND_FAILURE_MS).toISOString()
  );

  const callsAfterBackoff = provider.calls.length;
  await service.refresh(range);
  assert.equal(provider.calls.length, callsAfterBackoff);

  provider.queueError({ kind: "network", message: "Manual failed", calendarId: feedId });
  await service.manualRefresh(feedId);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 2);
  assert.equal(
    settings.icalCalendarFeeds[0].nextAutomaticRefreshAt,
    new Date(now + ICAL_BACKOFF_SECOND_FAILURE_MS).toISOString()
  );

  now = Date.parse(settings.icalCalendarFeeds[0].nextAutomaticRefreshAt || "") + 1;
  provider.queueError({ kind: "network", message: "A failed third time", calendarId: feedId });
  await service.refresh(range);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 3);
  assert.equal(
    settings.icalCalendarFeeds[0].nextAutomaticRefreshAt,
    new Date(now + ICAL_BACKOFF_THIRD_FAILURE_MS).toISOString()
  );

  now = Date.parse(settings.icalCalendarFeeds[0].nextAutomaticRefreshAt || "") + 1;
  provider.queueError({ kind: "network", message: "A failed fourth time", calendarId: feedId });
  await service.refresh(range);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 4);
  assert.equal(
    settings.icalCalendarFeeds[0].nextAutomaticRefreshAt,
    new Date(now + ICAL_BACKOFF_MAX_MS).toISOString()
  );

  now = Date.parse(settings.icalCalendarFeeds[0].nextAutomaticRefreshAt || "") + 1;
  provider.queueResult(resultFor("a2", "A2", now));
  await service.refresh(range);
  assert.equal(settings.icalCalendarFeeds[0].consecutiveFailureCount, 0);
  assert.equal(settings.icalCalendarFeeds[0].nextAutomaticRefreshAt, undefined);
  assert.equal(settings.icalCalendarFeeds[0].lastError, undefined);
  service.dispose();
});

test("service deduplicates simultaneous refresh requests for the same feed", async () => {
  const now = Date.parse("2026-03-02T10:20:00Z");
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => now
  });

  provider.queueResult(resultFor("a", "A", now - ICAL_REQUEST_FRESHNESS_MS - 1));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const feedId = settings.icalCalendarFeeds[0].id;
  const pending = provider.queueDeferred();

  const first = service.refresh(range, true);
  const second = service.manualRefresh(feedId);
  assert.equal(provider.calls.length, 2);

  pending.resolve(resultFor("a2", "A2", now));
  await Promise.all([first, second]);
  assert.equal(provider.calls.length, 2);
  assert.equal(service.getEventsForDate("2026-03-07")[0].title, "A2");
  service.dispose();
});

test("service ignores stale responses after URL replacement or feed removal", async () => {
  const now = Date.parse("2026-03-02T10:20:00Z");
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => now
  });

  provider.queueResult(resultFor("old", "Old", now - ICAL_REQUEST_FRESHNESS_MS - 1));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const feedId = settings.icalCalendarFeeds[0].id;

  const staleRefresh = provider.queueDeferred();
  const stalePromise = service.manualRefresh(feedId);
  provider.queueResult(resultFor("new", "New", now));
  await service.updateFeed(feedId, {
    name: "A",
    color: "#222222",
    enabled: true,
    replacementUrl: "https://example.com/new.ics"
  });
  staleRefresh.resolve(resultFor("late", "Late", now + 1));
  await stalePromise;

  assert.equal(settings.icalCalendarFeeds[0].url, "https://example.com/new.ics");
  assert.equal(service.getEventsForDate("2026-03-07")[0].title, "New");

  const removedRefresh = provider.queueDeferred();
  const removedPromise = service.manualRefresh(feedId);
  await service.removeFeed(feedId);
  removedRefresh.resolve(resultFor("removed", "Removed", now + 2));
  await removedPromise;

  assert.equal(settings.icalCalendarFeeds.length, 0);
  assert.deepEqual(service.getEventsForDate("2026-03-07"), []);
  service.dispose();
});

test("service debounces stale resume refreshes and clears timers on dispose", async () => {
  const timers = new FakeWindowTimers();
  const restoreWindow = installFakeWindow(timers);

  try {
    let now = Date.parse("2026-03-02T10:00:00Z");
    const provider = new FakeIcalProvider();
    const settings = testSettings();
    const service = new CalendarService({
      settings,
      provider,
      saveSettings: async () => {},
      onChanged: () => {},
      now: () => now
    });

    assert.equal(timers.intervals.size, 1);
    provider.queueResult(resultFor("a", "A", now));
    await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });

    service.requestStaleRefresh();
    service.requestStaleRefresh();
    assert.equal(timers.timeouts.size, 1);
    timers.runAllTimeouts();
    await flushAsyncWork();
    assert.equal(provider.calls.length, 1);

    now += ICAL_REQUEST_FRESHNESS_MS + 1;
    provider.queueResult(resultFor("a2", "A2", now));
    service.requestStaleRefresh();
    timers.runAllTimeouts();
    await flushAsyncWork();
    assert.equal(provider.calls.length, 2);
    assert.equal(service.getEventsForDate("2026-03-07")[0].title, "A2");

    service.dispose();
    assert.equal(timers.intervals.size, 0);
    service.requestStaleRefresh();
    assert.equal(timers.timeouts.size, 0);
  } finally {
    restoreWindow();
  }
});

test("service replaces deleted remote events and keeps other feeds after partial failure", async () => {
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {},
    now: () => Date.parse("2026-03-02T10:20:00Z")
  });

  provider.queueResult(resultFor("a", "A"));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  provider.queueResult(resultFor("b", "B"));
  await service.addFeed({ name: "B", url: "https://example.com/b.ics", color: "#222222", enabled: true });

  provider.queueResult({ status: "ok", fetchedAt: Date.now(), events: [] });
  provider.queueError({ kind: "network", message: "B failed", calendarId: settings.icalCalendarFeeds[1].id });
  await service.manualRefresh();

  assert.equal(service.getEventsForDate("2026-03-07").some((event) => event.title === "A"), false);
  assert.equal(service.getEventsForDate("2026-03-07").some((event) => event.title === "B"), true);
  assert.equal(service.getConnectionState().partialErrors.length, 1);
  service.dispose();
});

test("service replacing feed URL clears metadata and loads replacement events", async () => {
  const provider = new FakeIcalProvider();
  const settings = testSettings();
  const service = new CalendarService({
    settings,
    provider,
    saveSettings: async () => {},
    onChanged: () => {}
  });

  provider.queueResult(resultFor("old", "Old"));
  await service.addFeed({ name: "A", url: "https://example.com/a.ics", color: "#111111", enabled: true });
  const id = settings.icalCalendarFeeds[0].id;
  provider.queueResult(resultFor("new", "New"));
  await service.updateFeed(id, {
    name: "Renamed",
    color: "#222222",
    enabled: true,
    replacementUrl: "webcal://example.com/new.ics"
  });

  assert.equal(settings.icalCalendarFeeds[0].url, "https://example.com/new.ics");
  assert.equal(service.getEventsForDate("2026-03-07")[0].title, "New");
  service.dispose();
});

function ics(events: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//belki test//EN",
    "X-WR-CALNAME:Test Calendar",
    ...events.flat(),
    "END:VCALENDAR"
  ].join("\r\n");
}

function eventLines(uid: string, summary: string, start: string, end: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    "END:VEVENT"
  ];
}

function testSettings(): BelkiSettings {
  return {
    tasksFilePath: "belki/tasks.md",
    dataFolderPath: "_belki_files",
    defaultProject: "",
    icons: {
      search: "search",
      inbox: "inbox",
      today: "today",
      upcoming: "upcoming",
      filters: "filters",
      projects: "projects",
      activity: "activity",
      completed: "completed"
    },
    projectColors: {},
    labelColors: {},
    labelRegistry: [],
    projectRegistry: [],
    sortMode: "smart",
    groupBy: "none",
    defaultOverdueRange: "last7",
    uiFont: "system",
    taskTitleFont: "system",
    taskDescriptionFont: "system",
    labelFont: "system",
    archivedProjects: [],
    sidebarCollapsed: false,
    dailyNotesIntegrationEnabled: true,
    dailyNotesAutoInsertCompletedBlock: false,
    dailyNoteDateFormat: "YYYY-MM-DD",
    icalCalendarFeeds: []
  };
}

function resultFor(uid: string, title: string, fetchedAt = Date.now()): IcalFeedFetchResult {
  return {
    status: "ok",
    fetchedAt,
    events: parseIcalFeed(ics([eventLines(uid, title, "20260307T090000", "20260307T100000")]), feed, range).events
  };
}

interface DeferredFetch {
  promise: Promise<IcalFeedFetchResult>;
  resolve(result: IcalFeedFetchResult): void;
  reject(error: CalendarProviderError): void;
}

class FakeIcalProvider implements IcalCalendarProvider {
  nextResult: IcalFeedFetchResult | null = null;
  calls: Array<{ feed: IcalCalendarFeed; range: CalendarFetchRange }> = [];
  private actions: Array<
    { result: IcalFeedFetchResult } |
    { error: CalendarProviderError } |
    { deferred: DeferredFetch }
  > = [];

  queueResult(result: IcalFeedFetchResult): void {
    this.actions.push({ result });
  }

  queueError(error: CalendarProviderError): void {
    this.actions.push({ error });
  }

  queueDeferred(): DeferredFetch {
    let resolve!: (result: IcalFeedFetchResult) => void;
    let reject!: (error: CalendarProviderError) => void;
    const deferred: DeferredFetch = {
      promise: new Promise<IcalFeedFetchResult>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
      }),
      resolve,
      reject
    };
    this.actions.push({ deferred });
    return deferred;
  }

  async fetchFeed(feed: IcalCalendarFeed, range: CalendarFetchRange): Promise<IcalFeedFetchResult> {
    this.calls.push({
      feed: { ...feed },
      range: { ...range }
    });

    const action = this.actions.shift();
    if (action) {
      if ("error" in action) {
        throw action.error;
      }
      if ("deferred" in action) {
        return action.deferred.promise;
      }
      return action.result;
    }

    if (this.nextResult) {
      return this.nextResult;
    }

    return {
      status: "ok",
      fetchedAt: Date.now(),
      events: []
    };
  }
}

class FakeWindowTimers {
  timeouts = new Map<number, () => void>();
  intervals = new Map<number, () => void>();
  private nextId = 1;

  setTimeout = (callback: () => void): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.timeouts.set(id, callback);
    return id;
  };

  clearTimeout = (id: number): void => {
    this.timeouts.delete(id);
  };

  setInterval = (callback: () => void): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.intervals.set(id, callback);
    return id;
  };

  clearInterval = (id: number): void => {
    this.intervals.delete(id);
  };

  runAllTimeouts(): void {
    const callbacks = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const callback of callbacks) {
      callback();
    }
  }
}

function installFakeWindow(timers: FakeWindowTimers): () => void {
  const target = globalThis as unknown as { window?: Window };
  const previousWindow = target.window;
  target.window = {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval
  } as unknown as Window;

  return () => {
    if (previousWindow) {
      target.window = previousWindow;
    } else {
      delete target.window;
    }
  };
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
