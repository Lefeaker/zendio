import type {
  ClipPayload,
  UsageStatCategory,
  UsageStats,
  UsageStatsHistoryEntry
} from '../../shared/types';
import {
  DEFAULT_USAGE_STATS,
  USAGE_STATS_STORAGE_KEY,
  normalizeUsageStats
} from '../../shared/constants';
import { isObjectRecord, type RuntimePropertyValue } from '../../shared/guards/object';
import type { StorageService } from '../../platform/interfaces/storage';
import { PlatformError } from '../../platform/errors';
import { registry, TOKENS } from '../../shared/di';
import type { UsageStatsErrorCode } from '../../shared/types/usageStatsMessages';
import { ChromeOptionsRepository } from '../../infrastructure/repositories/ChromeOptionsRepository';
import {
  OptionsMutationCoordinator,
  createOptionsMutationCoordinator
} from './optionsMutationCoordinator';

const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';
type UntrustedValue = Parameters<typeof normalizeUsageStats>[0];

export class UsageStatsStoreError extends Error {
  constructor(readonly code: UsageStatsErrorCode) {
    super(code);
    this.name = 'UsageStatsStoreError';
  }
}

function cloneStats(stats: UsageStats): UsageStats {
  return {
    ...stats,
    history: stats.history.map((entry) => ({ ...entry }))
  };
}

function statsEqual(left: UsageStats, right: UsageStats): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasExactKeys(value: Record<string, RuntimePropertyValue>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isCount(value: RuntimePropertyValue): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isHistoryEntry(value: RuntimePropertyValue): value is UsageStatsHistoryEntry {
  return (
    isObjectRecord(value) &&
    hasExactKeys(value, ['date', 'aiChat', 'fragment', 'article']) &&
    typeof value.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value.date) &&
    isCount(value.aiChat) &&
    isCount(value.fragment) &&
    isCount(value.article)
  );
}

function isUsageStats(value: UntrustedValue): value is UsageStats {
  return (
    isObjectRecord(value) &&
    hasExactKeys(value, [
      'aiChatSaves',
      'fragmentSaves',
      'articleSaves',
      'lastUpdatedISO',
      'history'
    ]) &&
    isCount(value.aiChatSaves) &&
    isCount(value.fragmentSaves) &&
    isCount(value.articleSaves) &&
    (value.lastUpdatedISO === null || typeof value.lastUpdatedISO === 'string') &&
    Array.isArray(value.history) &&
    value.history.every(isHistoryEntry)
  );
}

function legacyCandidate(value: UntrustedValue): UsageStats | null {
  return typeof value === 'object' && value !== null ? normalizeUsageStats(value) : null;
}

/** One FIFO owner for usage read, migration, record, and reset. */
export class UsageStatsStore {
  private memoryStats: UsageStats = cloneStats(DEFAULT_USAGE_STATS);
  private tail: Promise<void> = Promise.resolve();
  private volatileDirty = false;
  private migrationSettled = false;

  constructor(
    private readonly storage: StorageService,
    private readonly optionsCoordinator: OptionsMutationCoordinator
  ) {}

  getStats(): Promise<UsageStats> {
    return this.enqueue(async () => {
      if (this.volatileDirty) return cloneStats(this.memoryStats);
      return cloneStats(await this.loadAndMigrate());
    });
  }

  recordUsage(payload: ClipPayload): Promise<UsageStats | null> {
    const category = resolveUsageCategory(payload);
    if (!category) return Promise.resolve(null);
    return this.enqueue(async () => {
      const current = this.volatileDirty
        ? cloneStats(this.memoryStats)
        : await this.loadAndMigrate();
      const updated: UsageStats = {
        ...current,
        aiChatSaves: current.aiChatSaves + (category === 'ai_chat' ? 1 : 0),
        fragmentSaves: current.fragmentSaves + (category === 'fragment' ? 1 : 0),
        articleSaves: current.articleSaves + (category === 'article' ? 1 : 0),
        lastUpdatedISO: new Date().toISOString(),
        history: updateHistory(current.history, category)
      };
      try {
        await this.persistCanonical(updated);
        this.volatileDirty = false;
      } catch (error) {
        this.volatileDirty = true;
        console.warn('[UsageStats] Canonical record write failed; retaining queued memory state.');
        void error;
      }
      this.updateMemoryStats(updated);
      return cloneStats(updated);
    });
  }

  resetStats(): Promise<UsageStats> {
    return this.enqueue(async () => {
      const reset = cloneStats(DEFAULT_USAGE_STATS);
      await this.persistCanonical(reset);
      this.volatileDirty = false;
      this.updateMemoryStats(reset);
      return cloneStats(reset);
    });
  }

