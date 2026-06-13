import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { createAnalyticsEventMessage } from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';

export interface ResetUsageStatsDependencies {
  optionsRepository: Pick<IOptionsRepository, 'set'>;
  storage: StorageService;
  messagingRepository: Pick<IMessagingRepository, 'send'>;
  storageKeys?: string[];
  now?: () => number;
}

export async function resetUsageStatsAction(
  stats: UsageStats,
  dependencies: ResetUsageStatsDependencies
): Promise<void> {
  const now = dependencies.now ?? Date.now;
  const storageKeys = dependencies.storageKeys ?? ['usageStats', 'usage_stats'];
  await dependencies.optionsRepository.set({ usageStats: stats });
  for (const key of storageKeys) {
    await dependencies.storage.local.set(key, stats);
  }
  await dependencies.messagingRepository.send(
    createAnalyticsEventMessage('clear_stats', { timestamp: now() })
  );
}
