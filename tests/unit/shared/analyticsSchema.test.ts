import { describe, expect, it } from 'vitest';
import {
  booleanValue,
  enumValue,
  hasForbiddenAnalyticsStringShape,
  identifier,
  nonNegativeInteger,
  positiveInteger,
  runtimeHarnessSource
} from '../../../src/shared/analytics/schema/analyticsParamValidators';
import { ANALYTICS_SCHEMA } from '../../../src/shared/analytics/schema/analyticsSchema';

describe('analytics schema validators', () => {
  it('rejects url-like strings before they can enter the analytics schema', () => {
    expect(hasForbiddenAnalyticsStringShape('https://example.com/private?token=abc')).toBe(true);
    expect(hasForbiddenAnalyticsStringShape('www.example.com/private')).toBe(true);
  });

  it('rejects secret-looking strings before they can enter the analytics schema', () => {
    expect(hasForbiddenAnalyticsStringShape('Bearer sk-live-secret')).toBe(true);
    expect(hasForbiddenAnalyticsStringShape('api_key=private-secret')).toBe(true);
  });

  it('rejects filename and path-looking strings before they can enter the analytics schema', () => {
    expect(hasForbiddenAnalyticsStringShape('DailyNotes.md')).toBe(true);
    expect(hasForbiddenAnalyticsStringShape('/Users/mac/private.md')).toBe(true);
    expect(identifier(80)('vault/transcript')).toBeUndefined();
  });

  it('accepts safe identifiers, enum values, booleans, integers, and literal harness sources', () => {
    expect(identifier(80)('clipButton')).toBe('clipButton');
    expect(enumValue(['ko-fi', 'afdian'] as const)('ko-fi')).toBe('ko-fi');
    expect(booleanValue()(true)).toBe(true);
    expect(nonNegativeInteger()(0)).toBe(0);
    expect(positiveInteger()(3)).toBe(3);
    expect(runtimeHarnessSource()('runtime-observability-harness')).toBe(
      'runtime-observability-harness'
    );
  });

  it('wires validator functions through the schema rows', () => {
    expect(ANALYTICS_SCHEMA.extension_error.params.error_code.validator('REST_TIMEOUT')).toBe(
      'REST_TIMEOUT'
    );
    expect(ANALYTICS_SCHEMA.video_started.params.source.validator('menu')).toBe('menu');
    expect(
      ANALYTICS_SCHEMA.runtime_harness_open.params.source.validator('runtime-observability-harness')
    ).toBe('runtime-observability-harness');
  });
});
