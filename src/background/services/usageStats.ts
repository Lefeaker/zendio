import type { ClipPayload, UsageStats } from '../../shared/types';
import { DEFAULT_USAGE_STATS, USAGE_STATS_STORAGE_KEY } from '../../shared/constants';
import type { StorageService } from '../../platform/interfaces/storage';
import { PlatformError } from '../../platform/errors';
import { registry, TOKENS } from '../../shared/di';
import type { UsageStatsErrorCode } from '../../shared/types/usageStatsMessages';
import { ChromeOptionsRepository } from '../../infrastructure/repositories/ChromeOptionsRepository';
import {
  OptionsMutationCoordinator,
  createOptionsMutationCoordinator
} from './optionsMutationCoordinator';
import {
  cloneUsageStats,
  isCanonicalUsageStats,
  normalizeLegacyUsageStatsCandidate,
  resolveUsageCategory,
  updateUsageHistory,
  usageStatsEqual
} from './usageStatsModel';

const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';
type UntrustedValue = unknown;

export class UsageStatsStoreError extends Error {
  constructor(readonly code: UsageStatsErrorCode) {
    super(code);
    this.name = 'UsageStatsStoreError';
  }
}

/** One FIFO owner for usage read, migration, record, and reset. */
export class UsageStatsStore {
  private memoryStats: UsageStats = cloneUsageStats(DEFAULT_USAGE_STATS);
  private tail: Promise<void> = Promise.resolve();
  private volatileDirty = false;
  private migrationSettled = false;

  constructor(
    private readonly storage: StorageService,
    private readonly optionsCoordinator: OptionsMutationCoordinator
  ) {}

  getStats(): Promise<UsageStats> {
    return this.enqueue(async () => {
      if (this.volatileDirty) return cloneUsageStats(this.memoryStats);
      return cloneUsageStats(await this.loadAndMigrate());
    });
  }

  recordUsage(payload: ClipPayload): Promise<UsageStats | null> {
    const category = resolveUsageCategory(payload);
    if (!category) return Promise.resolve(null);
    return this.enqueue(async () => {
      const current = this.volatileDirty
        ? cloneUsageStats(this.memoryStats)
        : await this.loadAndMigrate();
      const updated: UsageStats = {
        ...current,
        aiChatSaves: current.aiChatSaves + (category === 'ai_chat' ? 1 : 0),
        fragmentSaves: current.fragmentSaves + (category === 'fragment' ? 1 : 0),
        articleSaves: current.articleSaves + (category === 'article' ? 1 : 0),
        lastUpdatedISO: new Date().toISOString(),
        history: updateUsageHistory(current.history, category)
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
      return cloneUsageStats(updated);
    });
  }

  resetStats(): Promise<UsageStats> {
    return this.enqueue(async () => {
      const reset = cloneUsageStats(DEFAULT_USAGE_STATS);
      await this.persistCanonical(reset);
      this.volatileDirty = false;
      this.updateMemoryStats(reset);
      return cloneUsageStats(reset);
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
        return cloneUsageStats(this.memoryStats);
      }
      throw new UsageStatsStoreError('USAGE_STATS_STORAGE_FAILURE');
    }

    const canonical = local[USAGE_STATS_STORAGE_KEY];
    if (canonical !== undefined) {
      if (!isCanonicalUsageStats(canonical)) {
        throw new UsageStatsStoreError('USAGE_STATS_CANONICAL_INVALID');
      }
      const stats = cloneUsageStats(canonical);
      this.updateMemoryStats(stats);
      if (!this.migrationSettled) await this.cleanupLegacySources();
      return stats;
    }

    const localLegacy = normalizeLegacyUsageStatsCandidate(local[LEGACY_USAGE_STATS_STORAGE_KEY]);
    const optionsLegacy = localLegacy
      ? null
      : normalizeLegacyUsageStatsCandidate(await this.optionsCoordinator.readLegacyUsageStats());
    const selected = localLegacy ?? optionsLegacy ?? cloneUsageStats(DEFAULT_USAGE_STATS);
    this.updateMemoryStats(selected);

    try {
      await this.persistCanonical(selected);
    } catch {
      return cloneUsageStats(selected);
    }
    await this.cleanupLegacySources();
    return cloneUsageStats(selected);
  }

  private async persistCanonical(stats: UsageStats): Promise<void> {
    try {
      await this.storage.local.set(USAGE_STATS_STORAGE_KEY, cloneUsageStats(stats));
      const readback = await this.storage.local.get<UntrustedValue>(USAGE_STATS_STORAGE_KEY);
      if (!isCanonicalUsageStats(readback) || !usageStatsEqual(readback, stats)) {
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
    this.memoryStats = cloneUsageStats(stats);
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

function isRecoverableStorageError(error: UntrustedValue): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No SW') || message.includes('No service worker');
}

function isChromeUnavailableError(error: UntrustedValue): boolean {
  return error instanceof PlatformError && error.code === 'CHROME_UNAVAILABLE';
}
