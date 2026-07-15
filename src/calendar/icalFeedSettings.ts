import { normalizeCalendarColor } from "./calendarUtils";
import type { IcalCalendarFeed } from "./calendarTypes";

const MASK = "****************";
const DUPLICATE_FEED_MESSAGE = "This calendar feed has already been added.";

export interface IcalFeedDraft {
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export function createIcalFeedId(now = Date.now(), random = Math.random()): string {
  return `ical-${now.toString(36)}-${Math.floor(random * 0xfffff).toString(36)}`;
}

export function normalizeIcalFeedName(value: string | undefined, fallback = "Calendar"): string {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

export function normalizeIcalFeedUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter an iCal feed URL.");
  }

  let candidate = trimmed;
  if (/^webcal:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^webcal:\/\//i, "https://");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid iCal feed URL.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("iCal feed URLs with embedded username or password credentials are not supported.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Use an HTTPS or webcal iCal feed URL.");
  }

  validateIcalUrl(parsed);
  parsed.hash = "";
  return parsed.toString();
}

export function validateIcalUrl(parsed: URL): void {
  if (!parsed.hostname.trim()) {
    throw new Error("Enter a valid iCal feed URL.");
  }

  if (isUnsafeIcalHostname(parsed.hostname)) {
    throw new Error("Use a public HTTPS iCal feed URL.");
  }
}

export function isDuplicateIcalFeedUrl(
  feeds: IcalCalendarFeed[],
  url: string,
  excludeFeedId?: string
): boolean {
  const normalized = normalizeIcalFeedUrl(url);
  return feeds.some((feed) => feed.id !== excludeFeedId && normalizeIcalFeedUrl(feed.url) === normalized);
}

export function duplicateIcalFeedError(): Error {
  return new Error(DUPLICATE_FEED_MESSAGE);
}

export function maskIcalFeedUrl(value: string): string {
  try {
    const parsed = new URL(normalizeIcalFeedUrl(value));
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).pop() || "calendar";
    const safeSegment = isSafeVisiblePathSegment(lastSegment) ? lastSegment : "feed";
    return `${MASK}/${safeSegment}`;
  } catch {
    return `${MASK}/feed`;
  }
}

export function describeIcalFeedUrl(value: string): string {
  if (!value.trim()) {
    return "Paste an iCal URL to test it before saving.";
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizeIcalFeedUrl(value));
  } catch {
    return "Enter a valid HTTPS or webcal iCal URL.";
  }

  if (isGoogleCalendarUrl(parsed)) {
    if (isGoogleSecretIcalUrl(parsed)) {
      return "Google Secret address detected. Keep this URL private.";
    }

    if (isGooglePublicIcalUrl(parsed)) {
      return "Google public iCal link detected. It works only when the calendar is publicly shared.";
    }

    return "Google Calendar URL detected. Use the Secret address in iCal format from Integrate calendar.";
  }

  return "iCal URL detected. Test the connection before saving.";
}

export function icalNotFoundMessage(calendarName: string, url: string): string {
  const name = normalizeIcalFeedName(calendarName);
  let parsed: URL | null = null;

  try {
    parsed = new URL(normalizeIcalFeedUrl(url));
  } catch {
    parsed = null;
  }

  if (parsed && isGoogleSecretIcalUrl(parsed)) {
    return `${name} calendar feed was not found. Google returned 404 for this Secret address. Open the same URL in a browser to confirm it downloads an .ics file, or reset the secret iCal URL in Google Calendar settings.`;
  }

  if (parsed && isGooglePublicIcalUrl(parsed)) {
    return `${name} calendar feed was not found. Google public iCal links work only when the calendar is publicly shared. Use the Secret address in iCal format for private calendars.`;
  }

  if (parsed && isGoogleCalendarUrl(parsed)) {
    return `${name} calendar feed was not found. Use the Secret address in iCal format from Google Calendar settings, or reset the secret iCal URL.`;
  }

  return `${name} calendar feed was not found. Check that the iCal URL is current and opens as an .ics file in a browser.`;
}

export function isLikelyIcalFeedText(value: string): boolean {
  return /^\s*BEGIN:VCALENDAR\b/i.test(value) || /\r?\nBEGIN:VCALENDAR\b/i.test(value);
}

export function icalMalformedResponseMessage(
  calendarName: string,
  url: string,
  text: string,
  contentType = ""
): string {
  const name = normalizeIcalFeedName(calendarName);
  const parsed = parseSafeIcalUrl(url);
  const looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype html\b/i.test(text) || /^\s*<html[\s>]/i.test(text);
  const missingCalendar = !isLikelyIcalFeedText(text);
  const reason = looksLikeHtml
    ? "returned a web page instead of an iCal file"
    : missingCalendar
      ? "did not return a VCALENDAR file"
      : "returned iCal content that could not be parsed";

  if (parsed && isGoogleSecretIcalUrl(parsed)) {
    return `${name} calendar feed ${reason}. Open the same Secret address in a browser. It should download an .ics file. If it opens a page, reset the secret iCal URL in Google Calendar settings and paste the new link into belki.`;
  }

  if (parsed && isGooglePublicIcalUrl(parsed)) {
    return `${name} calendar feed ${reason}. Google public iCal links work only when the calendar is publicly shared. Use the Secret address in iCal format for private calendars.`;
  }

  if (parsed && isGoogleCalendarUrl(parsed)) {
    return `${name} calendar feed ${reason}. Use the Secret address in iCal format from Google Calendar settings.`;
  }

  return `${name} calendar feed ${reason}. Confirm the URL opens as an .ics file in a browser.`;
}

