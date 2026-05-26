/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUsageSnapshot,
  emitUsageStatsWindowEvent,
  reportUsageIncrementChanges
} from '@options/app/usage-dashboard';
import { getInitialShellUsageStats } from '@options/app/optionsShellState';
import { DEFAULT_USAGE_STATS } from '@shared/constants';
import type { IMessagingRepository } from '@shared/repositories';
import type { UsageStats } from '@shared/types/usage';

function createUsageStats(overrides: Partial<UsageStats> = {}): UsageStats {
  return {
    aiChatSaves: 2,
    fragmentSaves: 3,
    articleSaves: 4,
    lastUpdatedISO: '2026-05-26T00:00:00.000Z',
    history: [{ date: '2026-05-26', aiChat: 2, fragment: 3, article: 4 }],
    ...overrides
  };
}

function createMessagingRepo(send = vi.fn(() => Promise.resolve(undefined))): IMessagingRepository {
  return {
    send: send as IMessagingRepository['send'],
    onMessage: vi.fn(() => () => undefined)
  };
}

describe('usage dashboard state bridge', () => {
  beforeEach(() => {
    delete (window as { aiobUsageStats?: unknown }).aiobUsageStats;
    vi.clearAllMocks();
  });

  it('dispatches a normalized immutable usage stats detail with total', () => {
    const stats = createUsageStats({ aiChatSaves: 1.8, articleSaves: -10 });
    const listener = vi.fn();
    window.addEventListener('aiob-usage-stats', listener);

    emitUsageStatsWindowEvent(stats, 9);
    stats.history.push({ date: '2026-05-27', aiChat: 99, fragment: 99, article: 99 });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<UsageStats & { total: number }>;
    expect(event.detail).toEqual({
      aiChatSaves: 1,
      fragmentSaves: 3,
      articleSaves: 0,
      lastUpdatedISO: '2026-05-26T00:00:00.000Z',
      history: [{ date: '2026-05-26', aiChat: 2, fragment: 3, article: 4 }],
      total: 9
    });
    expect(Object.isFrozen(event.detail)).toBe(true);
  });

  it('does not create or mutate window.aiobUsageStats', () => {
    const stats = createUsageStats();

    emitUsageStatsWindowEvent(stats, 9);

    expect((window as { aiobUsageStats?: unknown }).aiobUsageStats).toBeUndefined();
  });

  it('builds the usage snapshot category counts', () => {
    expect(buildUsageSnapshot(createUsageStats())).toEqual({
      aiChat: 2,
      fragment: 3,
      article: 4
    });
  });

  it('reports only positive usage deltas', () => {
    const send = vi.fn(() => Promise.resolve(undefined));
    const messagingRepo = createMessagingRepo(send);

    reportUsageIncrementChanges({
      messagingRepo,
      previous: { aiChat: 2, fragment: 5, article: 4 },
      current: { aiChat: 5, fragment: 5, article: 3 }
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'track',
      event: 'usage_dashboard_increment',
      params: { category: 'ai_chat', increment: 3, total_after: 5 }
    });
  });

  it('routes rejected usage report sends to onError without throwing', async () => {
    const error = new Error('send failed');
    const messagingRepo = createMessagingRepo(vi.fn(() => Promise.reject(error)));
    const onError = vi.fn();

    expect(() =>
      reportUsageIncrementChanges({
        messagingRepo,
        previous: { aiChat: 0, fragment: 0, article: 0 },
        current: { aiChat: 1, fragment: 0, article: 0 },
        onError
      })
    ).not.toThrow();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('keeps getInitialShellUsageStats as a default-only compatibility helper', () => {
    (window as { aiobUsageStats?: unknown }).aiobUsageStats = createUsageStats({
      aiChatSaves: 99,
      fragmentSaves: 99,
      articleSaves: 99
    });

    expect(getInitialShellUsageStats()).toEqual(DEFAULT_USAGE_STATS);
  });
});
