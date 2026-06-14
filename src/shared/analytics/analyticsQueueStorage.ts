import {
  hasRequiredAnalyticsEventParams,
  isAllowedAnalyticsEventName,
  sanitizeAnalyticsEventParams
} from './analyticsSanitizers';
import type { AnalyticsEventName, AnalyticsPrimitive } from './eventCatalog';
import { createAnalyticsTransportConfig, hasAnalyticsSendConsent } from './analyticsRuntimeConfig';

export const ANALYTICS_QUEUE_STORAGE_KEY = 'analytics_event_queue';
export const DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ANALYTICS_QUEUE_RETRY_BACKOFF_MS = 15 * 60 * 1000;
const USAGE_ANALYTICS_CONSENT_PROBE_EVENT: AnalyticsEventName = 'support_dislike_clicked';

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

export interface AnalyticsQueueClearTarget {
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

export function createUsageAnalyticsQueueStorage(
  storage: AnalyticsQueueStorageArea,
  options: AnalyticsQueueStorageOptions = {}
): AnalyticsQueueStorage {
  return createStorageAnalyticsQueueStorage(storage, ANALYTICS_QUEUE_STORAGE_KEY, options);
}

export async function clearAnalyticsQueueStorage(
  queue: AnalyticsQueueClearTarget | null,
  storage: AnalyticsQueueStorage | null
): Promise<void> {
  if (queue) {
    await queue.clear();
    return;
  }
  await storage?.clear();
}

export async function clearUsageAnalyticsQueueIfConsentRevoked(
  config: {
    enabled?: boolean;
    userConsent?: {
      analytics?: boolean;
    };
  },
  queue: AnalyticsQueueClearTarget | null,
  storage: AnalyticsQueueStorage | null
): Promise<void> {
  if (
    !hasAnalyticsSendConsent(
      createAnalyticsTransportConfig(config),
      USAGE_ANALYTICS_CONSENT_PROBE_EVENT
    )
  ) {
    await clearAnalyticsQueueStorage(queue, storage);
  }
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

export function clonePersistedAnalyticsQueueEntry(
  entry: PersistedAnalyticsQueueEntry
): PersistedAnalyticsQueueEntry {
  return {
    ...entry,
    ...(entry.params ? { params: { ...entry.params } } : {})
  };
}

export function boundPersistedAnalyticsQueueEntries(
  entries: readonly PersistedAnalyticsQueueEntry[],
  now: number,
  maxEntries: number,
  maxAgeMs: number
): PersistedAnalyticsQueueEntry[] {
  return entries.filter((entry) => now - entry.enqueuedAt <= maxAgeMs).slice(-maxEntries);
}

export function resolveAnalyticsQueueRetryBackoffMs(
  attemptCount: number,
  reportingInterval: number,
  retryBackoffMs: ((attemptCount: number) => number) | undefined
): number {
  const baseBackoff = normalizePositiveInteger(
    retryBackoffMs?.(attemptCount),
    reportingInterval * Math.max(1, attemptCount)
  );
  return Math.min(Math.max(baseBackoff, reportingInterval), MAX_ANALYTICS_QUEUE_RETRY_BACKOFF_MS);
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