  initialize(): Promise<void> {
    return this.enqueue(async () => {
      await this.loadAndMigrate();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.tail.then(operation);
    this.tail = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  private async loadAndMigrate(): Promise<UsageStats> {
    let local: Record<string, UntrustedValue>;
    try {
      local = await this.storage.local.getMany<UntrustedValue>([
        USAGE_STATS_STORAGE_KEY,
        LEGACY_USAGE_STATS_STORAGE_KEY
      ]);
    } catch (error) {
      if (isRecoverableStorageError(error) || isChromeUnavailableError(error)) {
        return cloneStats(this.memoryStats);
      }
      throw new UsageStatsStoreError('USAGE_STATS_STORAGE_FAILURE');
    }

    const canonical = local[USAGE_STATS_STORAGE_KEY];
    if (canonical !== undefined) {
      if (!isUsageStats(canonical)) {
        throw new UsageStatsStoreError('USAGE_STATS_CANONICAL_INVALID');
      }
      const stats = cloneStats(canonical);
      this.updateMemoryStats(stats);
      if (!this.migrationSettled) await this.cleanupLegacySources();
      return stats;
    }

    const localLegacy = legacyCandidate(local[LEGACY_USAGE_STATS_STORAGE_KEY]);
    const optionsLegacy = localLegacy
      ? null
      : legacyCandidate(await this.optionsCoordinator.readLegacyUsageStats());
    const selected = localLegacy ?? optionsLegacy ?? cloneStats(DEFAULT_USAGE_STATS);
    this.updateMemoryStats(selected);

    try {
      await this.persistCanonical(selected);
    } catch {
      return cloneStats(selected);
    }
    await this.cleanupLegacySources();
    return cloneStats(selected);
  }

  private async persistCanonical(stats: UsageStats): Promise<void> {
    try {
      await this.storage.local.set(USAGE_STATS_STORAGE_KEY, cloneStats(stats));
      const readback = await this.storage.local.get<UntrustedValue>(USAGE_STATS_STORAGE_KEY);
      if (!isUsageStats(readback) || !statsEqual(readback, stats)) {
        throw new UsageStatsStoreError('USAGE_STATS_STORAGE_FAILURE');
      }
    } catch (error) {
      if (error instanceof UsageStatsStoreError) throw error;
      throw new UsageStatsStoreError('USAGE_STATS_STORAGE_FAILURE');
    }
  }

  private async cleanupLegacySources(): Promise<void> {
    const cleanups = [
      this.storage.local.remove(LEGACY_USAGE_STATS_STORAGE_KEY),
      this.optionsCoordinator.deleteLegacyUsageStatsRoot().then(() => undefined)
    ];
    const results = await Promise.allSettled(cleanups);
    if (results.some((result) => result.status === 'rejected')) {
      console.warn('[UsageStats] Legacy cleanup remains pending after canonical verification.');
      return;
    }
    this.migrationSettled = true;
  }

  private updateMemoryStats(stats: UsageStats): void {
    this.memoryStats = cloneStats(stats);
  }
}

let usageStatsStorage: StorageService | null = null;
let usageStatsOptionsCoordinator: OptionsMutationCoordinator | null = null;

export function configureUsageStatsStorage(
  storage: StorageService,
  optionsCoordinator?: OptionsMutationCoordinator
): void {
  usageStatsStorage = storage;
  usageStatsOptionsCoordinator =
    optionsCoordinator ?? createOptionsMutationCoordinator(new ChromeOptionsRepository(storage));
}

function requireUsageStatsStorage(): StorageService {
  if (!usageStatsStorage) throw new Error('[UsageStats] StorageService is not configured.');
  return usageStatsStorage;
}

function requireOptionsCoordinator(): OptionsMutationCoordinator {
  if (!usageStatsOptionsCoordinator) {
    throw new Error('[UsageStats] Options mutation coordinator is not configured.');
  }
  return usageStatsOptionsCoordinator;
}

export function createUsageStatsStore(): UsageStatsStore {
  return new UsageStatsStore(requireUsageStatsStorage(), requireOptionsCoordinator());
}

export function getUsageStatsStore(): UsageStatsStore {
  if (!registry.has(TOKENS.usageStatsStore)) {
    registry.register(TOKENS.usageStatsStore, createUsageStatsStore);
  }
  return registry.resolve<UsageStatsStore>(TOKENS.usageStatsStore);
}

export async function getUsageStats(): Promise<UsageStats> {
  return getUsageStatsStore().getStats();
}

export async function resetUsageStats(): Promise<UsageStats> {
  return getUsageStatsStore().resetStats();
}

export async function recordClipUsage(payload: ClipPayload): Promise<UsageStats | null> {
  return getUsageStatsStore().recordUsage(payload);
}

export async function ensureUsageStatsInitialized(): Promise<void> {
  await getUsageStatsStore().initialize();
}

function resolveUsageCategory(payload: ClipPayload): UsageStatCategory {
  if (payload.type === 'ai_chat') return 'ai_chat';
  if (payload.type === 'clipper' || payload.type === 'fragment' || payload.type === 'video') {
    return 'fragment';
  }
  return 'article';
}

function isRecoverableStorageError(error: UntrustedValue): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No SW') || message.includes('No service worker');
}

function isChromeUnavailableError(error: UntrustedValue): boolean {
  return error instanceof PlatformError && error.code === 'CHROME_UNAVAILABLE';
}

function updateHistory(
  history: UsageStatsHistoryEntry[] | undefined,
  category: UsageStatCategory
): UsageStatsHistoryEntry[] {
  const today = formatDate(new Date());
  const historyMap = new Map<string, UsageStatsHistoryEntry>();
  for (const entry of history ?? []) {
    if (!entry?.date) continue;
    historyMap.set(entry.date, {
      date: entry.date,
      aiChat: entry.aiChat ?? 0,
      fragment: entry.fragment ?? 0,
      article: entry.article ?? 0
    });
  }
  const todayEntry = historyMap.get(today) ?? {
    date: today,
    aiChat: 0,
    fragment: 0,
    article: 0
  };
  todayEntry[category === 'ai_chat' ? 'aiChat' : category] += 1;
  historyMap.set(today, todayEntry);
  return trimHistory(
    Array.from(historyMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
    30
  );
}

function trimHistory(entries: UsageStatsHistoryEntry[], limit: number): UsageStatsHistoryEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (limit - 1));
  const cutoffKey = formatDate(cutoff);
  const filtered = entries.filter((entry) => entry.date >= cutoffKey);
  return filtered.length > limit ? filtered.slice(filtered.length - limit) : filtered;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
