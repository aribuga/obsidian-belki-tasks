export type CalendarProviderErrorKind =
  | "network"
  | "rate_limited"
  | "malformed_response"
  | "calendar_failed"
  | "unsafe_url"
  | "too_large"
  | "not_found"
  | "not_modified"
  | "unknown";

export interface CalendarProviderError {
  kind: CalendarProviderErrorKind;
  message: string;
  calendarId?: string;
}

export interface CalendarDefinition {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  maskedUrl: string;
  lastSuccessfulRefreshAt?: string;
  lastAttemptedRefreshAt?: string;
  lastErrorAt?: string;
  nextAutomaticRefreshAt?: string;
  consecutiveFailureCount: number;
  loading: boolean;
  error?: CalendarProviderError;
}

export interface CalendarEvent {
  id: string;
  feedId: string;
  uid: string;
  recurrenceId?: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  url?: string;
  status?: string;
  sourceTimeZone?: string;
}

export interface CalendarFetchRange {
  startDate: string;
  endDate: string;
}

export interface CalendarFetchResult {
  events: CalendarEvent[];
  errors: CalendarProviderError[];
  fetchedAt: number;
}

export interface CalendarConnectionState {
  enabled: boolean;
  loading: boolean;
  lastRefreshAt?: string;
  error?: CalendarProviderError;
  partialErrors: CalendarProviderError[];
}

export interface IcalCalendarFeed {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  etag?: string;
  lastModified?: string;
  lastSuccessfulRefreshAt?: string;
  lastAttemptedRefreshAt?: string;
  lastErrorAt?: string;
  nextAutomaticRefreshAt?: string;
  consecutiveFailureCount?: number;
  lastError?: string;
}

export interface IcalFeedFetchResult {
  status: "ok" | "not_modified";
  events: CalendarEvent[];
  calendarName?: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
}

export interface IcalCalendarProvider {
  fetchFeed(feed: IcalCalendarFeed, range: CalendarFetchRange): Promise<IcalFeedFetchResult>;
}
