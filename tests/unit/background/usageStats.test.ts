import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UsageStatsStore,
  UsageStatsStoreError,
  configureUsageStatsStorage,
  createUsageStatsStore,
  ensureUsageStatsInitialized,
  getUsageStats,
  recordClipUsage,
  resetUsageStats
} from '../../../src/background/services/usageStats';
import { OptionsMutationCoordinator } from '../../../src/background/services/optionsMutationCoordinator';
import type { OptionsRawStorageRepository } from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../../src/shared/config/losslessObjectBoundaryTypes';
import { DEFAULT_USAGE_STATS } from '../../../src/shared/constants';
import { setupDIForIntegrationTest, teardownDIAfterTest } from '../setup/diTestSetup';
import { testPlatformHarness } from '../../setup/globalSetup';

class RawOptionsRepository implements OptionsRawStorageRepository {
  constructor(public raw: PlainStructuredValue | null = {}) {}

  readRaw(): Promise<PlainStructuredValue | null> {
    return Promise.resolve(structuredClone(this.raw));
  }

  writeRaw(value: PlainStructuredObject): Promise<void> {
    this.raw = structuredClone(value);
    return Promise.resolve();
  }
}

function createStore(raw: PlainStructuredValue | null = {}) {
  const rawRepository = new RawOptionsRepository(raw);
  const coordinator = new OptionsMutationCoordinator(rawRepository, {
    createOperationId: () => 'usage-migration',
    yieldAfterWrite: () => Promise.resolve()
  });
  return {
    rawRepository,
    coordinator,
    store: new UsageStatsStore(testPlatformHarness.storage, coordinator)
  };
}

const validStats = {
  aiChatSaves: 2,
  fragmentSaves: 3,
  articleSaves: 4,
  lastUpdatedISO: '2026-08-23T00:00:00.000Z',
  history: [{ date: '2026-08-23', aiChat: 2, fragment: 3, article: 4 }]
};

