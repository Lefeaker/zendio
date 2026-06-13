import { describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../../src/platform/interfaces/storage';
import type { UsageStats } from '../../../src/shared/types/usage';
import {
  persistPrivacyConsentAction,
  persistTransferLogAction,
  resetUsageStatsAction,
  runLanguagePreferenceAction
} from '../../../src/options/app/actions';

describe('options app actions', () => {
  it('runs language preference action and persists when requested', async () => {
    const changeLanguage = vi.fn(() => Promise.resolve());
    const set = vi.fn(() => Promise.resolve());

    await runLanguagePreferenceAction(
      'ja',
      {
        changeLanguage,
        optionsRepository: { set }
      },
      { persist: true }
    );

    expect(changeLanguage).toHaveBeenCalledWith('ja');
    expect(set).toHaveBeenCalledWith({
      languagePreference: {
        code: 'ja'
      }
    });
  });

  it('persists privacy consent snapshots via explicit action', async () => {
    const set = vi.fn(() => Promise.resolve());
    await persistPrivacyConsentAction(
      {
        analytics: true,
        errorReporting: false,
        debugMode: false
      },
      {
        optionsRepository: { set }
      }
    );

    expect(set).toHaveBeenCalledWith({
      privacyPreferences: {
        analytics: true,
        errorReporting: false,
        debugMode: false
      }
    });
  });

  it('resets usage stats across repo, local storage, and analytics message', async () => {
    const setRepo = vi.fn(() => Promise.resolve());
    const setLocal = vi.fn(() => Promise.resolve());
    const send = vi.fn(async <T>() => undefined as T);
    const stats: UsageStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };

    await resetUsageStatsAction(stats, {
      optionsRepository: { set: setRepo },
      storage: {
        local: {
          set: setLocal
        }
      } as unknown as StorageService,
      messagingRepository: {
        send: send as unknown as <T>(message: unknown) => Promise<T>
      },
      storageKeys: ['usageStats', 'usage_stats'],
      now: () => 123
    });

    expect(setRepo).toHaveBeenCalledWith({ usageStats: stats });
    expect(setLocal).toHaveBeenNthCalledWith(1, 'usageStats', stats);
    expect(setLocal).toHaveBeenNthCalledWith(2, 'usage_stats', stats);
    expect(send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'clear_stats',
      params: { timestamp: 123 }
    });
  });

  it('persists transfer log entries through explicit action', async () => {
    const set = vi.fn(() => Promise.resolve());
    const entry = await persistTransferLogAction('import', {
      optionsRepository: { set },
      now: () => 456
    });

    expect(entry).toEqual({ lastAction: 'import', timestamp: 456 });
    expect(set).toHaveBeenCalledWith({
      transferLog: {
        lastAction: 'import',
        timestamp: 456
      }
    });
  });
});
