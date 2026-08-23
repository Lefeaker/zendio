import type { IMessagingRepository } from '@shared/repositories';
import { createAnalyticsEventMessage } from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';
import type { UsageStatsClientLike } from '../usage-dashboard/usageStatsClient';

export interface ResetUsageStatsDependencies {
  usageStatsClient: UsageStatsClientLike;
  messagingRepository: Pick<IMessagingRepository, 'send'>;
  now?: () => number;
}

export async function resetUsageStatsAction(
  dependencies: ResetUsageStatsDependencies
): Promise<UsageStats> {
  const now = dependencies.now ?? Date.now;
  const stats = await dependencies.usageStatsClient.reset();
  await dependencies.messagingRepository.send(
    createAnalyticsEventMessage('clear_stats', { timestamp: now() })
  );
  return stats;
}
