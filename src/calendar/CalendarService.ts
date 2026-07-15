import type { BelkiSettings } from "../settings";
import { todayIso } from "../dateUtils";
import type {
  CalendarConnectionState,
  CalendarDefinition,
  CalendarEvent,
  CalendarFetchRange,
  CalendarProviderError,
  IcalCalendarFeed,
  IcalCalendarProvider
} from "./calendarTypes";
import {
  ICAL_BACKOFF_MAX_MS,
  ICAL_BACKOFF_SECOND_FAILURE_MS,
  ICAL_BACKOFF_THIRD_FAILURE_MS,
  ICAL_REQUEST_FRESHNESS_MS,
  ICAL_REFRESH_INTERVAL_MS,
  ICAL_RESUME_REFRESH_DEBOUNCE_MS
} from "./calendarConstants";
import {
  compareCalendarEvents,
  createTodayCalendarRange,
  createUpcomingCalendarRange
} from "./calendarUtils";
import { groupVisibleCalendarEvents } from "./calendarGrouping";
import {
  buildIcalFeed,
  duplicateIcalFeedError,
  feedToCalendarDefinition,
  isDuplicateIcalFeedUrl,
  isIcalFeedFresh,
  sanitizeIcalErrorMessage,
  type IcalFeedDraft
} from "./icalFeedSettings";

type RefreshReason = "automatic" | "manual";

interface CalendarServiceOptions {
  settings: BelkiSettings;
  provider: IcalCalendarProvider;
  saveSettings(this: void): Promise<void>;
  onChanged(this: void): void;
  now?(this: void): number;
}

interface InFlightRefresh {
  promise: Promise<void>;
  sequence: number;
}

export class CalendarService {
  private subscribers = new Set<(this: void) => void>();
  private eventsByFeed = new Map<string, CalendarEvent[]>();
  private loadedRangesByFeed = new Map<string, CalendarFetchRange>();
  private eventsByDate = new Map<string, CalendarEvent[]>();
  private partialErrors: CalendarProviderError[] = [];
  private error: CalendarProviderError | undefined;
  private loadingFeeds = new Set<string>();
  private refreshSequences = new Map<string, number>();
  private inFlight = new Map<string, InFlightRefresh>();
  private lastRange: CalendarFetchRange | null = null;
  private dataVersion = 0;
  private intervalId: number | null = null;
  private resumeRefreshTimer: number | null = null;
  private disposed = false;
  private now: (this: void) => number;

  constructor(private options: CalendarServiceOptions) {
    this.now = options.now || (() => Date.now());
    this.startAutoRefresh();
  }

  subscribe(callback: (this: void) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.subscribers.clear();
    this.stopAutoRefresh();
    this.clearResumeTimer();
    this.inFlight.clear();
    this.loadingFeeds.clear();
  }

  getConnectionState(): CalendarConnectionState {
    const feeds = this.getFeeds();
    const successfulRefreshes = feeds
      .map((feed) => feed.lastSuccessfulRefreshAt)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort();
    const lastRefreshAt = successfulRefreshes[successfulRefreshes.length - 1];

    return {
      enabled: feeds.some((feed) => feed.enabled),
      loading: this.loadingFeeds.size > 0,
      lastRefreshAt,
      error: this.error,
      partialErrors: this.partialErrors
    };
  }

  getFeeds(): IcalCalendarFeed[] {
    return [...this.options.settings.icalCalendarFeeds];
  }

  getCalendars(): CalendarDefinition[] {
    return this.getFeeds().map((feed) =>
      feedToCalendarDefinition(feed, this.loadingFeeds.has(feed.id))
    );
  }

  getDataVersion(): number {
    return this.dataVersion;
  }

  getEventsForDate(date: string): CalendarEvent[] {
    if (!this.shouldShowEvents()) {
      return [];
    }

    return [...(this.eventsByDate.get(date) || [])].sort(compareCalendarEvents);
  }

  getEventDatesInRange(range: CalendarFetchRange): string[] {
    if (!this.shouldShowEvents()) {
      return [];
    }

    return [...this.eventsByDate.keys()]
      .filter((date) => date >= range.startDate && date < range.endDate)
      .sort();
  }

  getTodayRange(today: string): CalendarFetchRange {
    return createTodayCalendarRange(today);
  }

