import type { ClipPayload } from '../../shared/types';
import type { UsageStats, UsageStatCategory, UsageStatsHistoryEntry } from '../../shared/types';
import {
  USAGE_STATS_STORAGE_KEY,
  DEFAULT_USAGE_STATS,
  normalizeUsageStats
} from '../../shared/constants';
import type { StorageService } from '../../platform/interfaces/storage';
import { PlatformError } from '../../platform/errors';
import { registry, TOKENS } from '../../shared/di';

/**
 * 使用统计存储类
 * 管理内存缓存和持久化存储
 */
export class UsageStatsStore {
  private memoryStats: UsageStats = cloneStats(DEFAULT_USAGE_STATS);
  private static readonly LEGACY_STORAGE_KEY = 'usage_stats';

  constructor(private readonly storage: StorageService) {}

  async getStats(): Promise<UsageStats> {
    try {
      const stored = await this.storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY);
      const legacyStored =
        stored ?? (await this.storage.local.get<UsageStats>(UsageStatsStore.LEGACY_STORAGE_KEY));
      const normalized = normalizeUsageStats(legacyStored);
      this.updateMemoryStats(normalized);
      if (!stored && legacyStored) {
        void this.persistStats(normalized);
      }
      return cloneStats(this.memoryStats);
    } catch (error) {
      if (isRecoverableStorageError(error) || isChromeUnavailableError(error)) {
        return cloneStats(this.memoryStats);
      }
      throw error;
    }
  }

  async recordUsage(payload: ClipPayload): Promise<UsageStats | null> {
    const category = resolveUsageCategory(payload);
    if (!category) {
      return null;
    }

    const current = await this.getStats();
    const history = updateHistory(current.history ?? [], category);
    const updated: UsageStats = {
      ...current,
      aiChatSaves: current.aiChatSaves + (category === 'ai_chat' ? 1 : 0),
      fragmentSaves: current.fragmentSaves + (category === 'fragment' ? 1 : 0),
      articleSaves: current.articleSaves + (category === 'article' ? 1 : 0),
      lastUpdatedISO: new Date().toISOString(),
      history
    };

    await this.persistStats(updated);
    this.updateMemoryStats(updated);
    return updated;
  }

  async initialize(): Promise<void> {
    try {
      const stored = await this.storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY);
      const legacyStored =
        stored ?? (await this.storage.local.get<UsageStats>(UsageStatsStore.LEGACY_STORAGE_KEY));
      if (!stored && !legacyStored) {
        await this.persistStats(DEFAULT_USAGE_STATS);
        this.updateMemoryStats(DEFAULT_USAGE_STATS);
        return;
      }
      const normalized = normalizeUsageStats(legacyStored);
      this.updateMemoryStats(normalized);
      if (!stored && legacyStored) {
        void this.persistStats(normalized);
      }
    } catch (error) {
      if (isRecoverableStorageError(error) || isChromeUnavailableError(error)) {
        this.updateMemoryStats(DEFAULT_USAGE_STATS);
        return;
      }
      throw error;
    }
  }

  private async persistStats(stats: UsageStats): Promise<void> {
    const targets = [USAGE_STATS_STORAGE_KEY, UsageStatsStore.LEGACY_STORAGE_KEY];

    for (const key of targets) {
      try {
        await this.storage.local.set(key, stats);
      } catch (error) {
        if (!isRecoverableStorageError(error) && !isChromeUnavailableError(error)) {
          console.warn(
            `[UsageStats] Failed to persist stats for key ${key}, using in-memory fallback:`,
            error
          );
        }
      }
    }
  }

  private updateMemoryStats(stats: UsageStats): void {
    this.memoryStats = cloneStats(stats);
  }
}

let usageStatsStorage: StorageService | null = null;

export function configureUsageStatsStorage(storage: StorageService): void {
  usageStatsStorage = storage;
}

function requireUsageStatsStorage(): StorageService {
  if (!usageStatsStorage) {
    throw new Error('[UsageStats] StorageService is not configured.');
  }
  return usageStatsStorage;
}

/**
 * 创建UsageStatsStore实例的工厂函数
 */
export function createUsageStatsStore(): UsageStatsStore {
  return new UsageStatsStore(requireUsageStatsStorage());
}

/**
 * 获取UsageStatsStore实例
 * 使用依赖注入容器获取实例
 */
export function getUsageStatsStore(): UsageStatsStore {
  if (!registry.has(TOKENS.usageStatsStore)) {
    registry.register(TOKENS.usageStatsStore, createUsageStatsStore);
  }
  return registry.resolve<UsageStatsStore>(TOKENS.usageStatsStore);
}

/**
 * 获取使用统计数据的便捷函数
 */
export async function getUsageStats(): Promise<UsageStats> {
  const store = getUsageStatsStore();
  return store.getStats();
}

/**
 * 记录剪藏使用的便捷函数
 */
export async function recordClipUsage(payload: ClipPayload): Promise<UsageStats | null> {
  const store = getUsageStatsStore();
  return store.recordUsage(payload);
}

/**
 * 确保使用统计已初始化的便捷函数
 */
export async function ensureUsageStatsInitialized(): Promise<void> {
  const store = getUsageStatsStore();
  return store.initialize();
}

function resolveUsageCategory(payload: ClipPayload): UsageStatCategory {
  const clipType = payload.type;
  if (clipType === 'ai_chat') {
    return 'ai_chat';
  }
  if (clipType === 'clipper' || clipType === 'fragment' || clipType === 'video') {
    return 'fragment';
  }
  return 'article';
}

function cloneStats(stats: UsageStats): UsageStats {
  return {
    ...stats,
    history: Array.isArray(stats.history) ? stats.history.map((entry) => ({ ...entry })) : []
  };
}

// 移除全局的updateMemoryStats函数，现在由UsageStatsStore类管理

function isRecoverableStorageError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (!message) {
    return false;
  }
  return message.includes('No SW') || message.includes('No service worker');
}

function isChromeUnavailableError(error: unknown): boolean {
  return error instanceof PlatformError && error.code === 'CHROME_UNAVAILABLE';
}

function updateHistory(
  history: UsageStatsHistoryEntry[] | undefined,
  category: UsageStatCategory
): UsageStatsHistoryEntry[] {
  const today = formatDate(new Date());
  const safeHistory = Array.isArray(history) ? history.map((entry) => ({ ...entry })) : [];
  const historyMap = new Map<string, UsageStatsHistoryEntry>();

  for (const entry of safeHistory) {
    if (entry?.date) {
      historyMap.set(entry.date, {
        date: entry.date,
        aiChat: entry.aiChat ?? 0,
        fragment: entry.fragment ?? 0,
        article: entry.article ?? 0
      });
    }
  }

  const todayEntry = historyMap.get(today) ?? {
    date: today,
    aiChat: 0,
    fragment: 0,
    article: 0
  };

  switch (category) {
    case 'ai_chat':
      todayEntry.aiChat += 1;
      break;
    case 'fragment':
      todayEntry.fragment += 1;
      break;
    case 'article':
      todayEntry.article += 1;
      break;
  }

  historyMap.set(today, todayEntry);

  const sorted = Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = trimHistory(sorted, 30);
  return trimmed;
}

function trimHistory(entries: UsageStatsHistoryEntry[], limit: number): UsageStatsHistoryEntry[] {
  if (!entries.length) {
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (limit - 1));
  const cutoffStr = formatDate(cutoff);

  const filtered = entries.filter((entry) => entry.date >= cutoffStr);
  if (filtered.length > limit) {
    return filtered.slice(filtered.length - limit);
  }
  return filtered;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
