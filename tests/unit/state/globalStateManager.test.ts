import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  configureGlobalStateManagerStorage,
  getGlobalStateManager,
  resetGlobalState
} from '@shared/state';
import { STATE_KEYS } from '@shared/state/keys';
import { testPlatformHarness } from '../../setup/globalSetup';
import { setupDIForTest, teardownDIAfterTest } from '../setup/diTestSetup';

describe('globalStateManager', () => {
  beforeEach(() => {
    setupDIForTest();
    testPlatformHarness.configure();
    configureGlobalStateManagerStorage(testPlatformHarness.storage);
    resetGlobalState();
  });

  afterEach(() => {
    resetGlobalState();
    teardownDIAfterTest();
    testPlatformHarness.reset();
  });

  it('syncs store with storage area updates', async () => {
    await testPlatformHarness.storage.sync.set('options', { theme: 'dark' });

    // 使用同一个manager实例
    const manager = getGlobalStateManager();
    const store = manager.getStore<Record<string, unknown>>(STATE_KEYS.options);
    await manager.syncWithStorage<Record<string, unknown>>(STATE_KEYS.options, 'options');

    expect(store.get()).toEqual({ theme: 'dark' });

    await testPlatformHarness.storage.sync.set('options', { theme: 'light' });
    expect(store.get()).toEqual({ theme: 'light' });
  });

  it('stops synchronizing after destroyStore', async () => {
    await testPlatformHarness.storage.sync.set('options', { locale: 'zh-CN' });

    // 使用同一个manager实例
    const manager = getGlobalStateManager();
    const store = manager.getStore<Record<string, unknown>>(STATE_KEYS.options);
    await manager.syncWithStorage<Record<string, unknown>>(STATE_KEYS.options, 'options');

    expect(store.get()).toEqual({ locale: 'zh-CN' });

    manager.destroyStore(STATE_KEYS.options);

    await testPlatformHarness.storage.sync.set('options', { locale: 'en-US' });

    expect(manager.hasStore(STATE_KEYS.options)).toBe(false);
    const newStore = manager.getStore<Record<string, unknown>>(STATE_KEYS.options);
    expect(newStore.get()).toBeUndefined();
  });
});
