import type { ClipPayload } from '../../shared/types';
import type { UsageStats, UsageStatCategory, UsageStatsHistoryEntry } from '../../shared/types';
import { USAGE_STATS_STORAGE_KEY, DEFAULT_USAGE_STATS, normalizeUsageStats } from '../../shared/constants';

let memoryStats: UsageStats = { ...DEFAULT_USAGE_STATS };

export async function getUsageStats(): Promise<UsageStats> {
  const storage = getLocalStorageArea();
  if (!storage) {
    return {
      ...memoryStats,
      history: memoryStats.history.map(entry => ({ ...entry }))
    };
  }

  const stored = await storage.get(USAGE_STATS_STORAGE_KEY);
  const rawValue = stored[USAGE_STATS_STORAGE_KEY];
  return normalizeUsageStats(rawValue);
}

export async function recordClipUsage(payload: ClipPayload): Promise<UsageStats | null> {
  const category = resolveUsageCategory(payload);
  if (!category) {
    return null;
  }

  const current = await getUsageStats();
  const history = updateHistory(current.history ?? [], category);
  const updated: UsageStats = {
    ...current,
    aiChatSaves: current.aiChatSaves + (category === 'ai_chat' ? 1 : 0),
    fragmentSaves: current.fragmentSaves + (category === 'fragment' ? 1 : 0),
    articleSaves: current.articleSaves + (category === 'article' ? 1 : 0),
    lastUpdatedISO: new Date().toISOString(),
    history
  };

  const storage = getLocalStorageArea();
  if (storage) {
    await storage.set({ [USAGE_STATS_STORAGE_KEY]: updated });
  } else {
    memoryStats = {
      ...updated,
      history: updated.history.map(entry => ({ ...entry }))
    };
  }
  return updated;
}

export async function ensureUsageStatsInitialized(): Promise<void> {
  const storage = getLocalStorageArea();
  if (storage) {
    const stored = await storage.get(USAGE_STATS_STORAGE_KEY);
    if (!stored[USAGE_STATS_STORAGE_KEY]) {
      await storage.set({ [USAGE_STATS_STORAGE_KEY]: { ...DEFAULT_USAGE_STATS } });
    }
  } else {
    memoryStats = {
      ...DEFAULT_USAGE_STATS,
      history: []
    };
  }
}

function resolveUsageCategory(payload: ClipPayload): UsageStatCategory {
  const clipType = payload.type;
  if (clipType === 'ai_chat') {
    return 'ai_chat';
  }
  if (clipType === 'clipper' || clipType === 'fragment') {
    return 'fragment';
  }
  return 'article';
}

function getLocalStorageArea(): chrome.storage.LocalStorageArea | null {
  if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
    return null;
  }
  return chrome.storage.local;
}

function updateHistory(
  history: UsageStatsHistoryEntry[] | undefined,
  category: UsageStatCategory
): UsageStatsHistoryEntry[] {
  const today = formatDate(new Date());
  const safeHistory = Array.isArray(history) ? history.map(entry => ({ ...entry })) : [];
  const historyMap = new Map<string, UsageStatsHistoryEntry>();

  for (const entry of safeHistory) {
    if (entry?.date) {
      historyMap.set(entry.date, {
        date: entry.date,
        aiChat: entry.aiChat ?? 0,
        fragment: entry.fragment ?? 0,
        article: entry.article ?? 0
      });
    }
  }

  const todayEntry = historyMap.get(today) ?? {
    date: today,
    aiChat: 0,
    fragment: 0,
    article: 0
  };

  switch (category) {
    case 'ai_chat':
      todayEntry.aiChat += 1;
      break;
    case 'fragment':
      todayEntry.fragment += 1;
      break;
    case 'article':
      todayEntry.article += 1;
      break;
  }

  historyMap.set(today, todayEntry);

  const sorted = Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = trimHistory(sorted, 30);
  return trimmed;
}

function trimHistory(entries: UsageStatsHistoryEntry[], limit: number): UsageStatsHistoryEntry[] {
  if (!entries.length) {
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (limit - 1));
  const cutoffStr = formatDate(cutoff);

  const filtered = entries.filter(entry => entry.date >= cutoffStr);
  if (filtered.length > limit) {
    return filtered.slice(filtered.length - limit);
  }
  return filtered;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