  getUpcomingRange(today: string): CalendarFetchRange {
    return createUpcomingCalendarRange(today);
  }

  getTaskViewCalendarRange(today: string): CalendarFetchRange {
    const upcomingRange = this.getUpcomingRange(today);
    return {
      startDate: today,
      endDate: upcomingRange.endDate
    };
  }

  shouldShowEvents(): boolean {
    return this.getFeeds().some((feed) => feed.enabled);
  }

  async testFeed(draft: IcalFeedDraft): Promise<{ name?: string; eventCount: number }> {
    const feed = buildIcalFeed(draft, "ical-test");
    const result = await this.options.provider.fetchFeed(feed, this.getDefaultCalendarRange());
    return {
      name: result.calendarName,
      eventCount: result.events.length
    };
  }

  async addFeed(draft: IcalFeedDraft): Promise<void> {
    const feed = buildIcalFeed(draft);
    this.ensureFeedUrlIsUnique(feed.url);

    const range = this.getDefaultCalendarRange();
    const result = await this.options.provider.fetchFeed(feed, range);
    const nextFeed: IcalCalendarFeed = {
      ...feed,
      name: feed.name || result.calendarName || "Calendar",
      etag: result.etag,
      lastModified: result.lastModified,
      lastAttemptedRefreshAt: new Date(result.fetchedAt).toISOString(),
      lastSuccessfulRefreshAt: new Date(result.fetchedAt).toISOString(),
      lastErrorAt: undefined,
      nextAutomaticRefreshAt: undefined,
      consecutiveFailureCount: 0,
      lastError: undefined
    };

    this.options.settings.icalCalendarFeeds = [
      ...this.getFeeds(),
      nextFeed
    ];
    this.eventsByFeed.set(nextFeed.id, this.applyFeedDisplay(result.events, nextFeed));
    this.loadedRangesByFeed.set(nextFeed.id, range);
    this.rebuildEventsByDate();
    this.bumpDataVersion();
    await this.options.saveSettings();
    this.notifyViews();
  }

  async updateFeed(feedId: string, updates: {
    name: string;
    color: string;
    enabled: boolean;
    replacementUrl?: string;
  }): Promise<void> {
    const current = this.getFeed(feedId);
    if (!current || this.disposed) {
      return;
    }

    this.invalidateFeedRequests(feedId);
    const base = buildIcalFeed({ ...updates, url: current.url }, current.id);
    let nextFeed: IcalCalendarFeed = {
      ...current,
      name: base.name,
      color: base.color,
      enabled: updates.enabled
    };

    if (updates.replacementUrl?.trim()) {
      const replacement = buildIcalFeed({
        name: updates.name,
        url: updates.replacementUrl,
        color: updates.color,
        enabled: updates.enabled
      }, current.id);
      this.ensureFeedUrlIsUnique(replacement.url, current.id);

      if (replacement.url !== current.url) {
        const range = this.getDefaultCalendarRange();
        const result = await this.options.provider.fetchFeed(replacement, range);
        if (this.disposed || !this.getFeed(current.id)) {
          return;
        }
        nextFeed = {
          ...replacement,
          etag: result.etag,
          lastModified: result.lastModified,
          lastAttemptedRefreshAt: new Date(result.fetchedAt).toISOString(),
          lastSuccessfulRefreshAt: new Date(result.fetchedAt).toISOString(),
          lastErrorAt: undefined,
          nextAutomaticRefreshAt: undefined,
          consecutiveFailureCount: 0,
          lastError: undefined
        };
        this.eventsByFeed.set(current.id, this.applyFeedDisplay(result.events, nextFeed));
        this.loadedRangesByFeed.set(current.id, range);
      } else {
        nextFeed = {
          ...nextFeed,
          name: replacement.name,
          color: replacement.color,
          enabled: replacement.enabled
        };
        this.eventsByFeed.set(current.id, (this.eventsByFeed.get(current.id) || []).map((event) => ({
          ...event,
          calendarName: nextFeed.name,
          calendarColor: nextFeed.color
        })));
      }
    } else {
      this.eventsByFeed.set(current.id, (this.eventsByFeed.get(current.id) || []).map((event) => ({
        ...event,
        calendarName: nextFeed.name,
        calendarColor: nextFeed.color
      })));
    }

    this.replaceFeed(nextFeed);
    this.rebuildEventsByDate();
    this.bumpDataVersion();
    await this.options.saveSettings();
    this.notifyViews();

    if (nextFeed.enabled && !isIcalFeedFresh(nextFeed, this.now(), ICAL_REQUEST_FRESHNESS_MS)) {
      await this.refreshFeed(nextFeed.id, this.getDefaultCalendarRange(), "manual");
    }
  }

