import type { UsageStats, UsageStatsHistoryEntry } from '../types';

export const USAGE_STATS_STORAGE_KEY = 'usageStats';

export const DEFAULT_USAGE_STATS: UsageStats = {
  aiChatSaves: 0,
  fragmentSaves: 0,
  articleSaves: 0,
  lastUpdatedISO: null,
  history: []
};

export function normalizeUsageStats(input: unknown): UsageStats {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_USAGE_STATS };
  }

  const candidate = input as Partial<UsageStats>;

  const history = Array.isArray(candidate.history)
    ? candidate.history
        .map(normalizeHistoryEntry)
        .filter((entry): entry is UsageStatsHistoryEntry => entry !== null)
    : [];

  return {
    aiChatSaves: coerceCount(candidate.aiChatSaves),
    fragmentSaves: coerceCount(candidate.fragmentSaves),
    articleSaves: coerceCount(candidate.articleSaves),
    lastUpdatedISO: typeof candidate.lastUpdatedISO === 'string' ? candidate.lastUpdatedISO : null,
    history
  };
}

function coerceCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeHistoryEntry(entry: unknown): UsageStatsHistoryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const { date, aiChat, fragment, article } = entry as Partial<UsageStatsHistoryEntry> &
    Record<string, unknown>;

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return {
    date,
    aiChat: coerceCount(aiChat),
    fragment: coerceCount(fragment),
    article: coerceCount(article)
  };
}
