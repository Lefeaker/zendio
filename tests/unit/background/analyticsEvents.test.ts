import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeService } from '../../../src/platform/interfaces/runtime';

const initializeAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const refreshAnalyticsConfigMock = vi.hoisted(() => vi.fn());
const renewSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getConfigMock = vi.hoisted(() => vi.fn());

type AnalyticsFetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  clone: () => { text: () => Promise<string> };
};
type AnalyticsFetch = (input: string, init?: RequestInit) => Promise<AnalyticsFetchResponse>;

vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  initializeAnalyticsConfig: initializeAnalyticsConfigMock,
  refreshAnalyticsConfig: refreshAnalyticsConfigMock,
  GA4_CONFIG: {
    STORAGE_KEYS: {
      ANALYTICS_QUEUE: 'analytics_event_queue'
    }
  },
  getAnalyticsConfigManager: () => ({
    getConfig: getConfigMock,
    renewSession: renewSessionMock
  })
}));

type AnalyticsConfigSnapshot = {
  enabled?: boolean;
  userConsent?: { analytics?: boolean; errorReporting?: boolean };
  measurementId?: string;
  transportMode?: 'disabled' | 'proxy' | 'directDebug';
  proxyEndpoint?: string;
  clientId?: string;
  sessionId?: string;
  debugMode?: boolean;
  reportingInterval?: number;
  batchSize?: number;
};

type AnalyticsDebugLogPayload = {
  eventName: string;
  transportMode: string;
  responseStatus: number;
  validation: {
    hasMessages: boolean;
    messageCount: number;
  };
};

type AnalyticsRequestBody = {
  events?: Array<{
    params?: Record<string, string>;
  }>;
};

function isAnalyticsDebugLogPayload(
  value: object | null | undefined
): value is AnalyticsDebugLogPayload {
  return Boolean(
    value &&
    'eventName' in value &&
    'transportMode' in value &&
    'responseStatus' in value &&
    'validation' in value
  );
}

function getFirstAnalyticsRequestParams(value: unknown): Record<string, string> {
  const body = value as AnalyticsRequestBody;
  return body.events?.[0]?.params ?? {};
}

function createAnalyticsConfig(
  overrides: Partial<AnalyticsConfigSnapshot> = {}
): AnalyticsConfigSnapshot {
  return {
    enabled: true,
    userConsent: { analytics: true, errorReporting: false },
    measurementId: 'G-1234',
    transportMode: 'proxy',
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    debugMode: false,
    reportingInterval: 30000,
    batchSize: 10,
    ...overrides
  };
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createQueueStorageService() {
  const values = new Map<string, unknown>();

  return {
    local: {
      get: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
      set: vi.fn(async <T>(key: string, value: T) => {
        values.set(key, clone(value));
      }),
      remove: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        keys.forEach((entry) => values.delete(entry));
      })
    },
    snapshot: (key: string) => clone(values.get(key))
  };
}

function createRuntimeStub(version = '9.9.9'): RuntimeService {
  return {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    getManifest: vi.fn(() => ({
      version
    })),
    openOptionsPage: vi.fn(() => Promise.resolve(undefined)),
    onInstalled: vi.fn(() => () => undefined),
    onStartup: vi.fn(() => () => undefined)
  };
}

async function configureRuntime(version?: string): Promise<void> {
  const { configurePlatformServices } = await import('../../../src/platform');
  configurePlatformServices({
    runtime: createRuntimeStub(version)
  });
}

async function resetRuntime(): Promise<void> {
  const { resetPlatformServices } = await import('../../../src/platform');
  resetPlatformServices();
}