  async setFeedEnabled(feedId: string, enabled: boolean): Promise<void> {
    const feed = this.getFeed(feedId);
    if (!feed || this.disposed) {
      return;
    }

    this.invalidateFeedRequests(feedId);
    this.replaceFeed({ ...feed, enabled });
    this.rebuildEventsByDate();
    this.bumpDataVersion();
    await this.options.saveSettings();
    this.notifyViews();

    if (enabled) {
      await this.refreshFeed(feedId, this.getDefaultCalendarRange(), "manual");
    }
  }

  async removeFeed(feedId: string): Promise<void> {
    this.invalidateFeedRequests(feedId);
    this.options.settings.icalCalendarFeeds = this.getFeeds().filter((feed) => feed.id !== feedId);
    this.eventsByFeed.delete(feedId);
    this.loadedRangesByFeed.delete(feedId);
    this.loadingFeeds.delete(feedId);
    this.inFlight.delete(feedId);
    this.rebuildEventsByDate();
    this.bumpDataVersion();
    await this.options.saveSettings();
    this.notifyViews();
  }

  async refresh(range: CalendarFetchRange, force = false): Promise<void> {
    await this.refreshWithReason(range, force ? "manual" : "automatic");
  }

  async manualRefresh(feedId?: string): Promise<void> {
    const range = this.getDefaultCalendarRange();
    if (feedId) {
      await this.refreshFeed(feedId, range, "manual");
      return;
    }

    await this.refreshWithReason(range, "manual");
  }

  async refreshStartup(): Promise<void> {
    await this.refreshWithReason(this.getDefaultCalendarRange(), "automatic");
  }

  requestStaleRefresh(): void {
    if (this.disposed || !this.shouldShowEvents()) {
      return;
    }

    this.clearResumeTimer();
    if (typeof window === "undefined") {
      void this.refreshStartup();
      return;
    }

    this.resumeRefreshTimer = window.setTimeout(() => {
      this.resumeRefreshTimer = null;
      void this.refreshStartup();
    }, ICAL_RESUME_REFRESH_DEBOUNCE_MS);
  }

  private async refreshWithReason(range: CalendarFetchRange, reason: RefreshReason): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.lastRange = range;
    if (!this.shouldShowEvents()) {
      this.eventsByDate.clear();
      this.partialErrors = [];
      this.error = undefined;
      this.notifyViews();
      return;
    }

