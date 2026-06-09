import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  StorageAreaService,
  StorageChangeCallback,
  StorageService
} from '../../../../src/platform/interfaces/storage';
import type { AnalyticsConfig } from '../../../../src/shared/errors/analytics/analyticsConfig';

type StoredAnalyticsValue = string | number | boolean | object | null | undefined;
type PersistedAnalyticsConfig = Pick<
  AnalyticsConfig,
  | 'batchSize'
  | 'debugMode'
  | 'enabled'
  | 'maxErrorsPerSession'
  | 'measurementId'
  | 'relayEndpoint'
  | 'reportingInterval'
  | 'transportMode'
>;

function createWatchKeyStub(): StorageAreaService['watchKey'] {
  return <T>(_key: string, _callback: StorageChangeCallback<T>) =>
    () =>
      undefined;
}

function createLocalStorageArea(localStore: Map<string, StoredAnalyticsValue>): StorageAreaService {
  const get: StorageAreaService['get'] = <T>(key: string) =>
    Promise.resolve(localStore.get(key) as T | undefined);
  const getMany: StorageAreaService['getMany'] = () => Promise.resolve({});
  const setMany: StorageAreaService['setMany'] = () => Promise.resolve();
  const remove: StorageAreaService['remove'] = (key) => {
    const keys = Array.isArray(key) ? key : [key];
    keys.forEach((entry) => localStore.delete(entry));
    return Promise.resolve();
  };
  const clear: StorageAreaService['clear'] = () => {
    localStore.clear();
    return Promise.resolve();
  };

  return {
    get,
    set: vi.fn(<T>(key: string, value: T) => {
      localStore.set(key, value as StoredAnalyticsValue);
      return Promise.resolve();
    }) as StorageAreaService['set'],
    getMany,
    setMany,
    remove,
    clear,
    watchKey: createWatchKeyStub(),
    watchAll: () => () => undefined
  };
}

function createReadonlyStorageArea(): StorageAreaService {
  const get: StorageAreaService['get'] = () => Promise.resolve(undefined);
  const setMany: StorageAreaService['setMany'] = () => Promise.resolve();
  const getMany: StorageAreaService['getMany'] = () => Promise.resolve({});
  const remove: StorageAreaService['remove'] = () => Promise.resolve();
  const clear: StorageAreaService['clear'] = () => Promise.resolve();

  return {
    get,
    set: vi.fn(<T>(_key: string, _value: T) => Promise.resolve()) as StorageAreaService['set'],
    getMany,
    setMany,
    remove,
    clear,
    watchKey: createWatchKeyStub(),
    watchAll: () => () => undefined
  };
}

