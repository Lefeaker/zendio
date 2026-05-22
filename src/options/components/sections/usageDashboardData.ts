import type { StorageService } from '@platform/interfaces/storage';
import type { CompleteOptions } from '@shared/types/options';
import type { UsageStats } from '@shared/types/usage';
import { normalizeUsageStats, USAGE_STATS_STORAGE_KEY } from '@shared/constants';
import { resolveUsageStatsFromOptions } from '@options/app/usage-dashboard';

const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';

export function subscribeToUsageStorage(
  storage: StorageService,
  onChange: (value: UsageStats | undefined) => void
): () => void {
  const stopCurrent = storage.local.watchKey<UsageStats>(USAGE_STATS_STORAGE_KEY, onChange);
  const stopLegacy = storage.local.watchKey<UsageStats>(LEGACY_USAGE_STATS_STORAGE_KEY, onChange);

  return () => {
    stopCurrent();
    stopLegacy();
  };
}

export async function readUsageStatsFromStorage(
  storage: StorageService
): Promise<UsageStats | null> {
  try {
    const stored = await storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY);
    if (stored) {
      return normalizeUsageStats(stored);
    }

    const legacyStored = await storage.local.get<UsageStats>(LEGACY_USAGE_STATS_STORAGE_KEY);
    return legacyStored ? normalizeUsageStats(legacyStored) : null;
  } catch (error) {
    console.debug('[UsageSection] Failed to read usage stats from local storage:', error);
    return null;
  }
}

export async function resolveUsageStatsSnapshot(
  storage: StorageService,
  options: CompleteOptions | null
): Promise<UsageStats> {
  const localStats = await readUsageStatsFromStorage(storage);
  if (localStats) {
    return localStats;
  }
  return resolveUsageStatsFromOptions(options);
}
