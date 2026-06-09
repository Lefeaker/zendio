/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors/types';
import type { RuntimeExtensionErrorParams } from '@shared/types/analytics';

type ExtensionErrorParams = RuntimeExtensionErrorParams;

const getServiceMock = vi.hoisted(() => vi.fn());
const sanitizeErrorForAnalyticsMock = vi.hoisted(() => vi.fn(<Value>(error: Value) => error));
const manifest: chrome.runtime.Manifest = {
  manifest_version: 3,
  name: 'AiiinOB Test',
  version: '3.2.1'
};

vi.mock('../../../../../src/shared/di', () => ({ getService: getServiceMock }));
vi.mock('../../../../../src/shared/errors/analytics/dataSanitizer', () => ({
  sanitizeErrorForAnalytics: sanitizeErrorForAnalyticsMock
}));

describe('GoogleAnalyticsReporter', () => {
  const emitTelemetryEventMock = vi.fn<(params: ExtensionErrorParams) => Promise<void>>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    emitTelemetryEventMock.mockResolvedValue(undefined);
    getServiceMock.mockReturnValue({
      runtime: { getManifest: () => manifest }
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Chrome/123.0 Safari/537.36'
    });
  });

  it('does nothing when disabled', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter({ enabled: false, measurementId: 'G-123' });
    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'rest',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now()
    });
    expect(emitTelemetryEventMock).not.toHaveBeenCalled();
  });

  it('emits sanitized extension_error payloads without service-provided GA params', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter(
      {
        enabled: true,
        measurementId: 'G-123',
        debugMode: true,
        clientId: 'client',
        sessionId: 'session'
      },
      emitTelemetryEventMock
    );

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'rest',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now(),
      context: {
        extractor: 'reader',
        selectedText: 'do not leak this',
        markdown: '# do not leak this either',
        filePath: '/Users/mac/Secrets/private.md',
        url: 'https://example.com/path?token=abc',
        stack:
          'Error\n at fn (file:///Users/mac/private/file.js:12:8)\n at https://example.com/file.js:22:3'
      }
    });

    expect(sanitizeErrorForAnalyticsMock).toHaveBeenCalled();
    expect(emitTelemetryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error_code: 'REST_NETWORK_TIMEOUT',
        error_domain: 'rest',
        error_category: 'NETWORK',
        error_severity: 'critical',
        error_severity_level: 4,
        error_recoverable: true,
        error_description: 'Network request timeout',
        browser_name: 'chrome',
        browser_version: '123',
        extractor: 'reader',
        domain: 'example.com',
        protocol: 'https:',
        stackTrace: 'Error\nat fn:12\nat anonymous:22'
      })
    );
    const emittedParams = emitTelemetryEventMock.mock.calls[0]?.[0];
    if (emittedParams === undefined) {
      throw new Error('Expected GA reporter to emit extension_error params.');
    }
    const { isTrackTelemetryEventMessage } =
      await import('../../../../../src/shared/types/analytics');
    const { validateTelemetryEvent } =
      await import('../../../../../src/shared/analytics/telemetryValidation');
    expect(
      isTrackTelemetryEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'extension_error',
        params: emittedParams
      })
    ).toBe(true);
    expect(validateTelemetryEvent('extension_error', emittedParams)).toEqual(
      expect.objectContaining({ ok: true })
    );
    expect('extension_version' in emittedParams).toBe(false);
    expect('session_id' in emittedParams).toBe(false);
    expect('debug_mode' in emittedParams).toBe(false);
    expect('engagement_time_msec' in emittedParams).toBe(false);
    expect('selectedText' in emittedParams).toBe(false);
    expect('markdown' in emittedParams).toBe(false);
    expect('filePath' in emittedParams).toBe(false);
    expect(reporter.getConfig().measurementId).toBe('G-123');
    expect(reporter.isEnabled()).toBe(true);
    reporter.updateConfig({ enabled: false });
    expect(reporter.isEnabled()).toBe(false);
    reporter.renewSession();
    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('swallows reporting failures and falls back when manifest lookup fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getServiceMock.mockImplementation(() => {
      throw new Error('missing service');
    });
    emitTelemetryEventMock.mockRejectedValue(new Error('transport failed'));
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter(
      { enabled: true, measurementId: 'G-123' },
      emitTelemetryEventMock
    );

    await reporter.report({
      code: 'UNKNOWN_RUNTIME_UNEXPECTED',
      domain: 'unknown',
      severity: ErrorSeverity.INFO,
      recoverable: false,
      message: 'bad',
      timestamp: Date.now()
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('does not emit telemetry when no emitter is injected', async () => {
    const { GoogleAnalyticsReporter } =
      await import('../../../../../src/shared/errors/analytics/googleAnalyticsReporter');
    const reporter = new GoogleAnalyticsReporter({ enabled: true, measurementId: 'G-123' });

    await reporter.report({
      code: 'REST_NETWORK_TIMEOUT',
      domain: 'content',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      message: 'oops',
      timestamp: Date.now()
    });

    expect(emitTelemetryEventMock).not.toHaveBeenCalled();
  });
});
