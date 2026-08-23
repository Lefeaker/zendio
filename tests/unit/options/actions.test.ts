import { describe, expect, it, vi } from 'vitest';
import type { UsageStats } from '../../../src/shared/types/usage';
import {
  persistPrivacyConsentAction,
  resetUsageStatsAction
} from '../../../src/options/app/actions';

describe('options app actions', () => {
  it('persists privacy consent snapshots via explicit action', async () => {
    const patch = vi.fn(() => Promise.resolve({} as never));
    await persistPrivacyConsentAction(
      {
        analytics: true,
        errorReporting: false,
        debugMode: false
      },
      {
        optionsRepository: { patch }
      }
    );

    expect(patch).toHaveBeenCalledWith([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: false },
      { path: ['privacyPreferences', 'debugMode'], value: false }
    ]);
  });

  it('resets usage stats through the background client before analytics', async () => {
    const send = vi.fn(async <T>() => undefined as T);
    const stats: UsageStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };

    const reset = vi.fn(() => Promise.resolve(stats));

    await expect(
      resetUsageStatsAction({
        usageStatsClient: { get: vi.fn(() => Promise.resolve(stats)), reset },
        messagingRepository: {
          send: send as unknown as <T>(message: unknown) => Promise<T>
        },
        now: () => 123
      })
    ).resolves.toEqual(stats);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'clear_stats',
      params: { timestamp: 123 }
    });
  });
});
