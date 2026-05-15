import type { UsageStats, UsageStatsHistoryEntry } from '@shared/types/usage';

export function prepareUsageHistory(stats: UsageStats): UsageStatsHistoryEntry[] {
  const input = Array.isArray(stats.history) ? stats.history : [];
  const sorted = [...input].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    if (total === 0) {
      return [];
    }

    const fallbackDate = resolveUsageDateKey(stats.lastUpdatedISO);
    return [
      {
        date: fallbackDate,
        aiChat: stats.aiChatSaves,
        fragment: stats.fragmentSaves,
        article: stats.articleSaves
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
  const aggregateTotal = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
  if (aggregateTotal > 0 && timelineTotal === 0 && trimmed.length) {
    const lastIndex = trimmed.length - 1;
    const fallbackDate = resolveUsageDateKey(stats.lastUpdatedISO) || trimmed[lastIndex].date;
    trimmed[lastIndex] = {
      date: fallbackDate,
      aiChat: stats.aiChatSaves,
      fragment: stats.fragmentSaves,
      article: stats.articleSaves
    };
  }

  return trimmed;
}

function resolveUsageDateKey(source?: string | null): string {
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return formatUsageDate(parsed);
    }
  }
  return formatUsageDate(new Date());
}

function formatUsageDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}
