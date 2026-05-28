import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeService } from '../../../src/platform/interfaces/runtime';

const initializeAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
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
  getAnalyticsConfigManager: () => ({
    getConfig: getConfigMock,
    renewSession: renewSessionMock
  })
}));

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
  });

  it('skips tracking without consent or measurement id', async () => {
    getConfigMock.mockReturnValue({ userConsent: { analytics: false } });
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('ignored');
    expect(fetchMock).not.toHaveBeenCalled();

    getConfigMock.mockReturnValue({
      userConsent: { analytics: true },
      measurementId: 'XXXX1234',
      clientId: 'cid'
    });
    await trackUsageEvent('ignored-again');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends debug analytics payloads and logs failed renewals gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue({
      userConsent: { analytics: true },
      measurementId: 'G-1234',
      clientId: 'client-1',
      sessionId: undefined,
      debugMode: true
    });
    renewSessionMock.mockRejectedValueOnce(new Error('renew failed'));
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('{"ok":true}') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('open_options', { source: 'toolbar' });

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
    getConfigMock.mockReturnValue({
      userConsent: { analytics: true },
      measurementId: 'G-1234',
      clientId: 'client-1',
      sessionId: 'session-1',
      debugMode: false
    });
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: () => Promise.resolve('') })
    });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('open_options');

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestInit?.body)).toContain('"extension_version":"2.3.4"');
    expect(globalGetManifestMock).not.toHaveBeenCalled();

    consoleInfoSpy.mockRestore();
    await resetRuntime();
  });

  it('warns when initialization or request handling fails and can retry afterwards', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    initializeAnalyticsConfigMock.mockRejectedValueOnce(new Error('init failed'));
    getConfigMock.mockReturnValueOnce({ userConsent: { analytics: false } });
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('first');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[analytics-events] Failed to initialize analytics config:',
      expect.any(Error)
    );

    initializeAnalyticsConfigMock.mockResolvedValueOnce(undefined);
    getConfigMock.mockReturnValue({
      userConsent: { analytics: true },
      measurementId: 'G-1234',
      clientId: 'client-1',
      sessionId: 'session-1',
      debugMode: false
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Fail',
      clone: () => ({ text: () => Promise.resolve('broken') })
    });
    await trackUsageEvent('second');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[analytics-events] GA4 request failed: 500 Fail');
    consoleWarnSpy.mockRestore();
  });
});
