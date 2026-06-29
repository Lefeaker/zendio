import type { UsageStats, UsageStatsHistoryEntry } from '@shared/types/usage';
import { normalizeUsageStats } from '@shared/constants/usage';

export function prepareUsageHistory(stats: UsageStats): UsageStatsHistoryEntry[] {
  const normalizedStats = normalizeUsageStats(stats);
  const input = normalizedStats.history;
  const sorted = [...input].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    const total =
      normalizedStats.aiChatSaves + normalizedStats.fragmentSaves + normalizedStats.articleSaves;
    if (total === 0) {
      return [];
    }

    const fallbackDate = resolveUsageDateKey(normalizedStats.lastUpdatedISO);
    return [
      {
        date: fallbackDate,
        aiChat: normalizedStats.aiChatSaves,
        fragment: normalizedStats.fragmentSaves,
        article: normalizedStats.articleSaves
      }
    ];
  }

  const endDate = parseDateKey(sorted[sorted.length - 1].date) ?? new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29);

  const values = new Map<string, UsageStatsHistoryEntry>();
  sorted.forEach((entry) => {
    values.set(entry.date, { ...entry });
  });

  const timeline: UsageStatsHistoryEntry[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = formatUsageDate(cursor);
    const existing = values.get(key);
    timeline.push(existing ?? { date: key, aiChat: 0, fragment: 0, article: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const trimmed = timeline.slice(-30);
  const timelineTotal = trimmed.reduce(
    (sum, entry) => sum + entry.aiChat + entry.fragment + entry.article,
    0
  );
  const aggregateTotal =
    normalizedStats.aiChatSaves + normalizedStats.fragmentSaves + normalizedStats.articleSaves;
  if (aggregateTotal > 0 && timelineTotal === 0 && trimmed.length) {
    const lastIndex = trimmed.length - 1;
    const fallbackDate =
      resolveUsageDateKey(normalizedStats.lastUpdatedISO) || trimmed[lastIndex].date;
    trimmed[lastIndex] = {
      date: fallbackDate,
      aiChat: normalizedStats.aiChatSaves,
      fragment: normalizedStats.fragmentSaves,
      article: normalizedStats.articleSaves
    };
  }

  return trimmed;
}

export function resolveUsageDateKey(source?: string | null): string {
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return formatUsageDate(parsed);
    }
  }
  return formatUsageDate(new Date());
}

export function formatUsageDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}
