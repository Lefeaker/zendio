/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors/types';

const getServiceMock = vi.hoisted(() => vi.fn());
const sanitizeErrorForAnalyticsMock = vi.hoisted(() => vi.fn((error: unknown) => error));
const sendAnalyticsTransportEventMock = vi.hoisted(() =>
  vi.fn(
    (
      _eventName: string,
      _params?: Record<string, unknown>,
      _config?: unknown,
      _options?: { extensionVersion?: string }
    ) => Promise.resolve({ status: 'sent', transportMode: 'proxy' as const, responseStatus: 200 })
  )
);
const manifest: chrome.runtime.Manifest = {
  manifest_version: 3,
  name: 'AiiinOB Test',
  version: '3.2.1'
};

vi.mock('../../../../../src/shared/di', () => ({ getService: getServiceMock }));
vi.mock('../../../../../src/shared/errors/analytics/dataSanitizer', () => ({
  sanitizeErrorForAnalytics: sanitizeErrorForAnalyticsMock
}));
vi.mock('../../../../../src/shared/analytics', () => ({
  sendAnalyticsTransportEvent: sendAnalyticsTransportEventMock
}));

describe('GoogleAnalyticsReporter', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getServiceMock.mockReturnValue({ runtime: { getManifest: () => manifest } });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Chrome/123.0 Safari/537.36'
    });
  });

  it('does nothing when disabled', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter({
      enabled: false,
      measurementId: 'G-123',
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4'
    });
    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now()
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAnalyticsTransportEventMock).not.toHaveBeenCalled();
  });

  it('routes sanitized extension_error payloads through the shared analytics transport', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter({
      enabled: true,
      measurementId: 'G-123',
      debugMode: true,
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4',
      clientId: 'client',
      sessionId: 'session'
    });

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now(),
      context: {
        extractor: 'reader',
        url: 'https://example.com/path?token=abc',
        vaultName: 'SecretVault',
        localFolderName: 'PrivateFolder',
        stack: [
          'Error: top line should stay bounded',
          ' at fn (https://example.com/file.js:12:8)',
          ' at saveFile (/Users/mac/SecretVault/PrivateFolder/file.md:34:9)',
          ' at redact (chrome-extension://abc/background.js:56:7)',
          ' at withToken (https://example.com/file.js?api_key=secret:78:9)',
          ' at ignored (https://example.com/ignored.js:90:1)'
        ].join('\n')
      }
    });

    expect(sanitizeErrorForAnalyticsMock).toHaveBeenCalled();
    expect(sendAnalyticsTransportEventMock).toHaveBeenCalledWith(
      'extension_error',
      expect.objectContaining({
        error_code: 'REST_NETWORK_TIMEOUT',
        error_domain: 'background',
        error_category: 'NETWORK',
        error_severity: 'critical',
        error_recoverable: true,
        browser_name: 'chrome',
        browser_version: '123',
        extractor: 'reader',
        domain: 'example.com',
        protocol: 'https:'
      }),
      expect.objectContaining({
        measurementId: 'G-123',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/ga4',
        clientId: 'client',
        sessionId: 'session'
      }),
      expect.objectContaining({
        extensionVersion: '3.2.1'
      })
    );
    const transportCall = sendAnalyticsTransportEventMock.mock.calls[0];
    expect(transportCall).toBeDefined();
    const params = (transportCall?.[1] ?? {}) as Record<string, unknown>;
    const stackTrace = String(params.stackTrace ?? '');
    expect(stackTrace.split('\n')).toHaveLength(5);
    expect(stackTrace).toContain('at fn:12');
    expect(stackTrace).toContain('at saveFile:34');
    expect(stackTrace).not.toContain('https://example.com/file.js');
    expect(stackTrace).not.toContain('/Users/mac/SecretVault');
    expect(stackTrace).not.toContain('api_key');
    expect(JSON.stringify(params)).not.toContain('SecretVault');
    expect(JSON.stringify(params)).not.toContain('PrivateFolder');
    expect(reporter.getConfig().measurementId).toBe('G-123');
    expect(reporter.isEnabled()).toBe(true);
    reporter.updateConfig({ enabled: false });
    expect(reporter.isEnabled()).toBe(false);
    reporter.renewSession();
  });

  it('swallows transport failures and falls back when manifest lookup fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getServiceMock.mockImplementation(() => {
      throw new Error('missing service');
    });
    sendAnalyticsTransportEventMock.mockResolvedValueOnce({
      status: 'failed',
      transportMode: 'proxy',
      responseStatus: 500
    });
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter({
      enabled: true,
      measurementId: 'G-123',
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4'
    });

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.INFO,
      recoverable: false,
      message: 'bad',
      timestamp: Date.now()
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
