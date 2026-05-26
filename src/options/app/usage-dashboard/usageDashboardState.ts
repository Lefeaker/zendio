import type { UsageStats } from '@shared/types/usage';
import { DEFAULT_USAGE_STATS, normalizeUsageStats } from '@shared/constants';
import type { CompleteOptions } from '@shared/types/options';
import type { IMessagingRepository } from '@shared/repositories';

export interface UsageSnapshot {
  aiChat: number;
  fragment: number;
  article: number;
}

export interface UsageStatsEventDetail extends UsageStats {
  total: number;
}

export function cloneDefaultUsageStats(): UsageStats {
  return {
    aiChatSaves: DEFAULT_USAGE_STATS.aiChatSaves,
    fragmentSaves: DEFAULT_USAGE_STATS.fragmentSaves,
    articleSaves: DEFAULT_USAGE_STATS.articleSaves,
    lastUpdatedISO: DEFAULT_USAGE_STATS.lastUpdatedISO ?? null,
    history: [...DEFAULT_USAGE_STATS.history]
  };
}

export function resolveUsageStatsFromOptions(options: CompleteOptions | null): UsageStats {
  const snapshot = (options as (CompleteOptions & { usageStats?: unknown }) | null)?.usageStats;
  if (!snapshot) {
    return cloneDefaultUsageStats();
  }
  return normalizeUsageStats(snapshot);
}

export function createUsageStatsEventDetail(
  stats: UsageStats,
  total: number
): UsageStatsEventDetail {
  const normalized = normalizeUsageStats(stats);
  return Object.freeze({
    ...normalized,
    history: [...normalized.history],
    total
  });
}

export function emitUsageStatsWindowEvent(stats: UsageStats, total: number): void {
  window.dispatchEvent(
    new CustomEvent('aiob-usage-stats', { detail: createUsageStatsEventDetail(stats, total) })
  );
}

export function buildUsageSnapshot(stats: UsageStats): UsageSnapshot {
  return {
    aiChat: stats.aiChatSaves,
    fragment: stats.fragmentSaves,
    article: stats.articleSaves
  };
}

export function reportUsageIncrementChanges(args: {
  messagingRepo: IMessagingRepository;
  previous: UsageSnapshot | null;
  current: UsageSnapshot;
  onError?: (error: unknown) => void;
}): UsageSnapshot {
  const { messagingRepo, previous, current, onError } = args;
  if (!previous) {
    return current;
  }

  const deltas: Array<{
    category: 'ai_chat' | 'fragment' | 'article';
    increment: number;
    total: number;
  }> = [
    { category: 'ai_chat', increment: current.aiChat - previous.aiChat, total: current.aiChat },
    {
      category: 'fragment',
      increment: current.fragment - previous.fragment,
      total: current.fragment
    },
    { category: 'article', increment: current.article - previous.article, total: current.article }
  ];

  deltas.forEach(({ category, increment, total }) => {
    if (increment <= 0) {
      return;
    }
    void messagingRepo
      .send({
        type: 'track',
        event: 'usage_dashboard_increment',
        params: {
          category,
          increment,
          total_after: total
        }
      })
      .catch((error) => {
        onError?.(error);
      });
  });

  return current;
}
