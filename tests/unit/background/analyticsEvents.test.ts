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
  getAnalyticsConfigManager: () => ({
    getConfig: getConfigMock,
    renewSession: renewSessionMock
  })
}));

type AnalyticsConfigSnapshot = {
  userConsent?: { analytics?: boolean; errorReporting?: boolean };
  measurementId?: string;
  transportMode?: 'disabled' | 'proxy' | 'directDebug';
  proxyEndpoint?: string;
  clientId?: string;
  sessionId?: string;
  debugMode?: boolean;
};

function createAnalyticsConfig(
  overrides: Partial<AnalyticsConfigSnapshot> = {}
): AnalyticsConfigSnapshot {
  return {
    userConsent: { analytics: true, errorReporting: false },
    measurementId: 'G-1234',
    transportMode: 'proxy',
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    debugMode: false,
    ...overrides
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

  it('uses the shared direct debug transport and logs failed renewals gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const directDebugConfig = createAnalyticsConfig({
      transportMode: 'directDebug',
      proxyEndpoint: undefined,
      sessionId: undefined,
      debugMode: true
    });
    getConfigMock.mockReturnValue(directDebugConfig);
    refreshAnalyticsConfigMock.mockResolvedValue(directDebugConfig);
    renewSessionMock.mockRejectedValueOnce(new Error('renew failed'));
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('{"ok":true}') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('support_like_clicked', { variant: 'first' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('debug/mp/collect?measurement_id=G-1234'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[analytics-events] Failed to renew analytics session id:',
      expect.any(Error)
    );
    expect(consoleInfoSpy).toHaveBeenCalled();
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
    await trackUsageEvent('support_link_clicked', {
      target: 'ko-fi',
      url: 'https://ko-fi.com/xiannian?user=reader'
    } as never);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(requestInit?.body)) as {
      events: Array<{ params: Record<string, unknown> }>;
    };
    expect(body.events[0]?.params).toMatchObject({ target: 'ko-fi' });
    expect(body.events[0]?.params).not.toHaveProperty('url');

    await resetRuntime();
  });
});
