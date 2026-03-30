/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Messages } from '../../../../src/i18n/messages';
import { DEFAULT_USAGE_STATS } from '@shared/constants';
import type { Message } from '@shared/repositories';
import type { UsageStats } from '@shared/types/usage';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { UsageSection } from '@options/components/sections/UsageSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockMessagingRepository, MockOptionsRepository } from '../../../utils/repositories';
import { ensureSvgElementConstructors } from '../../../utils/svgElementPolyfill';
import type { StorageService, StorageAreaService, StorageChange, StorageChangeMap } from '../../../../src/platform/interfaces/storage';

ensureSvgElementConstructors();

const messages = {
  usageDashboardTitle: 'Usage',
  usageDashboardSubtitle: 'Overview',
  usageTotalLabel: 'Total',
  usageAiLabel: 'AI',
  usageFragmentLabel: 'Fragment',
  usageArticleLabel: 'Article'
} as unknown as Messages;

const baseUsageStats = (): UsageStats => ({
  aiChatSaves: 2,
  fragmentSaves: 3,
  articleSaves: 1,
  lastUpdatedISO: '2025-01-15T00:00:00.000Z',
  history: [
    { date: '2025-01-13', aiChat: 0, fragment: 1, article: 0 },
    { date: '2025-01-14', aiChat: 1, fragment: 1, article: 0 },
    { date: '2025-01-15', aiChat: 1, fragment: 1, article: 1 }
  ]
});

const noopStateManager = {} as OptionsStateManager;

interface StorageStubController {
  storage: StorageService;
  getLocalValue<T = unknown>(key: string): T | undefined;
}

function createStorageAreaStub(initial: Record<string, unknown> = {}): {
  area: StorageAreaService;
  getValue<T = unknown>(key: string): T | undefined;
} {
  const state = new Map<string, unknown>(Object.entries(initial));
  const keyWatchers = new Map<string, Set<(value: unknown, change: StorageChange<unknown>) => void>>();
  const allWatchers = new Set<(changes: StorageChangeMap) => void>();

  const emit = (key: string, oldValue: unknown, newValue: unknown): void => {
    const change: StorageChange<unknown> = { oldValue, newValue };
    keyWatchers.get(key)?.forEach((callback) => callback(newValue, change));
    const changes: StorageChangeMap = { [key]: change };
    allWatchers.forEach((callback) => callback(changes));
  };

  const area: StorageAreaService = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return state.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      const oldValue = state.get(key);
      state.set(key, value);
      emit(key, oldValue, value);
    },
    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Object.fromEntries(keys.map((key) => [key, state.get(key) as T | undefined]));
    },
    async setMany<T = unknown>(entries: Record<string, T>): Promise<void> {
      for (const [key, value] of Object.entries(entries)) {
        const oldValue = state.get(key);
        state.set(key, value);
        emit(key, oldValue, value);
      }
    },
    async remove(key: string | string[]): Promise<void> {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((entry) => {
        const oldValue = state.get(entry);
        state.delete(entry);
        emit(entry, oldValue, undefined);
      });
    },
    async clear(): Promise<void> {
      const keys = Array.from(state.keys());
      keys.forEach((key) => {
        const oldValue = state.get(key);
        state.delete(key);
        emit(key, oldValue, undefined);
      });
    },
    watchKey<T = unknown>(key: string, callback) {
      const listeners = keyWatchers.get(key) ?? new Set();
      keyWatchers.set(key, listeners);
      const typed = callback as (value: unknown, change: StorageChange<unknown>) => void;
      listeners.add(typed);
      return () => listeners.delete(typed);
    },
    watchAll(callback) {
      allWatchers.add(callback);
      return () => allWatchers.delete(callback);
    }
  };

  return {
    area,
    getValue<T = unknown>(key: string): T | undefined {
      return state.get(key) as T | undefined;
    }
  };
}

function createStorageStub(initialLocal: Record<string, unknown> = {}): StorageStubController {
  const local = createStorageAreaStub(initialLocal);
  const sync = createStorageAreaStub();
  return {
    storage: {
      local: local.area,
      sync: sync.area
    },
    getLocalValue: local.getValue
  };
}

