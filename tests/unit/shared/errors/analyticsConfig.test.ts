import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  StorageAreaService,
  StorageService
} from '../../../../src/platform/interfaces/storage';

function createStorageService(): StorageService {
  const localStore = new Map<string, unknown>();
  const local: StorageAreaService = {
    get: vi.fn(
      async <T>(key: string) => localStore.get(key) as T | undefined
    ) as StorageAreaService['get'],
    set: vi.fn(async <T>(key: string, value: T) => {
      localStore.set(key, value);
    }) as StorageAreaService['set'],
    getMany: vi.fn(
      async <T>() => ({}) as Record<string, T | undefined>
    ) as StorageAreaService['getMany'],
    setMany: vi.fn(
      async <T>(_entries: Record<string, T>) => undefined
    ) as StorageAreaService['setMany'],
    remove: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((entry) => localStore.delete(entry));
    }) as StorageAreaService['remove'],
    clear: vi.fn(async () => {
      localStore.clear();
    }) as StorageAreaService['clear'],
    watchKey: vi.fn(() => () => undefined) as StorageAreaService['watchKey'],
    watchAll: vi.fn(() => () => undefined) as StorageAreaService['watchAll']
  };

  const sync: StorageAreaService = {
    get: vi.fn(async <T>() => undefined as T | undefined) as StorageAreaService['get'],
    set: vi.fn(async <T>(_key: string, _value: T) => undefined) as StorageAreaService['set'],
    getMany: vi.fn(
      async <T>() => ({}) as Record<string, T | undefined>
    ) as StorageAreaService['getMany'],
    setMany: vi.fn(
      async <T>(_entries: Record<string, T>) => undefined
    ) as StorageAreaService['setMany'],
    remove: vi.fn(async () => undefined) as StorageAreaService['remove'],
    clear: vi.fn(async () => undefined) as StorageAreaService['clear'],
    watchKey: vi.fn(() => () => undefined) as StorageAreaService['watchKey'],
    watchAll: vi.fn(() => () => undefined) as StorageAreaService['watchAll']
  };

  return {
    local,
    sync
  };
}

const forbiddenSecretFieldPattern = new RegExp(
  [
    ['api', 'secret'].join('_'),
    ['GA', 'API', 'SECRET'].join('_'),
    ['AIIINOB', 'GA', 'API', 'SECRET'].join('_')
  ].join('|'),
  'i'
);

