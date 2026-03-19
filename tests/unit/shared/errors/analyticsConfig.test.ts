import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageAreaService, StorageService } from '../../../../src/platform/interfaces/storage';

function createStorageService(): StorageService {
  const localStore = new Map<string, unknown>();
  const local: StorageAreaService = {
    get: vi.fn(async <T,>(key: string) => localStore.get(key) as T | undefined) as StorageAreaService['get'],
    set: vi.fn(async <T,>(key: string, value: T) => {
      localStore.set(key, value);
    }) as StorageAreaService['set'],
    getMany: vi.fn(async <T,>() => ({} as Record<string, T | undefined>)) as StorageAreaService['getMany'],
    setMany: vi.fn(async <T,>(_entries: Record<string, T>) => undefined) as StorageAreaService['setMany'],
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
    get: vi.fn(async <T,>() => undefined as T | undefined) as StorageAreaService['get'],
    set: vi.fn(async <T,>(_key: string, _value: T) => undefined) as StorageAreaService['set'],
    getMany: vi.fn(async <T,>() => ({} as Record<string, T | undefined>)) as StorageAreaService['getMany'],
    setMany: vi.fn(async <T,>(_entries: Record<string, T>) => undefined) as StorageAreaService['setMany'],
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

describe('analyticsConfig', () => {
  beforeEach(() => {
    vi.resetModules();
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
    expect(config.clientId).toMatch(/^ext-/);
    expect(config.sessionId).toBeTruthy();
    expect(storage.local.set).toHaveBeenCalledWith('analytics_client_id', expect.any(String));
    expect(storage.local.set).toHaveBeenCalledWith('analytics_session_id', expect.any(String));
  });
});
