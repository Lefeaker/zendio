import { describe, expect, it } from 'vitest';
import { prepareUsageHistory } from '@options/stitch/usageHistory';
import { prepareHistory } from '@ui/domains/usage-chart';
import type { UsageStats } from '@shared/types/usage';

describe('Stitch usage history', () => {
  it('pads usage stats to the latest 30 day production overview window', () => {
    const history = prepareUsageHistory({
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: '2026-05-15T12:00:00.000Z',
      history: [
        { date: '2026-05-01', aiChat: 1, fragment: 0, article: 0 },
        { date: '2026-05-15', aiChat: 0, fragment: 2, article: 3 }
      ]
    } satisfies UsageStats);

    expect(history).toHaveLength(30);
    expect(history[0]).toEqual({ date: '2026-04-16', aiChat: 0, fragment: 0, article: 0 });
    expect(history.at(-1)).toEqual({ date: '2026-05-15', aiChat: 0, fragment: 2, article: 3 });
  });

  it('creates a single fallback entry from aggregate totals when history is absent', () => {
    const legacyStats = {
      aiChatSaves: 2,
      fragmentSaves: 1,
      articleSaves: 3,
      lastUpdatedISO: '2026-05-15T12:00:00.000Z'
    } as UsageStats;

    expect(prepareUsageHistory(legacyStats)).toEqual([
      { date: '2026-05-15', aiChat: 2, fragment: 1, article: 3 }
    ]);
    expect(prepareHistory(legacyStats)).toEqual(prepareUsageHistory(legacyStats));
  });
});
