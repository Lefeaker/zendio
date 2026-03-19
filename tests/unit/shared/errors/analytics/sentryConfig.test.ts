import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getSentryBuildConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('enables sentry when dsn is present and enabled flag is true', async () => {
    vi.stubGlobal('__AIIINOB_SENTRY_DSN__', 'https://public@example.ingest.sentry.io/123456');
    vi.stubGlobal('__AIIINOB_SENTRY_ENABLED__', true);
    vi.stubGlobal('__AIIINOB_SENTRY_ENVIRONMENT__', 'staging');
    vi.stubGlobal('__AIIINOB_SENTRY_RELEASE__', '2.0.0');

    const { getSentryBuildConfig } = await import('../../../../../src/shared/errors/analytics/sentryConfig');

    expect(getSentryBuildConfig()).toEqual({
      enabled: true,
      dsn: 'https://public@example.ingest.sentry.io/123456',
      environment: 'staging',
      release: '2.0.0'
    });
  });

  it('keeps sentry disabled when dsn is missing even if enabled flag is true', async () => {
    vi.stubGlobal('__AIIINOB_SENTRY_DSN__', '');
    vi.stubGlobal('__AIIINOB_SENTRY_ENABLED__', true);

    const { getSentryBuildConfig } = await import('../../../../../src/shared/errors/analytics/sentryConfig');

    expect(getSentryBuildConfig()).toEqual({
      enabled: false,
      environment: 'production'
    });
  });

  it('infers enabled state from dsn when flag is not injected', async () => {
    vi.stubGlobal('__AIIINOB_SENTRY_DSN__', 'https://public@example.ingest.sentry.io/654321');

    const { getSentryBuildConfig } = await import('../../../../../src/shared/errors/analytics/sentryConfig');

    expect(getSentryBuildConfig()).toEqual({
      enabled: true,
      dsn: 'https://public@example.ingest.sentry.io/654321',
      environment: 'production'
    });
  });
});
