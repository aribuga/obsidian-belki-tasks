export const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

interface CalendarCacheEntry<T> {
  value?: T;
  fetchedAt: number;
  pending?: Promise<T>;
}

export class CalendarCache<T> {
  private entries = new Map<string, CalendarCacheEntry<T>>();

  constructor(
    private ttlMs = CALENDAR_CACHE_TTL_MS,
    private now: () => number = () => Date.now()
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.value === undefined) {
      return undefined;
    }

    if (this.now() - entry.fetchedAt > this.ttlMs) {
      return undefined;
    }

    return entry.value;
  }

  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const existing = this.entries.get(key);
    if (existing?.pending) {
      return existing.pending;
    }

    const pending = fetcher().then((value) => {
      this.entries.set(key, {
        value,
        fetchedAt: this.now()
      });
      return value;
    }).catch((error) => {
      const current = this.entries.get(key);
      if (current?.pending === pending) {
        this.entries.delete(key);
      }
      throw error;
    });

    this.entries.set(key, {
      fetchedAt: 0,
      pending
    });

    return pending;
  }

  clear(): void {
    this.entries.clear();
  }
}