describe('analyticsEvents', () => {
  const fetchMock = vi.fn<AnalyticsFetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
    const initialConfig = createAnalyticsConfig();
    getConfigMock.mockReturnValue(initialConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(initialConfig);
  });

  it('skips tracking without consent or measurement id', async () => {
    const revokedConsentConfig = createAnalyticsConfig({
      userConsent: { analytics: false, errorReporting: false }
    });
    getConfigMock.mockReturnValue(revokedConsentConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(revokedConsentConfig);
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_dislike_clicked');
    expect(fetchMock).not.toHaveBeenCalled();

    const invalidMeasurementConfig = createAnalyticsConfig({
      measurementId: 'G-XXXXXXXXXX',
      clientId: 'cid'
    });
    getConfigMock.mockReturnValue(invalidMeasurementConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(invalidMeasurementConfig);
    await trackUsageEvent('support_dislike_clicked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the shared owner debug proxy transport and logs failed renewals gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const directDebugConfig = createAnalyticsConfig({
      transportMode: 'directDebug',
      proxyEndpoint: 'https://analytics.example.test/ga4-debug',
      sessionId: undefined,
      debugMode: true
    });
    getConfigMock.mockReturnValue(directDebugConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(directDebugConfig);
    renewSessionMock.mockRejectedValueOnce(new Error('renew failed'));
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({
        text: () =>
          Promise.resolve(
            JSON.stringify({
              validationMessages: [
                {
                  description: 'session id should stay private',
                  fieldPath: 'events[0].params.session_id'
                }
              ],
              params: {
                session_id: 'debug-session-raw',
                client_id: 'debug-client-raw'
              },
              measurement_id: 'G-LEAKED',
              url: 'https://www.google-analytics.com/debug/mp/collect',
              token: 'secret-token'
            })
          )
      })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_like_clicked', { variant: 'first' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/ga4-debug',
      expect.objectContaining({ method: 'POST' })
    );
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestInit?.body)).toContain('"validation_behavior":"ENFORCE_RECOMMENDATIONS"');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[analytics-events] Failed to renew analytics session id:',
      expect.any(Error)
    );
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[analytics-events] Event sent (debug):',
      expect.objectContaining({
        eventName: 'support_like_clicked',
        transportMode: 'directDebug',
        responseStatus: 200,
        validation: {
          hasMessages: true,
          messageCount: 1
        }
      })
    );
    const debugLogPayload = consoleInfoSpy.mock.calls[0]?.[1] as unknown;
    expect(debugLogPayload).toBeDefined();
    const payloadObject =
      typeof debugLogPayload === 'object' && debugLogPayload !== null ? debugLogPayload : null;
    expect(isAnalyticsDebugLogPayload(payloadObject)).toBe(true);
    if (!isAnalyticsDebugLogPayload(payloadObject)) {
      throw new Error('Expected analytics debug log payload');
    }
    expect(Object.keys(payloadObject).sort()).toEqual([
      'eventName',
      'responseStatus',
      'transportMode',
      'validation'
    ]);
    const serializedDebugLog = JSON.stringify(payloadObject);
    expect(serializedDebugLog).not.toContain('params');
    expect(serializedDebugLog).not.toContain('session_id');
    expect(serializedDebugLog).not.toContain('client_id');
    expect(serializedDebugLog).not.toContain('measurement_id');
    expect(serializedDebugLog).not.toContain('google-analytics.com');
    expect(serializedDebugLog).not.toContain('token');
    expect(serializedDebugLog).not.toContain('secret');
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('uses the configured runtime manifest version without reading global chrome', async () => {
    await configureRuntime('2.3.4');
    const globalGetManifestMock = vi.fn(() => {
      throw new Error('global chrome runtime should not provide analytics version');
    });
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: globalGetManifestMock,
        lastError: null
      }
    });
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const proxyConfig = createAnalyticsConfig({
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/collect'
    });
    getConfigMock.mockReturnValue(proxyConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(proxyConfig);
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_dislike_clicked');

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://analytics.example.test/collect');
    expect(String(requestInit?.body)).toContain('"extension_version":"2.3.4"');
    expect(globalGetManifestMock).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();

    consoleInfoSpy.mockRestore();
    await resetRuntime();
  });

  it('refreshes stored analytics config before future sends so revoked consent is observed', async () => {
    let cachedConfig = createAnalyticsConfig();
    let storedConfig = createAnalyticsConfig();
    getConfigMock.mockImplementation(() => ({ ...cachedConfig }));
    refreshAnalyticsConfigMock.mockImplementation(() => {
      cachedConfig = { ...storedConfig };
      return Promise.resolve({ ...cachedConfig });
    });
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_dislike_clicked');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    storedConfig = createAnalyticsConfig({
      userConsent: { analytics: false, errorReporting: false }
    });
    await trackUsageEvent('support_dislike_clicked');

    expect(refreshAnalyticsConfigMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends usage events through the configured queue interval and batch size', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(100000);
      const queuedConfig = createAnalyticsConfig({
        reportingInterval: 60000,
        batchSize: 1
      });
      getConfigMock.mockReturnValue(queuedConfig);
      refreshAnalyticsConfigMock.mockResolvedValue(queuedConfig);
      fetchMock.mockResolvedValue({
        ok: true,
        clone: () => ({ text: () => Promise.resolve('') })
      });

      const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
      await trackUsageEvent('support_like_clicked', { variant: 'first' });
      await trackUsageEvent('support_dislike_clicked');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(161000);
      await trackUsageEvent('support_review_link_clicked', { variant: 'returning' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, requestInit] = fetchMock.mock.calls[1] ?? [];
      expect(String(requestInit?.body)).toContain('"name":"support_dislike_clicked"');
      expect(String(requestInit?.body)).not.toContain('"name":"support_review_link_clicked"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears queued usage events when analytics consent is revoked before a later restore', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(200000);
      let storedConfig = createAnalyticsConfig({
        reportingInterval: 60000,
        batchSize: 1
      });
      let cachedConfig = storedConfig;
      getConfigMock.mockImplementation(() => cachedConfig);
      refreshAnalyticsConfigMock.mockImplementation(() => {
        cachedConfig = storedConfig;
        return Promise.resolve(cachedConfig);
      });
      fetchMock.mockResolvedValue({
        ok: true,
        clone: () => ({ text: () => Promise.resolve('') })
      });

      const { clearQueuedUsageAnalyticsEventsIfConsentRevoked, trackUsageEvent } =
        await import('../../../src/background/services/analyticsEvents');
      await trackUsageEvent('support_like_clicked', { variant: 'first' });
      await trackUsageEvent('support_dislike_clicked');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const revokedConfig = createAnalyticsConfig({
        userConsent: { analytics: false, errorReporting: true },
        reportingInterval: 60000,
        batchSize: 1
      });
      storedConfig = revokedConfig;
      clearQueuedUsageAnalyticsEventsIfConsentRevoked(revokedConfig);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      storedConfig = createAnalyticsConfig({
        reportingInterval: 60000,
        batchSize: 1
      });
      vi.setSystemTime(201000);
      await trackUsageEvent('support_github_feedback_clicked');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, requestInit] = fetchMock.mock.calls[1] ?? [];
      expect(String(requestInit?.body)).toContain('"name":"support_github_feedback_clicked"');
      expect(String(requestInit?.body)).not.toContain('"name":"support_dislike_clicked"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rehydrates persisted failed usage events after module reload when queue storage is configured', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(400000);
      const queuedConfig = createAnalyticsConfig({
        reportingInterval: 30000,
        batchSize: 1
      });
      getConfigMock.mockReturnValue(queuedConfig);
      refreshAnalyticsConfigMock.mockResolvedValue(queuedConfig);
      const storage = createQueueStorageService();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'fail',
        clone: () => ({ text: () => Promise.resolve('broken') })
      });

      const firstModule = await import('../../../src/background/services/analyticsEvents');
      firstModule.configureUsageAnalyticsQueueStorage(storage as never);
      await firstModule.trackUsageEvent('support_link_clicked', {
        target: 'ko-fi'
      } as { target: 'ko-fi' } & Record<string, unknown>);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(storage.snapshot('analytics_event_queue')).toEqual([
        expect.objectContaining({
          eventName: 'support_link_clicked',
          params: { target: 'ko-fi' },
          attemptCount: 1,
          nextAttemptAt: 430000
        })
      ]);

      vi.resetModules();
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      getConfigMock.mockReturnValue(queuedConfig);
      refreshAnalyticsConfigMock.mockResolvedValue(queuedConfig);
      fetchMock.mockResolvedValue({
        ok: true,
        clone: () => ({ text: () => Promise.resolve('') })
      });

      const secondModule = await import('../../../src/background/services/analyticsEvents');
      secondModule.configureUsageAnalyticsQueueStorage(storage as never);
      vi.setSystemTime(430001);
      await secondModule.trackUsageEvent('support_github_feedback_clicked');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      expect(String(requestInit?.body)).toContain('"name":"support_link_clicked"');
      expect(String(requestInit?.body)).not.toContain('"name":"support_github_feedback_clicked"');
      expect(storage.snapshot('analytics_event_queue')).toEqual([
        expect.objectContaining({
          eventName: 'support_github_feedback_clicked',
          attemptCount: 0
        })
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears persisted usage queue storage when analytics consent is revoked before queue creation', async () => {
    const storage = createQueueStorageService();
    await storage.local.set('analytics_event_queue', [
      {
        id: 'persisted-1',
        eventName: 'support_dislike_clicked',
        enqueuedAt: 100000,
        attemptCount: 0
      }
    ]);

    const { clearQueuedUsageAnalyticsEventsIfConsentRevoked, configureUsageAnalyticsQueueStorage } =
      await import('../../../src/background/services/analyticsEvents');
    configureUsageAnalyticsQueueStorage(storage as never);

    await clearQueuedUsageAnalyticsEventsIfConsentRevoked({
      enabled: true,
      userConsent: { analytics: false }
    });

    expect(storage.snapshot('analytics_event_queue')).toBeUndefined();
  });

  it('warns when initialization or request handling fails and can retry afterwards', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    initializeAnalyticsConfigMock.mockRejectedValueOnce(new Error('init failed'));
    getConfigMock.mockReturnValueOnce(
      createAnalyticsConfig({
        userConsent: { analytics: false, errorReporting: false }
      })
    );
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_dislike_clicked');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[analytics-events] Failed to initialize analytics config:',
      expect.any(Error)
    );

    initializeAnalyticsConfigMock.mockResolvedValueOnce(undefined);
    const retryConfig = createAnalyticsConfig({
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4'
    });
    getConfigMock.mockReturnValue(retryConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(retryConfig);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Fail',
      clone: () => ({ text: () => Promise.resolve('broken') })
    });
    await trackUsageEvent('support_dislike_clicked');
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(
      2,
      '[analytics-events] Analytics transport failed: 500'
    );
    consoleWarnSpy.mockRestore();
  });

  it('drops params outside the event allowlist before sending to GA4', async () => {
    await configureRuntime('2.3.4');
    const proxyConfig = createAnalyticsConfig({
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4'
    });
    getConfigMock.mockReturnValue(proxyConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(proxyConfig);
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    const invalidParams = {
      target: 'ko-fi',
      url: 'https://ko-fi.com/xiannian?user=reader'
    } satisfies { target: 'ko-fi'; url: string };
    await trackUsageEvent('support_link_clicked', invalidParams);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const parsedBody: unknown = JSON.parse(String(requestInit?.body));
    const params = getFirstAnalyticsRequestParams(parsedBody);
    expect(params).toMatchObject({ target: 'ko-fi' });
    expect(params).not.toHaveProperty('url');

    await resetRuntime();
  });

  it('does not leak browser family context onto runtime usage events', async () => {
    await configureRuntime('2.3.4');
    vi.stubGlobal('chrome', { runtime: {} });
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51',
      userAgentData: {
        brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }]
      }
    });
    const proxyConfig = createAnalyticsConfig({
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4'
    });
    getConfigMock.mockReturnValue(proxyConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(proxyConfig);
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    try {
      const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
      await trackUsageEvent('support_link_clicked', { target: 'ko-fi' });

      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      const parsedBody: unknown = JSON.parse(String(requestInit?.body));
      const params = getFirstAnalyticsRequestParams(parsedBody);
      expect(params).toMatchObject({
        target: 'ko-fi',
        extension_version: '2.3.4',
        session_id: 'session-1'
      });
      expect(params).not.toHaveProperty('browser_family');
    } finally {
      vi.unstubAllGlobals();
      await resetRuntime();
    }
  });
});
