import { requestUrl } from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import type {
  CalendarFetchRange,
  CalendarProviderError,
  IcalCalendarFeed,
  IcalFeedFetchResult,
  IcalCalendarProvider as IcalCalendarProviderInterface
} from "./calendarTypes";
import { ICAL_MAX_RESPONSE_BYTES } from "./calendarConstants";
import { CalendarFeedLimitError, parseIcalFeed } from "./icalParser";
import {
  icalMalformedResponseMessage,
  isLikelyIcalFeedText,
  sanitizeIcalErrorMessage
} from "./icalFeedSettings";
import {
  buildIcalRequestHeaders,
  decodeIcalResponseText,
  getIcalResponseHeader,
  icalResponseByteLength
} from "./icalNetwork";

export class IcalCalendarProvider implements IcalCalendarProviderInterface {
  async fetchFeed(feed: IcalCalendarFeed, range: CalendarFetchRange): Promise<IcalFeedFetchResult> {
    const headers = buildIcalRequestHeaders(feed);

    let response: RequestUrlResponse;
    try {
      response = await requestUrl({
        url: feed.url,
        method: "GET",
        headers,
        throw: false
      });
    } catch {
      throw providerError(feed, "network", `${feed.name} could not be refreshed.`);
    }

    const responseHeaders = response.headers || {};
    const etag = getIcalResponseHeader(responseHeaders, "etag") || feed.etag;
    const lastModified = getIcalResponseHeader(responseHeaders, "last-modified") || feed.lastModified;
    const contentType = getIcalResponseHeader(responseHeaders, "content-type") || "";
    const contentLength = Number(getIcalResponseHeader(responseHeaders, "content-length") || "0");

    if (response.status === 304) {
      return {
        status: "not_modified",
        events: [],
        etag,
        lastModified,
        fetchedAt: Date.now()
      };
    }

    if (response.status === 404) {
      throw providerError(
        feed,
        "not_found",
        `${feed.name} calendar feed was not found.`
      );
    }

    if (response.status === 429) {
      throw providerError(feed, "rate_limited", `${feed.name} calendar feed is rate limited.`);
    }

    if (response.status < 200 || response.status >= 300) {
      throw providerError(feed, "network", `${feed.name} calendar feed returned HTTP ${response.status}.`);
    }

    if (Number.isFinite(contentLength) && contentLength > ICAL_MAX_RESPONSE_BYTES) {
      throw providerError(feed, "too_large", `${feed.name} calendar feed is too large.`);
    }

    if (icalResponseByteLength(response) > ICAL_MAX_RESPONSE_BYTES) {
      throw providerError(feed, "too_large", `${feed.name} calendar feed is too large.`);
    }

    const text = decodeIcalResponseText(response);
    if (!text.trim()) {
      throw providerError(feed, "malformed_response", `${feed.name} calendar feed returned an empty response.`);
    }

    if (!isLikelyIcalFeedText(text)) {
      throw providerError(
        feed,
        "malformed_response",
        icalMalformedResponseMessage(feed.name, feed.url, text, contentType)
      );
    }

    try {
      const parsed = parseIcalFeed(text, feed, range);
      return {
        status: "ok",
        events: parsed.events,
        calendarName: parsed.calendarName,
        etag,
        lastModified,
        fetchedAt: Date.now()
      };
    } catch (error) {
      if (error instanceof CalendarFeedLimitError) {
        throw providerError(feed, "too_large", `${feed.name} calendar feed contains too many events.`);
      }

      throw providerError(
        feed,
        "malformed_response",
        icalMalformedResponseMessage(feed.name, feed.url, text, contentType)
      );
    }
  }
}

function providerError(
  feed: IcalCalendarFeed,
  kind: CalendarProviderError["kind"],
  message: string
): IcalCalendarProviderError {
  return new IcalCalendarProviderError(feed, kind, message);
}

class IcalCalendarProviderError extends Error implements CalendarProviderError {
  readonly kind: CalendarProviderError["kind"];
  readonly calendarId: string;

  constructor(feed: IcalCalendarFeed, kind: CalendarProviderError["kind"], message: string) {
    super(sanitizeIcalErrorMessage(message, feed.name));
    this.name = "IcalCalendarProviderError";
    this.kind = kind;
    this.calendarId = feed.id;
  }
}