    const enabledFeeds = this.getFeeds().filter((feed) => feed.enabled);
    await Promise.all(enabledFeeds.map((feed) => this.refreshFeed(feed.id, range, reason)));
  }

  private async refreshFeed(feedId: string, range: CalendarFetchRange, reason: RefreshReason): Promise<void> {
    const feed = this.getFeed(feedId);
    if (!feed || !feed.enabled || this.disposed) {
      return;
    }

    if (reason === "automatic") {
      if (!this.shouldAutomaticRefresh(feed, range)) {
        return;
      }
      if (this.isWaitingForBackoff(feed)) {
        return;
      }
    }

    const existing = this.inFlight.get(feed.id);
    if (existing) {
      await existing.promise;
      return;
    }

    const sequence = this.nextSequence(feed.id);
    this.loadingFeeds.add(feed.id);
    this.notify();

    const shouldUseConditionalRequest = reason === "automatic" &&
      this.eventsByFeed.has(feed.id) &&
      this.hasLoadedRange(feed.id, range);
    const requestFeed = shouldUseConditionalRequest
      ? feed
      : { ...feed, etag: undefined, lastModified: undefined };

    const promise = this.fetchAndApplyFeed(requestFeed, range, sequence, reason)
      .finally(() => {
        const active = this.inFlight.get(feed.id);
        if (active?.sequence === sequence) {
          this.inFlight.delete(feed.id);
        }
        if (this.refreshSequences.get(feed.id) === sequence && !this.disposed) {
          this.loadingFeeds.delete(feed.id);
          this.notify();
        }
      });

    this.inFlight.set(feed.id, { promise, sequence });
    await promise;
  }

  private async fetchAndApplyFeed(
    feed: IcalCalendarFeed,
    range: CalendarFetchRange,
    sequence: number,
    reason: RefreshReason
  ): Promise<void> {
    const attemptedAt = new Date(this.now()).toISOString();

    try {
      const result = await this.options.provider.fetchFeed(feed, range);
      if (!this.isCurrentRefresh(feed, sequence)) {
        return;
      }

      const lastSuccessfulRefreshAt = new Date(result.fetchedAt).toISOString();
      const nextFeed: IcalCalendarFeed = {
        ...this.getFeed(feed.id)!,
        etag: result.etag,
        lastModified: result.lastModified,
        lastAttemptedRefreshAt: lastSuccessfulRefreshAt,
        lastSuccessfulRefreshAt,
        lastErrorAt: undefined,
        nextAutomaticRefreshAt: undefined,
        consecutiveFailureCount: 0,
        lastError: undefined
      };

      if (result.status === "ok") {
        this.eventsByFeed.set(feed.id, this.applyFeedDisplay(result.events, nextFeed));
        this.loadedRangesByFeed.set(feed.id, range);
      }

      this.replaceFeed(nextFeed);
      this.rebuildEventsByDate();
      this.partialErrors = this.collectFeedErrors();
      this.error = this.partialErrors[0];
      this.bumpDataVersion();
      await this.options.saveSettings();
      this.notifyViews();
    } catch (error) {
      if (!this.isCurrentRefresh(feed, sequence)) {
        return;
      }

      const current = this.getFeed(feed.id)!;
      const normalized = normalizeServiceError(error, current.name, current.id);
      const failure = this.nextFailureState(current, reason, attemptedAt);
      this.replaceFeed({
        ...current,
        ...failure,
        lastError: normalized.message
      });
      this.partialErrors = this.collectFeedErrors();
      this.error = normalized;
      this.bumpDataVersion();
      await this.options.saveSettings();
      this.notifyViews();
    }
  }

  private rebuildEventsByDate(): void {
    const enabledFeedIds = new Set(this.getFeeds().filter((feed) => feed.enabled).map((feed) => feed.id));
    const events: CalendarEvent[] = [];
    for (const [feedId, feedEvents] of this.eventsByFeed) {
      if (enabledFeedIds.has(feedId)) {
        events.push(...feedEvents);
      }
    }
    this.eventsByDate = groupVisibleCalendarEvents(events);
  }

  private applyFeedDisplay(events: CalendarEvent[], feed: IcalCalendarFeed): CalendarEvent[] {
    return events.map((event) => ({
      ...event,
      feedId: feed.id,
      calendarId: feed.id,
      calendarName: feed.name,
      calendarColor: feed.color
    }));
  }

  private getFeed(feedId: string): IcalCalendarFeed | undefined {
    return this.getFeeds().find((feed) => feed.id === feedId);
  }

  private replaceFeed(feed: IcalCalendarFeed): void {
    this.options.settings.icalCalendarFeeds = this.getFeeds().map((candidate) =>
      candidate.id === feed.id ? feed : candidate
    );
  }

  private collectFeedErrors(): CalendarProviderError[] {
    return this.getFeeds()
      .filter((feed) => feed.lastError)
      .map((feed) => ({
        kind: "calendar_failed" as const,
        message: feed.lastError!,
        calendarId: feed.id
      }));
  }

  private ensureFeedUrlIsUnique(url: string, excludeFeedId?: string): void {
    if (isDuplicateIcalFeedUrl(this.getFeeds(), url, excludeFeedId)) {
      throw duplicateIcalFeedError();
    }
  }

  private shouldAutomaticRefresh(feed: IcalCalendarFeed, range: CalendarFetchRange): boolean {
    return !isIcalFeedFresh(feed, this.now(), ICAL_REQUEST_FRESHNESS_MS) ||
      !this.eventsByFeed.has(feed.id) ||
      !this.hasLoadedRange(feed.id, range);
  }

  private isWaitingForBackoff(feed: IcalCalendarFeed): boolean {
    const next = feed.nextAutomaticRefreshAt ? new Date(feed.nextAutomaticRefreshAt).getTime() : NaN;
    return Number.isFinite(next) && next > this.now();
  }

  private hasLoadedRange(feedId: string, range: CalendarFetchRange): boolean {
    const loaded = this.loadedRangesByFeed.get(feedId);
    return Boolean(loaded && loaded.startDate <= range.startDate && loaded.endDate >= range.endDate);
  }

  private nextFailureState(feed: IcalCalendarFeed, reason: RefreshReason, attemptedAt: string): Partial<IcalCalendarFeed> {
    if (reason !== "automatic") {
      return {
        lastAttemptedRefreshAt: attemptedAt,
        lastErrorAt: attemptedAt
      };
    }

    const consecutiveFailureCount = (feed.consecutiveFailureCount || 0) + 1;
    const delay = backoffDelayForFailureCount(consecutiveFailureCount);
    return {
      lastAttemptedRefreshAt: attemptedAt,
      lastErrorAt: attemptedAt,
      consecutiveFailureCount,
      nextAutomaticRefreshAt: delay > 0
        ? new Date(this.now() + delay).toISOString()
        : undefined
    };
  }

  private isCurrentRefresh(feed: IcalCalendarFeed, sequence: number): boolean {
    if (this.disposed || this.refreshSequences.get(feed.id) !== sequence) {
      return false;
    }

    const current = this.getFeed(feed.id);
    return Boolean(current && current.enabled && current.url === feed.url);
  }

  private nextSequence(feedId: string): number {
    const sequence = (this.refreshSequences.get(feedId) || 0) + 1;
    this.refreshSequences.set(feedId, sequence);
    return sequence;
  }

  private invalidateFeedRequests(feedId: string): void {
    this.nextSequence(feedId);
    this.inFlight.delete(feedId);
    this.loadingFeeds.delete(feedId);
  }

  private bumpDataVersion(): void {
    this.dataVersion += 1;
  }

  private startAutoRefresh(): void {
    if (this.intervalId !== null || typeof window === "undefined") {
      return;
    }

    this.intervalId = window.setInterval(() => {
      void this.refreshWithReason(this.getDefaultCalendarRange(), "automatic");
    }, ICAL_REFRESH_INTERVAL_MS);
  }

  private stopAutoRefresh(): void {
    if (this.intervalId === null || typeof window === "undefined") {
      return;
    }

    window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private clearResumeTimer(): void {
    if (this.resumeRefreshTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.resumeRefreshTimer);
    }
    this.resumeRefreshTimer = null;
  }

  private notify(): void {
    if (this.disposed) {
      return;
    }

    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private notifyViews(): void {
    this.notify();
    if (!this.disposed) {
      this.options.onChanged();
    }
  }

  private getDefaultCalendarRange(): CalendarFetchRange {
    return this.getTaskViewCalendarRange(todayIso());
  }
}

