import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';

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
});
