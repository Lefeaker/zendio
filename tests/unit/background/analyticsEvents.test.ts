import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializeAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const renewSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  initializeAnalyticsConfig: initializeAnalyticsConfigMock,
  getAnalyticsConfigManager: () => ({
    getConfig: getConfigMock,
    renewSession: renewSessionMock
  })
}));

describe('analyticsEvents', () => {
  const fetchMock = vi.fn();
  const manifest: chrome.runtime.Manifest = {
    manifest_version: 3,
    name: 'AiiinOB Test',
    version: '9.9.9'
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => manifest
      }
    } as { runtime: Pick<typeof chrome.runtime, 'getManifest'> });
  });

  it('skips tracking without consent or measurement id', async () => {
    getConfigMock.mockReturnValue({ userConsent: { analytics: false } });
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('ignored');
    expect(fetchMock).not.toHaveBeenCalled();

    getConfigMock.mockReturnValue({ userConsent: { analytics: true }, measurementId: 'XXXX1234', clientId: 'cid' });
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
    fetchMock.mockResolvedValue({ ok: true, clone: () => ({ text: () => Promise.resolve('{"ok":true}') }) });

    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('open_options', { source: 'toolbar' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('debug/mp/collect?measurement_id=G-1234'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith('[analytics-events] Failed to renew analytics session id:', expect.any(Error));
    expect(consoleInfoSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('warns when initialization or request handling fails and can retry afterwards', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    initializeAnalyticsConfigMock.mockRejectedValueOnce(new Error('init failed'));
    getConfigMock.mockReturnValueOnce({ userConsent: { analytics: false } });
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');
    await trackUsageEvent('first');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[analytics-events] Failed to initialize analytics config:', expect.any(Error));

    initializeAnalyticsConfigMock.mockResolvedValueOnce(undefined);
    getConfigMock.mockReturnValue({ userConsent: { analytics: true }, measurementId: 'G-1234', clientId: 'client-1', sessionId: 'session-1', debugMode: false });
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Fail', clone: () => ({ text: () => Promise.resolve('broken') }) });
    await trackUsageEvent('second');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[analytics-events] GA4 request failed: 500 Fail');
    consoleWarnSpy.mockRestore();
  });
});