export function sanitizeIcalErrorMessage(value: unknown, calendarName = "Calendar"): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    return sanitizeIcalErrorMessage((value as { message?: unknown }).message, calendarName);
  }

  const message = typeof value === "string" ? value : "Calendar feed could not be refreshed.";
  return message
    .replace(/webcal:\/\/\S+/gi, "[calendar-url]")
    .replace(/https?:\/\/\S+/gi, "[calendar-url]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .replace(/[^\w\s.,:;()/-]/g, "")
    .replace(/\s+/g, " ")
    .trim() || `${calendarName} could not be refreshed.`;
}

export function sanitizeUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(normalizeIcalFeedUrl(value));
    return `${parsed.protocol}//${parsed.hostname}/[calendar-url]`;
  } catch {
    return "[calendar-url]";
  }
}

export function calendarErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "message" in value) {
    return sanitizeIcalErrorMessage((value as { message?: unknown }).message) || fallback;
  }

  if (typeof value === "string") {
    return sanitizeIcalErrorMessage(value) || fallback;
  }

  return fallback;
}

export function normalizeIcalCalendarFeeds(value: unknown): IcalCalendarFeed[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const feeds: IcalCalendarFeed[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : createIcalFeedId();
    if (seen.has(id)) {
      continue;
    }

    const rawUrl = typeof record.url === "string" ? record.url : "";
    let url: string;
    try {
      url = normalizeIcalFeedUrl(rawUrl);
    } catch {
      continue;
    }

    seen.add(id);
    feeds.push({
      id,
      name: normalizeIcalFeedName(typeof record.name === "string" ? record.name : undefined),
      url,
      color: normalizeCalendarColor(typeof record.color === "string" ? record.color : undefined),
      enabled: typeof record.enabled === "boolean" ? record.enabled : true,
      etag: optionalString(record.etag),
      lastModified: optionalString(record.lastModified),
      lastSuccessfulRefreshAt: optionalString(record.lastSuccessfulRefreshAt),
      lastAttemptedRefreshAt: optionalString(record.lastAttemptedRefreshAt),
      lastErrorAt: optionalString(record.lastErrorAt),
      nextAutomaticRefreshAt: optionalString(record.nextAutomaticRefreshAt),
      consecutiveFailureCount: normalizeFailureCount(record.consecutiveFailureCount),
      lastError: optionalString(record.lastError)
        ? sanitizeIcalErrorMessage(record.lastError)
        : undefined
    });
  }

  return feeds;
}

export function feedToCalendarDefinition(feed: IcalCalendarFeed, loading: boolean) {
  return {
    id: feed.id,
    name: feed.name,
    color: feed.color,
    enabled: feed.enabled,
    maskedUrl: maskIcalFeedUrl(feed.url),
    lastSuccessfulRefreshAt: feed.lastSuccessfulRefreshAt,
    lastAttemptedRefreshAt: feed.lastAttemptedRefreshAt,
    lastErrorAt: feed.lastErrorAt,
    nextAutomaticRefreshAt: feed.nextAutomaticRefreshAt,
    consecutiveFailureCount: feed.consecutiveFailureCount || 0,
    loading,
    error: feed.lastError
      ? {
          kind: "calendar_failed" as const,
          message: feed.lastError,
          calendarId: feed.id
        }
      : undefined
  };
}

export function isIcalFeedFresh(feed: IcalCalendarFeed, now: number, freshnessMs: number): boolean {
  if (!feed.lastSuccessfulRefreshAt) {
    return false;
  }

  const last = new Date(feed.lastSuccessfulRefreshAt).getTime();
  return Number.isFinite(last) && now - last < freshnessMs;
}

export function buildIcalFeed(input: IcalFeedDraft, id = createIcalFeedId()): IcalCalendarFeed {
  return {
    id,
    name: normalizeIcalFeedName(input.name),
    url: normalizeIcalFeedUrl(input.url),
    color: normalizeCalendarColor(input.color),
    enabled: input.enabled,
    consecutiveFailureCount: 0
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isSafeVisiblePathSegment(value: string): boolean {
  if (value.length > 32) {
    return false;
  }

  return /^[A-Za-z0-9._-]+$/.test(value);
}

function parseSafeIcalUrl(value: string): URL | null {
  try {
    return new URL(normalizeIcalFeedUrl(value));
  } catch {
    return null;
  }
}

function isGoogleCalendarIcalUrl(parsed: URL): boolean {
  return isGoogleCalendarUrl(parsed) && parsed.pathname.toLowerCase().startsWith("/calendar/ical/");
}

function isGoogleCalendarUrl(parsed: URL): boolean {
  return parsed.hostname.toLowerCase() === "calendar.google.com";
}

function isGoogleSecretIcalUrl(parsed: URL): boolean {
  return isGoogleCalendarIcalUrl(parsed) && parsed.pathname.toLowerCase().includes("/private-");
}

function isGooglePublicIcalUrl(parsed: URL): boolean {
  return isGoogleCalendarIcalUrl(parsed) && parsed.pathname.toLowerCase().includes("/public/");
}

function normalizeFailureCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100)
    : 0;
}

function isUnsafeIcalHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isUnsafeIpv4(ipv4)) {
    return true;
  }

  const ipv6 = hostname.replace(/^\[/, "").replace(/\]$/, "");
  return isUnsafeIpv6(ipv6);
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const numbers = parts.map(Number);
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

function isUnsafeIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 198 && (b === 18 || b === 19);
}

function isUnsafeIpv6(value: string): boolean {
  if (!value.includes(":")) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.");
}
