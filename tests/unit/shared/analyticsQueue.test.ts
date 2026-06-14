import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyticsQueueStorage,
  PersistedAnalyticsQueueEntry
} from '../../../src/shared/analytics';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';

type QueueEntrySnapshot = PersistedAnalyticsQueueEntry;

const consent = {
  analytics: true,
  errorReporting: true,
  timestamp: 100,
  version: '1.0'
};

function createConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    debugMode: false,
    measurementId: 'G-ABCD1234',
    transportMode: 'proxy',
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    userConsent: consent,
    reportingInterval: 30000,
    maxErrorsPerSession: 50,
    batchSize: 2,
    ...overrides
  };
}

function createQueueStorage(
  initialEntries: QueueEntrySnapshot[] = []
): AnalyticsQueueStorage & { snapshot: () => QueueEntrySnapshot[] } {
  let entries = initialEntries.map((entry) => ({ ...entry }));

  return {
    load: vi.fn(async () => entries.map((entry) => ({ ...entry }))),
    save: vi.fn(async (nextEntries: readonly QueueEntrySnapshot[]) => {
      entries = nextEntries.map((entry) => ({ ...entry }));
    }),
    clear: vi.fn(async () => {
      entries = [];
    }),
    snapshot: () => entries.map((entry) => ({ ...entry }))
  };
}

describe('analytics queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes no more than batchSize events and preserves the remaining queue', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () => createConfig(),
      send: sender,
      now: () => 100000
    });

    queue.enqueue('support_dislike_clicked', {});
    queue.enqueue('support_like_clicked', { variant: 'first' });
    queue.enqueue('support_review_link_clicked', { variant: 'returning' });

    const result = await queue.flush({ force: true });

    expect(result).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 1 });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(queue.size()).toBe(1);
  });

  it('honors reportingInterval unless a forced flush is requested', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    let now = 100000;
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () => createConfig({ reportingInterval: 60000 }),
      send: sender,
      now: () => now
    });

    queue.enqueue('support_dislike_clicked', {});
    await queue.flush({ force: true });
    queue.enqueue('support_like_clicked', { variant: 'first' });
    now += 1000;

    expect(await queue.flush()).toEqual({ sent: 0, skipped: 1, failed: 0, remaining: 1 });
    expect(sender).toHaveBeenCalledTimes(1);

    now += 60000;
    expect(await queue.flush()).toEqual({ sent: 1, skipped: 0, failed: 0, remaining: 0 });
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it('drops queued usage events immediately after analytics consent is revoked', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const config = createConfig();
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () => config,
      send: sender,
      now: () => 100000
    });

    queue.enqueue('support_like_clicked', { variant: 'first' });
    config.userConsent = { ...consent, analytics: false };

    const result = await queue.flush({ force: true });

    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0, remaining: 0 });
    expect(sender).not.toHaveBeenCalled();
    expect(queue.size()).toBe(0);
  });

  it('skips queued usage events when only error-reporting consent remains', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () =>
        createConfig({ userConsent: { ...consent, analytics: false, errorReporting: true } }),
      send: sender,
      now: () => 100000
    });

    queue.enqueue('support_like_clicked', { variant: 'first' });

    expect(await queue.flush({ force: true })).toEqual({
      sent: 0,
      skipped: 1,
      failed: 0,
      remaining: 0
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it('allows error events with errorReporting consent but without usage analytics consent', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () =>
        createConfig({ userConsent: { ...consent, analytics: false, errorReporting: true } }),
      send: sender,
      now: () => 100000
    });

    queue.enqueue('extension_error', {
      error_code: 'ERR_TEST',
      error_domain: 'runtime',
      error_severity: 'low',
      error_recoverable: true
    });

    expect(await queue.flush({ force: true })).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0,
      remaining: 0
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('skips queued error events when only analytics consent remains', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const queue = createAnalyticsEventQueue({
      getConfig: () =>
        createConfig({ userConsent: { ...consent, analytics: true, errorReporting: false } }),
      send: sender,
      now: () => 100000
    });

    queue.enqueue('extension_error', {
      error_code: 'ERR_TEST',
      error_domain: 'runtime',
      error_severity: 'low',
      error_recoverable: true
    });

    expect(await queue.flush({ force: true })).toEqual({
      sent: 0,
      skipped: 1,
      failed: 0,
      remaining: 0
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it('hydrates persisted entries before flushing newly enqueued events', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const sender = vi.fn(() =>
      Promise.resolve({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      })
    );
    const storage = createQueueStorage([
      {
        id: 'persisted-1',
        eventName: 'support_like_clicked',
        params: { variant: 'first' },
        enqueuedAt: 90000,
        attemptCount: 0
      }
    ]);
    const queue = createAnalyticsEventQueue({
      getConfig: () => createConfig({ batchSize: 1 }),
      send: sender,
      now: () => 100000,
      storage
    });

    queue.enqueue('support_dislike_clicked', {});

    expect(await queue.flush({ force: true })).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0,
      remaining: 1
    });
    expect(sender).toHaveBeenCalledWith(
      'support_like_clicked',
      { variant: 'first' },
      expect.any(Object)
    );
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        eventName: 'support_dislike_clicked',
        attemptCount: 0
      })
    ]);
    expect(storage.snapshot()).toEqual([
      expect.objectContaining({
        eventName: 'support_dislike_clicked',
        attemptCount: 0
      })
    ]);
  });

  it('persists sanitized retry metadata and waits for retry backoff before resending', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    let now = 100000;
    const sender = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'failed' as const,
        transportMode: 'proxy' as const,
        responseStatus: 500
      })
      .mockResolvedValueOnce({
        status: 'sent' as const,
        transportMode: 'proxy' as const,
        responseStatus: 200
      });
    const storage = createQueueStorage();
    const queue = createAnalyticsEventQueue({
      getConfig: () => createConfig({ reportingInterval: 30000, batchSize: 1 }),
      send: sender,
      now: () => now,
      storage
    });

    queue.enqueue('support_link_clicked', {
      target: 'ko-fi',
      url: 'https://ko-fi.com/should-not-persist'
    });

    expect(await queue.flush({ force: true })).toEqual({
      sent: 0,
      skipped: 0,
      failed: 1,
      remaining: 1
    });
    expect(storage.snapshot()).toEqual([
      expect.objectContaining({
        eventName: 'support_link_clicked',
        params: { target: 'ko-fi' },
        attemptCount: 1,
        nextAttemptAt: 130000
      })
    ]);

    now = 129999;
    expect(await queue.flush({ force: true })).toEqual({
      sent: 0,
      skipped: 1,
      failed: 0,
      remaining: 1
    });
    expect(sender).toHaveBeenCalledTimes(1);

    now = 130001;
    expect(await queue.flush({ force: true })).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0,
      remaining: 0
    });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(storage.snapshot()).toEqual([]);
  });

  it('keeps only the newest entries when maxEntries is exceeded', async () => {
    const { createAnalyticsEventQueue } = await import('../../../src/shared/analytics');
    const queue = createAnalyticsEventQueue({
      getConfig: () => createConfig(),
      now: () => 100000,
      maxEntries: 2
    });

    queue.enqueue('support_dislike_clicked', {});
    queue.enqueue('support_like_clicked', { variant: 'first' });
    queue.enqueue('support_github_feedback_clicked', {});

    expect(queue.snapshot().map((entry) => entry.eventName)).toEqual([
      'support_like_clicked',
      'support_github_feedback_clicked'
    ]);
  });
});
