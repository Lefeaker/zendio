export type UsageStatCategory = 'ai_chat' | 'fragment' | 'article';

export interface UsageStatsHistoryEntry {
  date: string; // YYYY-MM-DD
  aiChat: number;
  fragment: number;
  article: number;
}

export interface UsageStats {
  aiChatSaves: number;
  fragmentSaves: number;
  articleSaves: number;
  lastUpdatedISO?: string | null;
  history: UsageStatsHistoryEntry[];
}
