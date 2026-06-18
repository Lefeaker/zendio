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
const forbiddenGoogleTransportPattern = /google-analytics\.com|debug\/mp\/collect|mp\/collect/i;

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

  it('resolves only bounded browser families from low-entropy browser signals', async () => {
    const { createAnalyticsBrowserContextParams } =
      await import('../../../src/shared/analytics/analyticsBrowserFamily');

    expect(
      createAnalyticsBrowserContextParams({
        chrome: { runtime: {} },
        navigator: {
          userAgentData: {
            brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }, { brand: 'Not A;Brand' }]
          },
          userAgent: 'Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36'
        }
      })
    ).toEqual({ browser_family: 'chrome' });

    expect(
      createAnalyticsBrowserContextParams({
        chrome: { runtime: {} },
        navigator: {
          userAgentData: {
            brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }, { brand: 'Not A;Brand' }]
          },
          userAgent: 'Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51'
        }
      })
    ).toEqual({ browser_family: 'edge' });

    expect(
      createAnalyticsBrowserContextParams({
        browser: { runtime: {} },
        navigator: {
          userAgent: 'Mozilla/5.0 Firefox/126.0'
        }
      })
    ).toEqual({ browser_family: 'firefox' });

    expect(
      createAnalyticsBrowserContextParams({
        navigator: {
          userAgent: 'Mozilla/5.0 Version/17.5 Safari/605.1.15'
        },
        safari: {}
      })
    ).toEqual({ browser_family: 'safari' });

    expect(
      createAnalyticsBrowserContextParams({
        chrome: { runtime: {} },
        navigator: {
          userAgentData: {
            brands: [{ brand: 'Chromium' }, { brand: 'Not A;Brand' }]
          },
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chromium/125.0.0.0 Safari/537.36'
        }
      })
    ).toEqual({ browser_family: 'other' });

    expect(
      createAnalyticsBrowserContextParams({
        chrome: { runtime: {} },
        navigator: {
          userAgent: 125
        }
      })
    ).toEqual({ browser_family: 'unknown' });

    expect(createAnalyticsBrowserContextParams({})).toEqual({ browser_family: 'unknown' });
  });

  it('never exposes raw UA strings or versions through browser family context', async () => {
    const { createAnalyticsBrowserContextParams } =
      await import('../../../src/shared/analytics/analyticsBrowserFamily');

    const context = createAnalyticsBrowserContextParams({
      chrome: { runtime: {} },
      navigator: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }]
        }
      }
    });

    expect(context).toEqual({ browser_family: 'edge' });
    expect(Object.keys(context)).toEqual(['browser_family']);
    const serializedContext = JSON.stringify(context);
    expect(serializedContext).not.toContain('Mozilla/5.0');
    expect(serializedContext).not.toContain('125.0.2535.51');
  });

  it('attaches browser family only to events whose schema allows it', async () => {
    const originalChrome = globalThis.chrome;
    const originalNavigator = globalThis.navigator;

    vi.stubGlobal('chrome', { runtime: {} });
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51',
      userAgentData: {
        brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }]
      }
    });

    try {
      const { buildAnalyticsTransportPayload } = await import('../../../src/shared/analytics');

      const activationPayload = buildAnalyticsTransportPayload(
        'extension_installed',
        {
          source: 'install',
          browser_family: 'Edg/125.0.2535.51',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51',
          browser_version: '125.0.2535.51'
        },
        baseConfig,
        { now: () => 99 }
      );

      expect(activationPayload?.events[0]?.params).toEqual({
        engagement_time_msec: 1,
        session_id: 'session-1',
        source: 'install',
        browser_family: 'edge'
      });
      const serializedActivationPayload = JSON.stringify(activationPayload);
      expect(serializedActivationPayload).not.toContain('Edg/125.0.2535.51');
      expect(serializedActivationPayload).not.toContain('Mozilla/5.0');
      expect(serializedActivationPayload).not.toContain('125.0.2535.51');

      const usagePayload = buildAnalyticsTransportPayload(
        'support_link_clicked',
        { target: 'ko-fi' },
        baseConfig,
        { now: () => 99 }
      );

      expect(usagePayload?.events[0]?.params).toEqual({
        engagement_time_msec: 1,
        session_id: 'session-1',
        target: 'ko-fi'
      });
      expect(usagePayload?.events[0]?.params).not.toHaveProperty('browser_family');
    } finally {
      vi.unstubAllGlobals();
      if (originalChrome !== undefined) {
        vi.stubGlobal('chrome', originalChrome);
      }
      if (originalNavigator !== undefined) {
        vi.stubGlobal('navigator', originalNavigator);
      }
    }
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

  it('uses the owner debug proxy endpoint only in directDebug mode', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('{"validationMessages":[]}') })
    });

    const result = await sendAnalyticsTransportEvent(
      'support_dislike_clicked',
      {},
      {
        ...baseConfig,
        transportMode: 'directDebug',
        proxyEndpoint: 'https://analytics.example.test/ga4-debug',
        debugMode: true
      },
      { fetch: fetchMock, now: () => 42 }
    );

    expect(result.status).toBe('sent');
    expect(result.transportMode).toBe('directDebug');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/ga4-debug',
      expect.objectContaining({ method: 'POST' })
    );
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).not.toContain('google-analytics.com');
    expect(String(requestInit?.body)).toContain('"measurement_id":"G-ABCD1234"');
    expect(String(requestInit?.body)).toContain('"validation_behavior":"ENFORCE_RECOMMENDATIONS"');
    expect(String(requestInit?.body)).not.toMatch(forbiddenSecretFieldPattern);
  });

  it('adds only validation_behavior when directDebug goes through the debug proxy', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    await sendAnalyticsTransportEvent('support_like_clicked', { variant: 'first' }, baseConfig, {
      fetch: fetchMock,
      extensionVersion: '2.0.0',
      now: () => 42
    });

    await sendAnalyticsTransportEvent(
      'support_like_clicked',
      { variant: 'first' },
      {
        ...baseConfig,
        transportMode: 'directDebug',
        proxyEndpoint: 'https://analytics.example.test/ga4-debug'
      },
      { fetch: fetchMock, extensionVersion: '2.0.0', now: () => 42 }
    );

    const [proxyUrl, proxyInit] = fetchMock.mock.calls[0] ?? [];
    const [debugUrl, debugInit] = fetchMock.mock.calls[1] ?? [];
    const proxyPayload = JSON.parse(String(proxyInit?.body));
    const debugPayload = JSON.parse(String(debugInit?.body));

    expect(String(proxyUrl)).toBe('https://analytics.example.test/ga4');
    expect(String(debugUrl)).toBe('https://analytics.example.test/ga4-debug');
    expect(String(proxyUrl)).not.toMatch(forbiddenGoogleTransportPattern);
    expect(String(debugUrl)).not.toMatch(forbiddenGoogleTransportPattern);
    expect(JSON.stringify(proxyPayload)).not.toMatch(forbiddenGoogleTransportPattern);
    expect(JSON.stringify(debugPayload)).not.toMatch(forbiddenGoogleTransportPattern);
    expect(debugPayload).toEqual({
      ...proxyPayload,
      validation_behavior: 'ENFORCE_RECOMMENDATIONS'
    });
  });

  it('skips disabled, invalid endpoint, and invalid measurement id states', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');

    await expect(
      sendAnalyticsTransportEvent(
        'support_dislike_clicked',
        {},
        { ...baseConfig, enabled: false },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'config_disabled',
      transportMode: 'proxy'
    });

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
        { ...baseConfig, transportMode: 'directDebug', proxyEndpoint: undefined },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'invalid_proxy_endpoint',
      transportMode: 'directDebug'
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

  it('rejects Google Measurement Protocol endpoints as proxy endpoints without calling fetch', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    const cases = [
      {
        transportMode: 'proxy' as const,
        proxyEndpoint: 'https://www.google-analytics.com/mp/collect'
      },
      {
        transportMode: 'directDebug' as const,
        proxyEndpoint: 'https://www.google-analytics.com/debug/mp/collect'
      },
      {
        transportMode: 'proxy' as const,
        proxyEndpoint: 'https://www.google-analytics.com./mp/collect'
      },
      {
        transportMode: 'directDebug' as const,
        proxyEndpoint: 'https://google-analytics.com./debug/mp/collect'
      },
      {
        transportMode: 'proxy' as const,
        proxyEndpoint: 'https://www.google-analytics.com/%6d%70/collect'
      },
      {
        transportMode: 'proxy' as const,
        proxyEndpoint: 'https://www.google-analytics.com/mp/%63ollect'
      },
      {
        transportMode: 'directDebug' as const,
        proxyEndpoint: 'https://www.google-analytics.com/debug/%6d%70/collect'
      }
    ];

    for (const { transportMode, proxyEndpoint } of cases) {
      await expect(
        sendAnalyticsTransportEvent(
          'support_dislike_clicked',
          {},
          { ...baseConfig, transportMode, proxyEndpoint },
          { fetch: fetchMock }
        )
      ).resolves.toEqual({
        status: 'skipped',
        reason: 'invalid_proxy_endpoint',
        transportMode
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows owner proxy endpoints even when their path resembles Measurement Protocol', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const result = await sendAnalyticsTransportEvent(
      'support_dislike_clicked',
      {},
      {
        ...baseConfig,
        proxyEndpoint: 'https://analytics.example.test/debug/mp/collect'
      },
      { fetch: fetchMock }
    );

    expect(result).toEqual({ status: 'sent', transportMode: 'proxy', responseStatus: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/debug/mp/collect',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('skips configs that do not have matching consent for the event class', async () => {
    const { sendAnalyticsTransportEvent } = await import('../../../src/shared/analytics');

    await expect(
      sendAnalyticsTransportEvent(
        'support_dislike_clicked',
        {},
        {
          ...baseConfig,
          userConsent: {
            analytics: false,
            errorReporting: false,
            timestamp: 100,
            version: '1.0'
          }
        },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'missing_user_consent',
      transportMode: 'proxy'
    });

    await expect(
      sendAnalyticsTransportEvent(
        'support_like_clicked',
        { variant: 'first' },
        {
          ...baseConfig,
          userConsent: {
            analytics: false,
            errorReporting: true,
            timestamp: 1,
            version: '1.0'
          }
        },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'missing_user_consent',
      transportMode: 'proxy'
    });

    await expect(
      sendAnalyticsTransportEvent(
        'extension_error',
        {
          error_code: 'REST_NETWORK_TIMEOUT',
          error_domain: 'background',
          error_severity: 'critical',
          error_recoverable: true
        },
        {
          ...baseConfig,
          userConsent: {
            analytics: true,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          }
        },
        { fetch: fetchMock }
      )
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'missing_user_consent',
      transportMode: 'proxy'
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