describe('UsageStatsStore', () => {
  beforeEach(() => {
    testPlatformHarness.configure();
  });

  afterEach(() => {
    testPlatformHarness.reset();
    vi.restoreAllMocks();
  });

  it('prioritizes a valid own-present canonical value over stale legacy sources', async () => {
    await testPlatformHarness.storage.local.set('usageStats', validStats);
    await testPlatformHarness.storage.local.set('usage_stats', {
      ...validStats,
      aiChatSaves: 99
    });
    const { store, rawRepository } = createStore({
      usageStats: { ...validStats, aiChatSaves: 77 },
      opaqueRoot: { keep: true }
    });

    await expect(store.getStats()).resolves.toEqual(validStats);

    expect(await testPlatformHarness.storage.local.get('usage_stats')).toBeUndefined();
    expect(rawRepository.raw).toEqual({ opaqueRoot: { keep: true } });
  });

  it('reports malformed canonical data and never falls back to stale legacy values', async () => {
    await testPlatformHarness.storage.local.set('usageStats', { aiChatSaves: 'invalid' });
    await testPlatformHarness.storage.local.set('usage_stats', validStats);
    const { store, rawRepository } = createStore({ usageStats: validStats });

    await expect(store.getStats()).rejects.toEqual(
      new UsageStatsStoreError('USAGE_STATS_CANONICAL_INVALID')
    );

    expect(await testPlatformHarness.storage.local.get('usage_stats')).toEqual(validStats);
    expect(rawRepository.raw).toEqual({ usageStats: validStats });
  });

  it('migrates local legacy before raw Options usage and cleans only after verified readback', async () => {
    const localLegacy = { ...validStats, fragmentSaves: 8 };
    await testPlatformHarness.storage.local.set('usage_stats', localLegacy);
    const { store, rawRepository } = createStore({
      usageStats: { ...validStats, articleSaves: 10 },
      opaqueRoot: { keep: true }
    });

    await expect(store.getStats()).resolves.toEqual(localLegacy);

    expect(await testPlatformHarness.storage.local.get('usageStats')).toEqual(localLegacy);
    expect(await testPlatformHarness.storage.local.get('usage_stats')).toBeUndefined();
    expect(rawRepository.raw).toEqual({ opaqueRoot: { keep: true } });
  });

  it('migrates raw Options usageStats when both local keys are absent', async () => {
    const { store, rawRepository } = createStore({
      usageStats: validStats,
      opaqueRoot: { keep: true }
    });

    await expect(store.initialize()).resolves.toBeUndefined();
    await expect(store.getStats()).resolves.toEqual(validStats);
    expect(await testPlatformHarness.storage.local.get('usageStats')).toEqual(validStats);
    expect(rawRepository.raw).toEqual({ opaqueRoot: { keep: true } });
  });

  it('preserves recoverable legacy input when canonical migration write fails', async () => {
    await testPlatformHarness.storage.local.set('usage_stats', validStats);
    const { store, rawRepository } = createStore({ usageStats: validStats });
    const setSpy = vi
      .spyOn(testPlatformHarness.storage.local, 'set')
      .mockRejectedValueOnce(new Error('write failed'));

    await expect(store.getStats()).resolves.toEqual(validStats);

    expect(await testPlatformHarness.storage.local.get('usage_stats')).toEqual(validStats);
    expect(rawRepository.raw).toEqual({ usageStats: validStats });
    setSpy.mockRestore();
  });

  it('increments every Promise.all record exactly once through the FIFO', async () => {
    const { store } = createStore();
    await store.initialize();
    const payload = {
      type: 'ai_chat' as const,
      content: 'content',
      markdown: 'markdown',
      metadata: {}
    };

    await Promise.all(Array.from({ length: 12 }, () => store.recordUsage(payload)));

    await expect(store.getStats()).resolves.toMatchObject({ aiChatSaves: 12 });
    expect(await testPlatformHarness.storage.local.get('usage_stats')).toBeUndefined();
  });

  it('orders record and reset deterministically and recovers after reset failure', async () => {
    const { store } = createStore();
    await store.initialize();
    const payload = {
      type: 'fragment' as const,
      content: 'content',
      markdown: 'markdown',
      metadata: {}
    };

    await Promise.all([store.recordUsage(payload), store.resetStats(), store.recordUsage(payload)]);
    await expect(store.getStats()).resolves.toMatchObject({ fragmentSaves: 1 });

    vi.spyOn(testPlatformHarness.storage.local, 'set').mockRejectedValueOnce(
      new Error('reset failed')
    );
    await expect(store.resetStats()).rejects.toMatchObject({
      code: 'USAGE_STATS_STORAGE_FAILURE'
    });
    await expect(store.recordUsage(payload)).resolves.toMatchObject({ fragmentSaves: 2 });
  });

  it('initializes the default canonical key without any legacy forward write', async () => {
    const { store } = createStore();

    await store.initialize();

    expect(await testPlatformHarness.storage.local.get('usageStats')).toEqual(DEFAULT_USAGE_STATS);
    expect(await testPlatformHarness.storage.local.get('usage_stats')).toBeUndefined();
  });
});

describe('UsageStats DI integration', () => {
  beforeEach(() => {
    setupDIForIntegrationTest();
    testPlatformHarness.configure();
    const { coordinator } = createStore();
    configureUsageStatsStorage(testPlatformHarness.storage, coordinator);
  });

  afterEach(() => {
    teardownDIAfterTest();
    testPlatformHarness.reset();
  });

  it('routes convenience read, record, reset, and initialization through one owner', async () => {
    await ensureUsageStatsInitialized();
    await recordClipUsage({
      type: 'article',
      content: 'content',
      markdown: 'markdown',
      metadata: {}
    });
    await expect(getUsageStats()).resolves.toMatchObject({ articleSaves: 1 });
    await expect(resetUsageStats()).resolves.toEqual(DEFAULT_USAGE_STATS);
    await expect(createUsageStatsStore().getStats()).resolves.toEqual(DEFAULT_USAGE_STATS);
  });
});
