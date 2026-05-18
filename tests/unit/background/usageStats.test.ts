import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UsageStatsStore,
  configureUsageStatsStorage,
  createUsageStatsStore,
  getUsageStatsStore,
  getUsageStats,
  recordClipUsage,
  ensureUsageStatsInitialized
} from '../../../src/background/services/usageStats';
import { setupDIForIntegrationTest, teardownDIAfterTest } from '../setup/diTestSetup';
import { testPlatformHarness } from '../../setup/globalSetup';

describe('UsageStatsStore', () => {
  let store: UsageStatsStore;

  beforeEach(() => {
    testPlatformHarness.configure();
    configureUsageStatsStorage(testPlatformHarness.storage);
    store = createUsageStatsStore();
  });

  afterEach(() => {
    testPlatformHarness.reset();
  });

  it('initializes with default stats', async () => {
    await store.initialize();
    const stats = await store.getStats();

    expect(stats).toEqual(
      expect.objectContaining({
        aiChatSaves: 0,
        fragmentSaves: 0,
        articleSaves: 0,
        history: []
      })
    );
  });

  it('records AI chat usage', async () => {
    await store.initialize();

    const payload = {
      type: 'ai_chat' as const,
      content: 'test content',
      markdown: 'test markdown',
      metadata: {}
    };

    const result = await store.recordUsage(payload);

    expect(result).toEqual(
      expect.objectContaining({
        aiChatSaves: 1,
        fragmentSaves: 0,
        articleSaves: 0
      })
    );
  });

  it('records fragment usage', async () => {
    await store.initialize();

    const payload = {
      type: 'fragment' as const,
      content: 'test fragment',
      markdown: 'test markdown',
      metadata: {}
    };

    const result = await store.recordUsage(payload);

    expect(result).toEqual(
      expect.objectContaining({
        aiChatSaves: 0,
        fragmentSaves: 1,
        articleSaves: 0
      })
    );
  });

  it('records article usage', async () => {
    await store.initialize();

    const payload = {
      type: 'article' as const,
      content: 'test article',
      markdown: 'test markdown',
      metadata: {}
    };

    const result = await store.recordUsage(payload);

    expect(result).toEqual(
      expect.objectContaining({
        aiChatSaves: 0,
        fragmentSaves: 0,
        articleSaves: 1
      })
    );
  });

  it('updates history when recording usage', async () => {
    await store.initialize();

    const payload = {
      type: 'ai_chat' as const,
      content: 'test content',
      markdown: 'test markdown',
      metadata: {}
    };

    const result = await store.recordUsage(payload);

    expect(result?.history).toHaveLength(1);
    const historyEntry = result?.history?.[0];
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.aiChat).toBe(1);
    expect(historyEntry?.fragment).toBe(0);
    expect(historyEntry?.article).toBe(0);
    expect(typeof historyEntry?.date).toBe('string');
  });

  it('persists stats to storage', async () => {
    await store.initialize();

    const payload = {
      type: 'ai_chat' as const,
      content: 'test content',
      markdown: 'test markdown',
      metadata: {}
    };

    await store.recordUsage(payload);

    // Check that data was written to storage
    const stored = await testPlatformHarness.storage.local.get('usage_stats');
    const storedStats = (stored ?? {}) as Record<string, unknown>;
    const aiChatSaves = typeof storedStats.aiChatSaves === 'number' ? storedStats.aiChatSaves : 0;
    expect(aiChatSaves).toBe(1);
  });

  it('handles storage errors gracefully', async () => {
    // Mock storage to throw error
    const setSpy = vi
      .spyOn(testPlatformHarness.storage.local, 'set')
      .mockRejectedValue(new Error('Storage error'));

    await store.initialize();

    const payload = {
      type: 'ai_chat' as const,
      content: 'test content',
      markdown: 'test markdown',
      metadata: {}
    };

    // Should not throw, but should still update memory stats
    const result = await store.recordUsage(payload);
    expect(result?.aiChatSaves).toBe(1);

    // Restore original method
    setSpy.mockRestore();
  });
});

describe('UsageStats DI Integration', () => {
  beforeEach(() => {
    setupDIForIntegrationTest();
    testPlatformHarness.configure();
    configureUsageStatsStorage(testPlatformHarness.storage);
  });

  afterEach(() => {
    teardownDIAfterTest();
    testPlatformHarness.reset();
  });

  it('getUsageStatsStore returns singleton instance', () => {
    const store1 = getUsageStatsStore();
    const store2 = getUsageStatsStore();

    expect(store1).toBe(store2);
    expect(store1).toBeInstanceOf(UsageStatsStore);
  });

  it('convenience functions use DI container', async () => {
    await ensureUsageStatsInitialized();

    const payload = {
      type: 'ai_chat' as const,
      content: 'test content',
      markdown: 'test markdown',
      metadata: {}
    };

    const result = await recordClipUsage(payload);
    expect(result?.aiChatSaves).toBe(1);

    const stats = await getUsageStats();
    expect(stats.aiChatSaves).toBe(1);
  });

  it('handles multiple usage recordings', async () => {
    await ensureUsageStatsInitialized();

    const aiChatPayload = {
      type: 'ai_chat' as const,
      content: 'ai chat content',
      markdown: 'ai chat markdown',
      metadata: {}
    };

    const fragmentPayload = {
      type: 'fragment' as const,
      content: 'fragment content',
      markdown: 'fragment markdown',
      metadata: {}
    };

    await recordClipUsage(aiChatPayload);
    await recordClipUsage(fragmentPayload);
    await recordClipUsage(aiChatPayload);

    const stats = await getUsageStats();
    expect(stats.aiChatSaves).toBe(2);
    expect(stats.fragmentSaves).toBe(1);
    expect(stats.articleSaves).toBe(0);
  });
});
