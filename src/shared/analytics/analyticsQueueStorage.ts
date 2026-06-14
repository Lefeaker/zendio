import {
  hasRequiredAnalyticsEventParams,
  isAllowedAnalyticsEventName,
  sanitizeAnalyticsEventParams
} from './analyticsSanitizers';
import type { AnalyticsEventName, AnalyticsPrimitive } from './eventCatalog';

const DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PersistedAnalyticsQueueEntry {
  id: string;
  eventName: AnalyticsEventName;
  params?: Record<string, AnalyticsPrimitive>;
  enqueuedAt: number;
  attemptCount: number;
  nextAttemptAt?: number;
}

export interface AnalyticsQueueStorage {
  load: () => Promise<PersistedAnalyticsQueueEntry[]>;
  save: (entries: readonly PersistedAnalyticsQueueEntry[]) => Promise<void>;
  clear: () => Promise<void>;
}

export interface AnalyticsQueueStorageArea {
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  set: <T = unknown>(key: string, value: T) => Promise<void>;
  remove: (key: string | string[]) => Promise<void>;
}

export interface AnalyticsQueueStorageOptions {
  now?: () => number;
  maxAgeMs?: number;
}

export function createStorageAnalyticsQueueStorage(
  storage: AnalyticsQueueStorageArea,
  key: string,
  options: AnalyticsQueueStorageOptions = {}
): AnalyticsQueueStorage {
  const now = options.now ?? Date.now;
  const maxAgeMs = normalizePositiveInteger(options.maxAgeMs, DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS);

  return {
    async load() {
      const storedValue = await storage.get<unknown>(key);
      return normalizePersistedAnalyticsQueueEntries(storedValue, now(), { maxAgeMs });
    },

    async save(entries) {
      const normalizedEntries = normalizePersistedAnalyticsQueueEntries(entries, now(), {
        maxAgeMs
      });
      if (normalizedEntries.length === 0) {
        await storage.remove(key);
        return;
      }
      await storage.set(key, normalizedEntries);
    },

    async clear() {
      await storage.remove(key);
    }
  };
}

export function normalizePersistedAnalyticsQueueEntries(
  entries: unknown,
  now: number,
  options: { maxAgeMs?: number } = {}
): PersistedAnalyticsQueueEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const maxAgeMs = normalizePositiveInteger(options.maxAgeMs, DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS);
  const normalizedEntries: PersistedAnalyticsQueueEntry[] = [];
  for (const entry of entries) {
    const normalizedEntry = normalizePersistedAnalyticsQueueEntry(entry, now, maxAgeMs);
    if (normalizedEntry) {
      normalizedEntries.push(normalizedEntry);
    }
  }
  return normalizedEntries;
}

function normalizePersistedAnalyticsQueueEntry(
  entry: unknown,
  now: number,
  maxAgeMs: number
): PersistedAnalyticsQueueEntry | null {
  if (!isPlainRecord(entry)) {
    return null;
  }

  const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : null;
  const eventName = entry.eventName;
  const enqueuedAt = entry.enqueuedAt;
  const attemptCount = entry.attemptCount;

  if (
    id === null ||
    !isAllowedAnalyticsEventName(eventName) ||
    !isNonNegativeSafeInteger(enqueuedAt) ||
    !isNonNegativeSafeInteger(attemptCount)
  ) {
    return null;
  }

  if (now - enqueuedAt > maxAgeMs) {
    return null;
  }

  const sanitizedParams = sanitizeAnalyticsEventParams(eventName, entry.params);
  if (!hasRequiredAnalyticsEventParams(eventName, sanitizedParams)) {
    return null;
  }

  const nextAttemptAt = normalizeOptionalSafeInteger(entry.nextAttemptAt);
  const normalizedEntry: PersistedAnalyticsQueueEntry = {
    id,
    eventName,
    enqueuedAt,
    attemptCount,
    ...(Object.keys(sanitizedParams).length > 0 ? { params: sanitizedParams } : {})
  };

  if (nextAttemptAt !== undefined) {
    normalizedEntry.nextAttemptAt = nextAttemptAt;
  }

  return normalizedEntry;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function normalizeOptionalSafeInteger(value: unknown): number | undefined {
  return isNonNegativeSafeInteger(value) ? value : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
