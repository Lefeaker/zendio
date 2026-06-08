import { describe, expect, it } from 'vitest';
import {
  booleanParam,
  enumParam,
  hasRequiredTelemetryParams,
  identifierParam,
  nonNegativeNumberParam,
  sanitizeTelemetryParams
} from '../../../src/shared/analytics';

const TEST_SCHEMA = {
  key: identifierParam(80, {
    required: true,
    privacyNote: 'Allow only safe telemetry identifiers.'
  }),
  count: nonNegativeNumberParam({
    required: true,
    max: 10_000,
    gaCustomDefinitionKind: 'metric',
    privacyNote: 'Allow bounded usage counters only.'
  }),
  enabled: booleanParam({
    privacyNote: 'Allow boolean flags only.'
  }),
  variant: enumParam(['first', 'returning'] as const, {
    privacyNote: 'Allow low-cardinality UI variants only.'
  })
} as const;

describe('telemetry sanitizers', () => {
  it('keeps only allowlisted primitives and omits unknown params', () => {
    const sanitized = sanitizeTelemetryParams(TEST_SCHEMA, {
      key: 'clipButton',
      count: 5,
      enabled: false,
      variant: 'first',
      ignored: 'discard-me'
    });

    expect(sanitized).toEqual({
      key: 'clipButton',
      count: 5,
      enabled: false,
      variant: 'first'
    });
    expect(hasRequiredTelemetryParams(TEST_SCHEMA, sanitized)).toBe(true);
  });

  it('rejects URL-like, path-like, markdown-like, file-like, and secret-like strings', () => {
    const unsafeValues = [
      'https://example.com/path?token=abc',
      '/Users/mac/Vault/Weekly Notes.md',
      '# Weekly Notes',
      'Weekly-Notes.md',
      'sk_live_1234567890abcdef'
    ];

    for (const unsafeValue of unsafeValues) {
      const sanitized = sanitizeTelemetryParams(TEST_SCHEMA, {
        key: unsafeValue,
        count: 1
      });

      expect(sanitized).toEqual({ count: 1 });
      expect(hasRequiredTelemetryParams(TEST_SCHEMA, sanitized)).toBe(false);
    }
  });

  it('rejects negative, non-finite, and out-of-range numbers', () => {
    expect(
      sanitizeTelemetryParams(TEST_SCHEMA, {
        key: 'clipButton',
        count: -1,
        enabled: 'true'
      })
    ).toEqual({ key: 'clipButton' });

    expect(
      sanitizeTelemetryParams(TEST_SCHEMA, {
        key: 'clipButton',
        count: Number.POSITIVE_INFINITY
      })
    ).toEqual({ key: 'clipButton' });

    expect(
      sanitizeTelemetryParams(TEST_SCHEMA, {
        key: 'clipButton',
        count: 10_001
      })
    ).toEqual({ key: 'clipButton' });
  });
});
