import { normalizeUsageStats } from '../../shared/constants';
import { isObjectRecord, type RuntimePropertyValue } from '../../shared/guards/object';
import type {
  ClipPayload,
  UsageStatCategory,
  UsageStats,
  UsageStatsHistoryEntry
} from '../../shared/types';

export function cloneUsageStats(stats: UsageStats): UsageStats {
  return {
    ...stats,
    history: stats.history.map((entry) => ({ ...entry }))
  };
}

export function usageStatsEqual(left: UsageStats, right: UsageStats): boolean {
  return JSON.stringify(normalizeUsageStats(left)) === JSON.stringify(normalizeUsageStats(right));
}

function hasExactKeys(
  value: Record<string, RuntimePropertyValue>,
  expected: readonly string[]
): boolean {
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

export function isCanonicalUsageStats(value: unknown): value is UsageStats {
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

export function normalizeLegacyUsageStatsCandidate(value: unknown): UsageStats | null {
  return typeof value === 'object' && value !== null ? normalizeUsageStats(value) : null;
}

export function resolveUsageCategory(payload: ClipPayload): UsageStatCategory {
  if (payload.type === 'ai_chat') return 'ai_chat';
  if (payload.type === 'clipper' || payload.type === 'fragment' || payload.type === 'video') {
    return 'fragment';
  }
  return 'article';
}

export function updateUsageHistory(
  history: UsageStatsHistoryEntry[] | undefined,
  category: UsageStatCategory,
  now = new Date()
): UsageStatsHistoryEntry[] {
  const today = formatDate(now);
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
    30,
    now
  );
}

function trimHistory(
  entries: UsageStatsHistoryEntry[],
  limit: number,
  now: Date
): UsageStatsHistoryEntry[] {
  const cutoff = new Date(now);
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