function normalizeServiceError(error: unknown, calendarName: string, calendarId: string): CalendarProviderError {
  if (isCalendarProviderError(error)) {
    return {
      kind: error.kind,
      message: sanitizeIcalErrorMessage(error.message, calendarName),
      calendarId: error.calendarId || calendarId
    };
  }

  return {
    kind: "unknown",
    message: sanitizeIcalErrorMessage(error, calendarName),
    calendarId
  };
}

const CALENDAR_PROVIDER_ERROR_KINDS = new Set<CalendarProviderError["kind"]>([
  "network",
  "rate_limited",
  "malformed_response",
  "calendar_failed",
  "unsafe_url",
  "too_large",
  "not_found",
  "not_modified",
  "unknown"
]);

function isCalendarProviderError(value: unknown): value is CalendarProviderError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return isCalendarProviderErrorKind(record.kind) && typeof record.message === "string";
}

function isCalendarProviderErrorKind(value: unknown): value is CalendarProviderError["kind"] {
  return typeof value === "string" && CALENDAR_PROVIDER_ERROR_KINDS.has(value as CalendarProviderError["kind"]);
}

function backoffDelayForFailureCount(count: number): number {
  if (count <= 1) {
    return 0;
  }

  if (count === 2) {
    return ICAL_BACKOFF_SECOND_FAILURE_MS;
  }

  if (count === 3) {
    return ICAL_BACKOFF_THIRD_FAILURE_MS;
  }

  return ICAL_BACKOFF_MAX_MS;
}
