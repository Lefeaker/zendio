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
const createGrantedErrorReportingConsent = () => ({
  analytics: true,
  errorReporting: true,
  timestamp: 100,
  version: '1.0'
});

vi.mock('../../../../../src/shared/di', () => ({ getService: getServiceMock }));
vi.mock('../../../../../src/shared/errors/analytics/dataSanitizer', () => ({
  sanitizeErrorForAnalytics: sanitizeErrorForAnalyticsMock
}));
vi.mock('../../../../../src/shared/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../src/shared/analytics')>();
  return {
    ...actual,
    sendAnalyticsTransportEvent: sendAnalyticsTransportEventMock
  };
});

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
      sessionId: 'session',
      userConsent: createGrantedErrorReportingConsent()
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
    reporter.updateConfig({
      enabled: false,
      userConsent: {
        analytics: false,
        errorReporting: false,
        timestamp: 101,
        version: '1.0'
      }
    });
    expect(reporter.isEnabled()).toBe(false);
    reporter.renewSession();
  });

  it('uses the live analytics config resolver while preserving reporter client and session ids', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const liveConfig = {
      enabled: true,
      debugMode: false,
      measurementId: 'G-LIVE456',
      transportMode: 'proxy' as const,
      proxyEndpoint: 'https://analytics.example.test/live',
      clientId: 'manager-client',
      sessionId: 'manager-session',
      userConsent: {
        analytics: true,
        errorReporting: true,
        timestamp: 200,
        version: '1.0'
      },
      reportingInterval: 45000,
      maxErrorsPerSession: 50,
      batchSize: 3
    };
    const reporter = new GoogleAnalyticsReporter({
      enabled: true,
      measurementId: 'G-123',
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4',
      clientId: 'reporter-client',
      sessionId: 'reporter-session',
      userConsent: {
        analytics: true,
        errorReporting: true,
        timestamp: 100,
        version: '1.0'
      },
      resolveAnalyticsConfig: () => liveConfig
    });

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now()
    });

    expect(sendAnalyticsTransportEventMock).toHaveBeenCalledWith(
      'extension_error',
      expect.any(Object),
      expect.objectContaining({
        measurementId: 'G-LIVE456',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/live',
        clientId: 'reporter-client',
        sessionId: 'reporter-session',
        userConsent: liveConfig.userConsent
      }),
      expect.objectContaining({
        extensionVersion: '3.2.1'
      })
    );
  });

  it('prefers live manager identity over minting fallback ids when reporter config omits them', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const liveConfig = {
      enabled: true,
      debugMode: false,
      measurementId: 'G-LIVE999',
      transportMode: 'proxy' as const,
      proxyEndpoint: 'https://analytics.example.test/live',
      clientId: 'manager-client',
      sessionId: 'manager-session',
      userConsent: {
        analytics: true,
        errorReporting: true,
        timestamp: 300,
        version: '1.0'
      },
      reportingInterval: 45000,
      maxErrorsPerSession: 50,
      batchSize: 3
    };
    const reporter = new GoogleAnalyticsReporter({
      enabled: true,
      measurementId: 'G-123',
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/ga4',
      userConsent: {
        analytics: true,
        errorReporting: true,
        timestamp: 100,
        version: '1.0'
      },
      resolveAnalyticsConfig: () => liveConfig
    });

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now()
    });

    expect(sendAnalyticsTransportEventMock).toHaveBeenCalledWith(
      'extension_error',
      expect.any(Object),
      expect.objectContaining({
        measurementId: 'G-LIVE999',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/live',
        clientId: 'manager-client',
        sessionId: 'manager-session',
        userConsent: liveConfig.userConsent
      }),
      expect.objectContaining({
        extensionVersion: '3.2.1'
      })
    );
  });

  it('queues repeated extension errors according to reporting interval and batch size', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(300000);
      const { GoogleAnalyticsReporter } =
        await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
      const reporter = new GoogleAnalyticsReporter({
        enabled: true,
        measurementId: 'G-123',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/ga4',
        reportingInterval: 60000,
        batchSize: 1,
        clientId: 'client',
        sessionId: 'session',
        userConsent: createGrantedErrorReportingConsent()
      });

      await reporter.report({
        code: 'REST_NETWORK_TIMEOUT',
        domain: 'background',
        severity: ErrorSeverity.CRITICAL,
        recoverable: true,
        message: 'first',
        timestamp: Date.now()
      });
      await reporter.report({
        code: 'REST_NETWORK_UNAVAILABLE',
        domain: 'background',
        severity: ErrorSeverity.WARNING,
        recoverable: true,
        message: 'second',
        timestamp: Date.now()
      });

      expect(sendAnalyticsTransportEventMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(361000);
      await reporter.report({
        code: 'REST_REQUEST_ABORTED',
        domain: 'background',
        severity: ErrorSeverity.INFO,
        recoverable: true,
        message: 'third',
        timestamp: Date.now()
      });

      expect(sendAnalyticsTransportEventMock).toHaveBeenCalledTimes(2);
      expect(sendAnalyticsTransportEventMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          error_code: 'REST_NETWORK_UNAVAILABLE'
        })
      );
      expect(sendAnalyticsTransportEventMock.mock.calls[1]?.[1]).not.toEqual(
        expect.objectContaining({
          error_code: 'REST_REQUEST_ABORTED'
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears queued errors when live error-reporting consent is revoked before the next flush', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(300000);
      const { GoogleAnalyticsReporter } =
        await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
      const liveConfig = {
        enabled: true,
        debugMode: false,
        measurementId: 'G-123',
        transportMode: 'proxy' as const,
        proxyEndpoint: 'https://analytics.example.test/ga4',
        userConsent: {
          analytics: true,
          errorReporting: true,
          timestamp: 100,
          version: '1.0'
        },
        reportingInterval: 60000,
        maxErrorsPerSession: 50,
        batchSize: 1
      };
      const reporter = new GoogleAnalyticsReporter({
        enabled: true,
        measurementId: 'G-123',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/ga4',
        clientId: 'client',
        sessionId: 'session',
        reportingInterval: 60000,
        batchSize: 1,
        userConsent: liveConfig.userConsent,
        resolveAnalyticsConfig: () => liveConfig
      });

      await reporter.report({
        code: 'REST_NETWORK_TIMEOUT',
        domain: 'background',
        severity: ErrorSeverity.CRITICAL,
        recoverable: true,
        message: 'first',
        timestamp: Date.now()
      });
      await reporter.report({
        code: 'REST_NETWORK_UNAVAILABLE',
        domain: 'background',
        severity: ErrorSeverity.WARNING,
        recoverable: true,
        message: 'second',
        timestamp: Date.now()
      });

      liveConfig.userConsent = {
        analytics: true,
        errorReporting: false,
        timestamp: 101,
        version: '1.0'
      };

      await reporter.report({
        code: 'REST_NETWORK_TIMEOUT',
        domain: 'background',
        severity: ErrorSeverity.INFO,
        recoverable: true,
        message: 'third',
        timestamp: Date.now()
      });

      expect(sendAnalyticsTransportEventMock).toHaveBeenCalledTimes(1);

      liveConfig.userConsent = {
        analytics: true,
        errorReporting: true,
        timestamp: 102,
        version: '1.0'
      };

      vi.setSystemTime(361000);
      await reporter.report({
        code: 'REST_REQUEST_ABORTED',
        domain: 'background',
        severity: ErrorSeverity.INFO,
        recoverable: true,
        message: 'fourth',
        timestamp: Date.now()
      });

      expect(sendAnalyticsTransportEventMock).toHaveBeenCalledTimes(2);
      expect(sendAnalyticsTransportEventMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          error_code: 'REST_REQUEST_ABORTED'
        })
      );
    } finally {
      vi.useRealTimers();
    }
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
      proxyEndpoint: 'https://analytics.example.test/ga4',
      userConsent: createGrantedErrorReportingConsent()
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
