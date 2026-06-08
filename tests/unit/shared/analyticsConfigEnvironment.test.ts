import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('analyticsConfig build environment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('reads public build globals through the test-environment fallback', async () => {
    vi.stubGlobal('__AIIINOB_GA_MEASUREMENT_ID__', 'G-1234567890');
    vi.stubGlobal('__AIIINOB_GA_RELAY_ENDPOINT__', 'https://relay.example/collect');
    vi.stubGlobal('__AIIINOB_GA_TRANSPORT_MODE__', 'relay');

    const module = await import('../../../src/shared/errors/analytics/analyticsConfig');

    expect(module.getAnalyticsBuildConfig()).toEqual({
      measurementId: 'G-1234567890',
      relayEndpoint: 'https://relay.example/collect',
      transportMode: 'relay'
    });
    expect(module.DEFAULT_ANALYTICS_CONFIG).toMatchObject({
      measurementId: 'G-1234567890',
      relayEndpoint: 'https://relay.example/collect',
      transportMode: 'relay'
    });
  });

  it('falls back to disabled transport and ignores secret-shaped globals', async () => {
    const secretKey = ['__AIIINOB_', 'GA_', 'API', '_SECRET__'].join('');
    vi.stubGlobal(secretKey, 'server-only');
    vi.stubGlobal('__AIIINOB_GA_TRANSPORT_MODE__', 'invalid-mode');
    vi.stubGlobal('__AIIINOB_GA_RELAY_ENDPOINT__', '   ');

    const module = await import('../../../src/shared/errors/analytics/analyticsConfig');
    const buildConfig = module.getAnalyticsBuildConfig();

    expect(buildConfig).toEqual({
      measurementId: 'G-XXXXXXXXXX',
      transportMode: 'disabled'
    });
    expect(Object.prototype.hasOwnProperty.call(buildConfig, secretKey)).toBe(false);
    expect(Object.values(buildConfig)).not.toContain('server-only');
    expect(module.DEFAULT_ANALYTICS_CONFIG.relayEndpoint).toBeUndefined();
  });
});