function createStorageService(): {
  storage: StorageService;
  localStore: Map<string, StoredAnalyticsValue>;
} {
  const localStore = new Map<string, StoredAnalyticsValue>();

  return {
    storage: {
      local: createLocalStorageArea(localStore),
      sync: createReadonlyStorageArea()
    },
    localStore
  };
}

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
    const { storage, localStore } = createStorageService();
    localStore.set('analytics_user_consent', {
      analytics: true,
      errorReporting: true,
      timestamp: 100,
      version: '1.0'
    });
    localStore.set('analytics_config', {
      debugMode: true
    });
    localStore.set('analytics_session_id', 'existing-session');

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    const config = manager.getConfig();
    const storedConfig = await storage.local.get<PersistedAnalyticsConfig>('analytics_config');

    expect(config.debugMode).toBe(true);
    expect(config.enabled).toBe(true);
    expect(module.DEFAULT_ANALYTICS_CONFIG.measurementId).toBe('G-XXXXXXXXXX');
    expect(config.sessionId).toBe('existing-session');
    expect(config).toMatchObject({
      transportMode: 'disabled'
    });
    expect(config.relayEndpoint).toBeUndefined();
    expect(storedConfig).toMatchObject({
      debugMode: true,
      transportMode: 'disabled'
    });
    expect(config.clientId).toMatch(/^ext-/);
    expect(storage.local.set).toHaveBeenCalledWith('analytics_client_id', expect.any(String));
    expect(storage.local.set).not.toHaveBeenCalledWith('analytics_session_id', expect.any(String));
  });

  it('preserves an existing stored session across repeated initialize calls', async () => {
    const { storage, localStore } = createStorageService();
    localStore.set('analytics_user_consent', {
      analytics: true,
      errorReporting: false,
      timestamp: 100,
      version: '1.0'
    });
    localStore.set('analytics_client_id', 'existing-client');
    localStore.set('analytics_session_id', 'existing-session');
    localStore.set('analytics_config', {
      debugMode: false
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);

    vi.mocked(storage.local.set).mockClear();
    await manager.initialize();
    await manager.initialize();

    expect(manager.getConfig().clientId).toBe('existing-client');
    expect(manager.getConfig().sessionId).toBe('existing-session');
    expect(vi.mocked(storage.local.set).mock.calls.map(([key]) => key)).not.toContain(
      'analytics_session_id'
    );
  });

  it('uses the current public build measurement id when stored config is missing or placeholder-only', async () => {
    vi.stubGlobal('__AIIINOB_GA_MEASUREMENT_ID__', 'G-1234567890');

    const { storage, localStore } = createStorageService();
    localStore.set('analytics_config', {
      measurementId: 'G-XXXXXXXXXX',
      relayEndpoint: '   ',
      transportMode: 'invalid-mode',
      debugMode: true
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    const storedConfig = await storage.local.get<PersistedAnalyticsConfig>('analytics_config');

    expect(manager.getConfig()).toMatchObject({
      measurementId: 'G-1234567890',
      transportMode: 'disabled',
      debugMode: true
    });
    expect(manager.getConfig().relayEndpoint).toBeUndefined();
    expect(storedConfig).toMatchObject({
      measurementId: 'G-1234567890',
      transportMode: 'disabled'
    });
    expect(storedConfig?.relayEndpoint).toBeUndefined();
  });

  it('preserves a non-placeholder stored measurement id over the build default', async () => {
    vi.stubGlobal('__AIIINOB_GA_MEASUREMENT_ID__', 'G-1234567890');

    const { storage, localStore } = createStorageService();
    localStore.set('analytics_config', {
      measurementId: 'G-STORED1234'
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    expect(manager.getConfig().measurementId).toBe('G-STORED1234');
  });

  it('creates a session only when missing and renews it explicitly on demand', async () => {
    const { storage } = createStorageService();

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);

    await manager.initialize();
    const initialSession = manager.getConfig().sessionId;
    expect(initialSession).toMatch(/-/);
    expect(storage.local.set).toHaveBeenCalledWith('analytics_session_id', expect.any(String));

    vi.mocked(storage.local.set).mockClear();
    await manager.renewSession();
    const renewedSession = manager.getConfig().sessionId;

    expect(renewedSession).toMatch(/-/);
    expect(renewedSession).not.toBe(initialSession);
    expect(storage.local.set).toHaveBeenCalledWith('analytics_session_id', renewedSession);
  });

  it('refreshes consent helpers from storage without requiring a restart', async () => {
    const { storage, localStore } = createStorageService();
    localStore.set('analytics_user_consent', {
      analytics: true,
      errorReporting: false,
      timestamp: 100,
      version: '1.0'
    });

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    expect(manager.hasUserConsent()).toBe(true);
    expect(manager.hasAnalyticsConsent()).toBe(true);
    expect(manager.hasErrorReportingConsent()).toBe(false);
    expect(module.shouldReportErrors()).toBe(false);

    localStore.set('analytics_user_consent', {
      analytics: false,
      errorReporting: true,
      timestamp: 200,
      version: '1.0'
    });

    await manager.refreshFromStorage();

    expect(manager.hasAnalyticsConsent()).toBe(false);
    expect(manager.hasErrorReportingConsent()).toBe(true);
    expect(module.shouldReportErrors()).toBe(true);
  });

  it('clears all analytics storage keys and resets the in-memory config', async () => {
    const { storage, localStore } = createStorageService();
    localStore.set('analytics_user_consent', {
      analytics: true,
      errorReporting: true,
      timestamp: 100,
      version: '1.0'
    });
    localStore.set('analytics_config', { debugMode: true });
    localStore.set('analytics_client_id', 'existing-client');
    localStore.set('analytics_session_id', 'existing-session');
    localStore.set('analytics_error_queue', [{ code: 'E1' }]);
    localStore.set('analytics_last_report_time', 1234);

    const module = await import('../../../../src/shared/errors/analytics/analyticsConfig');
    const manager = module.configureAnalyticsConfigManager(storage);
    await manager.initialize();

    await manager.clearAllData();

    expect(await storage.local.get('analytics_user_consent')).toBeUndefined();
    expect(await storage.local.get('analytics_config')).toBeUndefined();
    expect(await storage.local.get('analytics_client_id')).toBeUndefined();
    expect(await storage.local.get('analytics_session_id')).toBeUndefined();
    expect(await storage.local.get('analytics_error_queue')).toBeUndefined();
    expect(await storage.local.get('analytics_last_report_time')).toBeUndefined();
    expect(manager.getConfig()).toMatchObject(module.DEFAULT_ANALYTICS_CONFIG);
    expect(manager.getConfig().clientId).toBeUndefined();
    expect(manager.getConfig().sessionId).toBeUndefined();
    expect(manager.getConfig().userConsent).toBeUndefined();
  });
});