describe('analyticsConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('requires explicit storage configuration before resolving the singleton', async () => {
    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');

    expect(() => module.getAnalyticsConfigManager()).toThrow(
      '[Analytics Config] StorageService is not configured.'
    );
  });

  it('uses the configured storage service to initialize analytics state', async () => {
    const storage = createStorageService();
    await storage.local.set('analytics_user_consent', {
      analytics: true,
      errorReporting: true,
      timestamp: 100,
      version: '1.0'
    });
    await storage.local.set('analytics_config', {
      debugMode: true
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    const config = manager.getConfig();
    expect(config.debugMode).toBe(true);
    expect(config.enabled).toBe(true);
    expect(module.DEFAULT_ANALYTICS_CONFIG.measurementId).toBe('G-XXXXXXXXXX');
    expect(config.transportMode).toBe('disabled');
    expect(config.proxyEndpoint).toBeUndefined();
    expect(config.clientId).toMatch(/^ext-/);
    expect(config.sessionId).toBeTruthy();
    expect(storage.local.set).toHaveBeenCalledWith('analytics_client_id', expect.any(String));
    expect(storage.local.set).toHaveBeenCalledWith('analytics_session_id', expect.any(String));
  });

  it('reads public GA build globals without adding secret fields', async () => {
    vi.stubGlobal('__AIIINOB_GA_MEASUREMENT_ID__', 'G-BUILD1234');
    vi.stubGlobal('__AIIINOB_GA_TRANSPORT_MODE__', 'proxy');
    vi.stubGlobal('__AIIINOB_GA_PROXY_ENDPOINT__', 'https://analytics.example.test/collect');

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');

    expect(module.DEFAULT_ANALYTICS_CONFIG).toMatchObject({
      measurementId: 'G-BUILD1234',
      transportMode: 'proxy',
      proxyEndpoint: 'https://analytics.example.test/collect'
    });
    expect(JSON.stringify(module.DEFAULT_ANALYTICS_CONFIG)).not.toMatch(
      forbiddenSecretFieldPattern
    );
  });

  it('does not retain proxy endpoint when stored config switches away from proxy mode', async () => {
    vi.stubGlobal('__AIIINOB_GA_MEASUREMENT_ID__', 'G-BUILD1234');
    vi.stubGlobal('__AIIINOB_GA_TRANSPORT_MODE__', 'proxy');
    vi.stubGlobal('__AIIINOB_GA_PROXY_ENDPOINT__', 'https://analytics.example.test/collect');
    const storage = createStorageService();
    await storage.local.set('analytics_config', {
      transportMode: 'directDebug',
      debugMode: true
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    const config = manager.getConfig();
    expect(config).toMatchObject({
      transportMode: 'directDebug',
      debugMode: true
    });
    expect(config.proxyEndpoint).toBeUndefined();
  });

  it('preserves an existing analytics session id across consecutive initializations', async () => {
    const storage = createStorageService();
    await storage.local.set('analytics_client_id', 'ext-existing-client');
    await storage.local.set('analytics_session_id', 'existing-session-id');
    vi.mocked(storage.local.set).mockClear();

    const firstModule = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const firstManager = firstModule.configureAnalyticsConfigManager(storage);
    await firstManager.initialize();

    expect(firstManager.getConfig().sessionId).toBe('existing-session-id');
    expect(
      vi.mocked(storage.local.set).mock.calls.some(([key]) => key === 'analytics_session_id')
    ).toBe(false);

    vi.resetModules();

    const secondModule = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const secondManager = secondModule.configureAnalyticsConfigManager(storage);
    await secondManager.initialize();

    expect(secondManager.getConfig().sessionId).toBe('existing-session-id');
    expect(
      vi.mocked(storage.local.set).mock.calls.some(([key]) => key === 'analytics_session_id')
    ).toBe(false);
  });

  it('refreshes runtime analytics config from storage without renewing an existing session', async () => {
    const storage = createStorageService();
    await storage.local.set('analytics_client_id', 'ext-existing-client');
    await storage.local.set('analytics_session_id', 'existing-session-id');
    await storage.local.set('analytics_user_consent', {
      analytics: true,
      errorReporting: false,
      timestamp: 100,
      version: '1.0'
    });
    await storage.local.set('analytics_config', {
      measurementId: 'G-REFRESH001',
      transportMode: 'proxy',
      proxyEndpoint: 'https://proxy.example.test/collect'
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();
    vi.mocked(storage.local.set).mockClear();

    await storage.local.set('analytics_user_consent', {
      analytics: false,
      errorReporting: true,
      timestamp: 200,
      version: '1.0'
    });
    await storage.local.set('analytics_config', {
      measurementId: 'G-REFRESH002',
      transportMode: 'directDebug',
      debugMode: true
    });

    const config = await module.refreshAnalyticsConfig();

    expect(config.measurementId).toBe('G-REFRESH002');
    expect(config.transportMode).toBe('directDebug');
    expect(config.proxyEndpoint).toBeUndefined();
    expect(config.debugMode).toBe(true);
    expect(config.enabled).toBe(true);
    expect(config.userConsent).toMatchObject({
      analytics: false,
      errorReporting: true
    });
    expect(config.sessionId).toBe('existing-session-id');
    expect(
      vi.mocked(storage.local.set).mock.calls.some(([key]) => key === 'analytics_session_id')
    ).toBe(false);
  });
});