describe('UsageSection', () => {
  let container: HTMLElement;
  let registry: FormSectionRegistry;

  beforeEach(() => {
    document.body.innerHTML = '<section id="usage"></section>';
    const host = document.getElementById('usage');
    if (!(host instanceof HTMLElement)) {
      throw new Error('Usage host not found');
    }
    container = host;
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = async (initialUsage?: UsageStats, localUsage?: UsageStats) => {
    const repo = new MockOptionsRepository();
    const messaging = new MockMessagingRepository();
    const storageController = createStorageStub(localUsage ? { usageStats: localUsage } : {});
    if (initialUsage) {
      await repo.set({ usageStats: initialUsage });
    }
    const section = new UsageSection(container, repo, messaging, storageController.storage);
    section.setMessages(messages);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo, messaging, storageController };
  };

  it('renders usage metrics and chart data from repository snapshot', async () => {
    const { section } = await renderSection(baseUsageStats());

    await vi.waitFor(() => {
      expect(container.querySelector('#usageTotalCount')?.textContent).toBe('6');
      expect(container.querySelector('#usageAiCount')?.textContent).toBe('2');
      expect(container.querySelector('#usageFragmentCount')?.textContent).toBe('3');
      expect(container.querySelector('#usageArticleCount')?.textContent).toBe('1');
    });

    const path = container.querySelector<SVGPathElement>('#usageWavePath');
    expect(path?.getAttribute('d')).not.toEqual('M0 150 L200 150');

    section.destroy();
  });

  it('reports increment events only for positive deltas', async () => {
    const initial = baseUsageStats();
    const { section, repo, messaging } = await renderSection(initial);

    const updated: UsageStats = {
      ...initial,
      aiChatSaves: initial.aiChatSaves + 2,
      fragmentSaves: initial.fragmentSaves,
      articleSaves: initial.articleSaves + 1,
      history: [
        ...initial.history,
        { date: '2025-01-16', aiChat: 2, fragment: 0, article: 1 }
      ]
    };

    await repo.set({ usageStats: updated });

    const getIncrementEvents = () =>
      messaging
        .getSentMessages()
        .map(entry => entry.message)
        .filter(
          (message): message is Extract<Message, { type: 'track' }> =>
            message.type === 'track' && message.event === 'usage_dashboard_increment'
        );

    await vi.waitFor(() => {
      expect(getIncrementEvents()).toHaveLength(2);
    });

    const incrementEvents = getIncrementEvents();
    const aiMetric = incrementEvents.find(event => event.params?.category === 'ai_chat');
    expect(aiMetric?.params?.increment).toBe(2);
    const articleMetric = incrementEvents.find(event => event.params?.category === 'article');
    expect(articleMetric?.params?.increment).toBe(1);

    section.destroy();
  });

  it('clears usage stats via repository and sends analytics event', async () => {
    const { section, repo, messaging } = await renderSection(baseUsageStats());
    const clearButton = container.querySelector<HTMLButtonElement>('button[data-role="usage-clear"]');
    expect(clearButton).toBeTruthy();

    clearButton?.click();

    await vi.waitFor(() => {
      const snapshot = (repo.getMockData() as { usageStats?: UsageStats }).usageStats;
      expect(snapshot).toEqual({
        aiChatSaves: DEFAULT_USAGE_STATS.aiChatSaves,
        fragmentSaves: DEFAULT_USAGE_STATS.fragmentSaves,
        articleSaves: DEFAULT_USAGE_STATS.articleSaves,
        lastUpdatedISO: DEFAULT_USAGE_STATS.lastUpdatedISO,
        history: []
      });
    });

    await vi.waitFor(() => {
      expect(
        messaging
          .getSentMessages()
          .some(entry => entry.message.type === 'track' && entry.message.event === 'clear_stats')
      ).toBe(true);
    });

    section.destroy();
  });

  it('reacts to repository updates and stops after destroy', async () => {
    const { section, repo } = await renderSection(baseUsageStats());
    const totalValue = container.querySelector('#usageTotalCount');
    await vi.waitFor(() => {
      expect(totalValue?.textContent).toBe('6');
    });

    const updated: UsageStats = {
      aiChatSaves: 4,
      fragmentSaves: 5,
      articleSaves: 2,
      lastUpdatedISO: '2025-01-16T00:00:00.000Z',
      history: [
        { date: '2025-01-13', aiChat: 1, fragment: 1, article: 0 },
        { date: '2025-01-14', aiChat: 2, fragment: 2, article: 1 },
        { date: '2025-01-15', aiChat: 3, fragment: 4, article: 1 },
        { date: '2025-01-16', aiChat: 4, fragment: 5, article: 2 }
      ]
    };

    await repo.set({ usageStats: updated });
    await vi.waitFor(() => {
      expect(totalValue?.textContent).toBe('11');
    });

    section.destroy();
    await repo.set({
      usageStats: {
        ...updated,
        aiChatSaves: 10,
        fragmentSaves: 8,
        articleSaves: 3
      }
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(totalValue?.textContent).toBe('11');
  });

  it('prefers local usage stats over options snapshot when background updates local storage', async () => {
    const staleOptions: UsageStats = {
      ...DEFAULT_USAGE_STATS,
      lastUpdatedISO: '2025-01-14T00:00:00.000Z'
    };
    const freshLocal: UsageStats = {
      ...baseUsageStats(),
      fragmentSaves: 7,
      articleSaves: 2
    };

    const { section } = await renderSection(staleOptions, freshLocal);

    await vi.waitFor(() => {
      expect(container.querySelector('#usageTotalCount')?.textContent).toBe('11');
      expect(container.querySelector('#usageFragmentCount')?.textContent).toBe('7');
      expect(container.querySelector('#usageArticleCount')?.textContent).toBe('2');
    });

    section.destroy();
  });

  it('clears mirrored local usage stats together with options snapshot', async () => {
    const { section, storageController } = await renderSection(baseUsageStats(), baseUsageStats());
    const clearButton = container.querySelector<HTMLButtonElement>('button[data-role="usage-clear"]');

    clearButton?.click();

    await vi.waitFor(() => {
      const localStats = storageController.getLocalValue<UsageStats>('usageStats');
      expect(localStats).toEqual({
        aiChatSaves: DEFAULT_USAGE_STATS.aiChatSaves,
        fragmentSaves: DEFAULT_USAGE_STATS.fragmentSaves,
        articleSaves: DEFAULT_USAGE_STATS.articleSaves,
        lastUpdatedISO: DEFAULT_USAGE_STATS.lastUpdatedISO,
        history: []
      });
    });

    section.destroy();
  });
});
