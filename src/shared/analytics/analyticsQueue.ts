import { hasConsentForAnalyticsEvent } from './analyticsConsent';
import { isAllowedAnalyticsEventName, parseAnalyticsEventParams } from './analyticsSanitizers';
import type { AnalyticsEventName, AnalyticsPrimitive } from './eventCatalog';
import {
  boundPersistedAnalyticsQueueEntries,
  clonePersistedAnalyticsQueueEntry,
  DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS,
  resolveAnalyticsQueueRetryBackoffMs,
  type AnalyticsQueueStorage,
  type PersistedAnalyticsQueueEntry
} from './analyticsQueueStorage';
import { sendAnalyticsTransportEvent, type AnalyticsTransportResult } from './analyticsTransport';
import type { AnalyticsConfig } from '../errors/analytics/analyticsConfig';

const DEFAULT_ANALYTICS_QUEUE_MAX_ENTRIES = 50;

export interface AnalyticsQueueEntry<
  EventName extends AnalyticsEventName = AnalyticsEventName
> extends PersistedAnalyticsQueueEntry {
  eventName: EventName;
}

export interface AnalyticsQueueFlushResult {
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
}

export interface AnalyticsEventQueueOptions {
  getConfig: () => AnalyticsConfig;
  send?: (
    eventName: AnalyticsEventName,
    params: Record<string, AnalyticsPrimitive> | undefined,
    config: AnalyticsConfig
  ) => Promise<AnalyticsTransportResult>;
  now?: () => number;
  storage?: AnalyticsQueueStorage;
  maxEntries?: number;
  maxAgeMs?: number;
  retryBackoffMs?: (attemptCount: number) => number;
}

export interface AnalyticsEventQueue {
  hydrate: () => Promise<void>;
  enqueue: <EventName extends AnalyticsEventName>(
    eventName: EventName,
    params?: Record<string, unknown>
  ) => boolean;
  flush: (options?: { force?: boolean }) => Promise<AnalyticsQueueFlushResult>;
  clear: () => Promise<void>;
  size: () => number;
  snapshot: () => readonly AnalyticsQueueEntry[];
}

export function createAnalyticsEventQueue(
  options: AnalyticsEventQueueOptions
): AnalyticsEventQueue {
  const now = options.now ?? Date.now;
  const send = options.send ?? sendAnalyticsTransportEvent;
  const storage = options.storage;
  const maxEntries = normalizePositiveInteger(
    options.maxEntries,
    DEFAULT_ANALYTICS_QUEUE_MAX_ENTRIES
  );
  const maxAgeMs = normalizePositiveInteger(options.maxAgeMs, DEFAULT_ANALYTICS_QUEUE_MAX_AGE_MS);
  let entries: AnalyticsQueueEntry[] = [];
  let lastFlushAt = 0;
  let entrySequence = 0;
  let hydrated = false;
  let hydrationPromise: Promise<void> | null = null;

  const persistEntries = async (): Promise<void> => {
    if (storage) {
      await storage.save(entries.map(clonePersistedAnalyticsQueueEntry));
    }
  };

  const hydrate = async (): Promise<void> => {
    if (hydrated || !storage) {
      hydrated = true;
      return;
    }
    if (hydrationPromise) {
      await hydrationPromise;
      return;
    }
    hydrationPromise = (async () => {
      entries = boundPersistedAnalyticsQueueEntries(
        [...(await storage.load()).map(clonePersistedAnalyticsQueueEntry), ...entries],
        now(),
        maxEntries,
        maxAgeMs
      ) as AnalyticsQueueEntry[];
      hydrated = true;
    })();
    try {
      await hydrationPromise;
    } finally {
      hydrationPromise = null;
    }
  };

  return {
    hydrate,
    enqueue(eventName, params) {
      if (!isAllowedAnalyticsEventName(eventName)) {
        return false;
      }
      const parsedParams = parseAnalyticsEventParams(eventName, params ?? {});
      if (parsedParams === null) {
        return false;
      }
      entries = boundPersistedAnalyticsQueueEntries(
        [
          ...entries,
          {
            id: `analytics-queue-${now()}-${entrySequence++}`,
            eventName,
            enqueuedAt: now(),
            attemptCount: 0,
            ...(Object.keys(parsedParams).length > 0 ? { params: parsedParams } : {})
          }
        ],
        now(),
        maxEntries,
        maxAgeMs
      ) as AnalyticsQueueEntry[];
      return true;
    },
    async flush(flushOptions = {}) {
      await hydrate();
      const config = options.getConfig();
      const currentTime = now();
      const reportingInterval = normalizePositiveInteger(config.reportingInterval, 30000);
      const batchSize = normalizePositiveInteger(config.batchSize, 1);
      entries = boundPersistedAnalyticsQueueEntries(
        entries,
        currentTime,
        maxEntries,
        maxAgeMs
      ) as AnalyticsQueueEntry[];
      if (!flushOptions.force && lastFlushAt > 0 && currentTime - lastFlushAt < reportingInterval) {
        const result = {
          sent: 0,
          skipped: entries.length > 0 ? 1 : 0,
          failed: 0,
          remaining: entries.length
        };
        await persistEntries();
        return result;
      }

      const batch: AnalyticsQueueEntry[] = [];
      const deferredEntries: AnalyticsQueueEntry[] = [];
      for (const entry of entries) {
        if (entry.nextAttemptAt !== undefined && entry.nextAttemptAt > currentTime) {
          deferredEntries.push(entry);
        } else if (batch.length < batchSize) {
          batch.push(entry);
        } else {
          deferredEntries.push(entry);
        }
      }
      if (batch.length === 0) {
        const result = {
          sent: 0,
          skipped: entries.length > 0 ? 1 : 0,
          failed: 0,
          remaining: entries.length
        };
        await persistEntries();
        return result;
      }

      const retryEntries: AnalyticsQueueEntry[] = [];
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (const entry of batch) {
        if (!hasConsentForAnalyticsEvent(config, entry.eventName)) {
          skipped += 1;
          continue;
        }
        const result = await send(entry.eventName, entry.params, config);
        if (result.status === 'sent') {
          sent += 1;
        } else if (result.status === 'failed') {
          failed += 1;
          retryEntries.push({
            ...entry,
            attemptCount: entry.attemptCount + 1,
            nextAttemptAt:
              currentTime +
              resolveAnalyticsQueueRetryBackoffMs(
                entry.attemptCount + 1,
                reportingInterval,
                options.retryBackoffMs
              )
          });
        } else {
          skipped += 1;
        }
      }

      entries = boundPersistedAnalyticsQueueEntries(
        [...retryEntries, ...deferredEntries],
        currentTime,
        maxEntries,
        maxAgeMs
      ) as AnalyticsQueueEntry[];
      lastFlushAt = currentTime;
      await persistEntries();
      return { sent, skipped, failed, remaining: entries.length };
    },
    async clear() {
      entries = [];
      lastFlushAt = 0;
      hydrated = true;
      hydrationPromise = null;
      if (storage) {
        await storage.clear();
      }
    },
    size() {
      return entries.length;
    },
    snapshot() {
      return entries.map(clonePersistedAnalyticsQueueEntry);
    }
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
