import { describe, expect, it } from 'vitest';
import { validateTelemetryEvent } from '../../../src/shared/analytics/telemetryValidation';
import type { TelemetryEventParamMap } from '../../../src/shared/types/analytics';

describe('telemetry validation', () => {
  const extensionErrorParams = {
    error_code: 'REST_NETWORK_TIMEOUT',
    error_domain: 'rest',
    error_category: 'NETWORK',
    error_severity: 'critical',
    error_severity_level: 4,
    error_recoverable: true,
    error_description: 'Network request timeout',
    timestamp: 1_717_171_717_171
  } satisfies Partial<TelemetryEventParamMap['extension_error']>;

  it('rejects raw extension_error privacy fields before sender payload construction', () => {
    const unsafeParamCases: Array<Partial<TelemetryEventParamMap['extension_error']>> = [
      {
        stackTrace: 'Error\n at run (file:///Users/mac/private/file.js:12:8)'
      },
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/123 Safari/537.36'
      },
      {
        domain: 'example.com/private/path'
      },
      {
        protocol: 'javascript:'
      },
      {
        error_description: 'api_key=sk_live_abcdefghi'
      }
    ];

    for (const unsafeParams of unsafeParamCases) {
      expect(
        validateTelemetryEvent('extension_error', {
          ...extensionErrorParams,
          ...unsafeParams
        } as TelemetryEventParamMap['extension_error'])
      ).toEqual({ ok: false, reason: 'invalid-params' });
    }
  });

  it('accepts reporter-sanitized extension_error payloads without service params', () => {
    expect(
      validateTelemetryEvent('extension_error', {
        ...extensionErrorParams,
        browser_name: 'chrome',
        browser_version: '123',
        domain: 'example.com',
        protocol: 'https:',
        stackTrace: 'Error\nat run:12\nat anonymous:22'
      } as TelemetryEventParamMap['extension_error'])
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
  });
});
