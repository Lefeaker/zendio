import { isAllowedAnalyticsEventName } from './analyticsSanitizers';
import type { AnalyticsEventName } from './eventCatalog';
import { sendAnalyticsTransportEvent, type AnalyticsTransportResult } from './analyticsTransport';
import type { AnalyticsConfig } from '../errors/analytics/analyticsConfig';

export interface AnalyticsQueueEntry<EventName extends AnalyticsEventName = AnalyticsEventName> {
  eventName: EventName;
  params?: Record<string, unknown>;
  enqueuedAt: number;
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
    params: Record<string, unknown> | undefined,
    config: AnalyticsConfig
  ) => Promise<AnalyticsTransportResult>;
  now?: () => number;
}

export interface AnalyticsEventQueue {
  enqueue: <EventName extends AnalyticsEventName>(
    eventName: EventName,
    params?: Record<string, unknown>
  ) => boolean;
  flush: (options?: { force?: boolean }) => Promise<AnalyticsQueueFlushResult>;
  clear: () => void;
  size: () => number;
  snapshot: () => readonly AnalyticsQueueEntry[];
}

export function createAnalyticsEventQueue(
  options: AnalyticsEventQueueOptions
): AnalyticsEventQueue {
  const now = options.now ?? Date.now;
  const send = options.send ?? sendAnalyticsTransportEvent;
  let entries: AnalyticsQueueEntry[] = [];
  let lastFlushAt = 0;

  return {
    enqueue(eventName, params) {
      if (!isAllowedAnalyticsEventName(eventName)) {
        return false;
      }
      entries.push({ eventName, params, enqueuedAt: now() });
      return true;
    },

    async flush(flushOptions = {}) {
      const config = options.getConfig();
      const currentTime = now();
      const reportingInterval = normalizePositiveInteger(config.reportingInterval, 30000);

      if (!flushOptions.force && lastFlushAt > 0 && currentTime - lastFlushAt < reportingInterval) {
        return {
          sent: 0,
          skipped: entries.length > 0 ? 1 : 0,
          failed: 0,
          remaining: entries.length
        };
      }

      const batchSize = normalizePositiveInteger(config.batchSize, 1);
      const batch = entries.slice(0, batchSize);
      const rest = entries.slice(batch.length);
      const retryEntries: AnalyticsQueueEntry[] = [];
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const entry of batch) {
        if (!hasConsentForEvent(config, entry.eventName)) {
          skipped += 1;
          continue;
        }

        const result = await send(entry.eventName, entry.params, config);
        if (result.status === 'sent') {
          sent += 1;
        } else if (result.status === 'failed') {
          failed += 1;
          retryEntries.push(entry);
        } else {
          skipped += 1;
        }
      }

      entries = [...retryEntries, ...rest];
      lastFlushAt = currentTime;
      return { sent, skipped, failed, remaining: entries.length };
    },

    clear() {
      entries = [];
    },

    size() {
      return entries.length;
    },

    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    }
  };
}

function hasConsentForEvent(config: AnalyticsConfig, eventName: AnalyticsEventName): boolean {
  if (!config.enabled) {
    return false;
  }
  if (eventName === 'extension_error') {
    return config.userConsent?.errorReporting === true;
  }
  return config.userConsent?.analytics === true;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
