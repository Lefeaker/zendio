import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';

type TransportFetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  clone: () => { text: () => Promise<string> };
};
type TransportFetch = (input: string, init?: RequestInit) => Promise<TransportFetchResponse>;

const baseConfig: AnalyticsConfig = {
  enabled: true,
  debugMode: false,
  measurementId: 'G-ABCD1234',
  transportMode: 'proxy',
  proxyEndpoint: 'https://analytics.example.test/ga4',
  clientId: 'client-1',
  sessionId: 'session-1',
  userConsent: {
    analytics: true,
    errorReporting: true,
    timestamp: 100,
    version: '1.0'
  },
  reportingInterval: 30000,
  maxErrorsPerSession: 50,
  batchSize: 10
};

const forbiddenSecretFieldPattern = new RegExp(
  [
    ['api', 'secret'].join('_'),
    ['GA', 'API', 'SECRET'].join('_'),
    ['AIIINOB', 'GA', 'API', 'SECRET'].join('_')
  ].join('|'),
  'i'
);

describe('analytics transport', () => {
  const fetchMock = vi.fn<TransportFetch>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds sanitized GA4 payloads without secret fields', async () => {
    const { buildAnalyticsTransportPayload } = await import('../../../src/shared/analytics');

    const payload = buildAnalyticsTransportPayload(
      'support_link_clicked',
      {
        target: 'ko-fi',
        url: 'https://ko-fi.example.test/private?user=1'
      },
      baseConfig,
      { extensionVersion: '2.0.0', now: () => 1234 }
    );

    expect(payload).toEqual({
      client_id: 'client-1',
      measurement_id: 'G-ABCD1234',
      events: [
        {
          name: 'support_link_clicked',
          params: {
            engagement_time_msec: 1,
            extension_version: '2.0.0',
            session_id: 'session-1',
            target: 'ko-fi'
          }
        }
      ],
      timestamp_micros: 1234000
    });
    expect(JSON.stringify(payload)).not.toMatch(forbiddenSecretFieldPattern);
  });

  it('sends proxy transport requests with public GA config only', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const result = await sendAnalyticsTransportEvent(
      'support_like_clicked',
      { variant: 'first' },
      baseConfig,
      { fetch: fetchMock, extensionVersion: '2.0.0', now: () => 42 }
    );

    expect(result).toEqual({ status: 'sent', transportMode: 'proxy', responseStatus: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/ga4',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestInit?.body)).toContain('"measurement_id":"G-ABCD1234"');
    expect(String(requestInit?.body)).not.toMatch(forbiddenSecretFieldPattern);
  });

  it('uses direct GA debug endpoint only in directDebug mode', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('{"validationMessages":[]}') })
    });

    const result = await sendAnalyticsTransportEvent(
      'support_dislike_clicked',
      {},
      { ...baseConfig, transportMode: 'directDebug', proxyEndpoint: undefined, debugMode: true },
      { fetch: fetchMock, now: () => 42 }
    );

    expect(result.status).toBe('sent');
    expect(result.transportMode).toBe('directDebug');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.google-analytics.com/debug/mp/collect?measurement_id=G-ABCD1234',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('skips disabled, invalid endpoint, and invalid measurement id states', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');

    await expect(
      sendAnalyticsTransportEvent(
        'support_dislike_clicked',
        {},
        { ...baseConfig, transportMode: 'disabled' },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'transport_disabled',
      transportMode: 'disabled'
    });

    await expect(
      sendAnalyticsTransportEvent(
        'support_dislike_clicked',
        {},
        { ...baseConfig, proxyEndpoint: 'not-a-url' },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'invalid_proxy_endpoint',
      transportMode: 'proxy'
    });

    await expect(
      sendAnalyticsTransportEvent(
        'support_dislike_clicked',
        {},
        { ...baseConfig, measurementId: 'G-XXXXXXXXXX' },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'invalid_measurement_id',
      transportMode: 'proxy'
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
