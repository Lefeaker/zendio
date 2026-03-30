import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTrialConfig,
  setTrialConfig,
  initializeTrial,
  checkTrialStatus,
  formatRemainingTime,
  isFeatureAvailable,
  showExpirationNotice,
  clearTrialConfig,
  getTrialSummary,
  type TrialConfig
} from '../../../src/utils/trial-manager';

const manifest: chrome.runtime.Manifest = {
  manifest_version: 3,
  name: 'AiiinOB Test',
  version: '1.2.3'
};

type ChromeLike = typeof globalThis & {
  chrome: typeof chrome;
};

const runtime = globalThis as ChromeLike;

describe('trial-manager', () => {
  const storageGetMock = vi.fn();
  const storageSetMock = vi.fn();
  const storageRemoveMock = vi.fn();
  const storage = {
    get: storageGetMock,
    set: storageSetMock,
    remove: storageRemoveMock
  } as unknown as ChromeLike['chrome']['storage']['local'];
  const createNotificationMock = vi.fn();
  const notifications = { create: createNotificationMock } as unknown as NonNullable<ChromeLike['chrome']['notifications']>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T00:00:00Z'));
    runtime.chrome = {
      storage: { local: storage },
      runtime: {
        getManifest: vi.fn(() => manifest)
      },
      notifications
    } as unknown as typeof chrome;
  });

  it('reads and writes trial config', async () => {
    const config: TrialConfig = { isTrial: true, expirationTime: Date.now() + 1000, trialDays: 7, version: '1.0.0' };
    storageGetMock.mockResolvedValue({ trial_config: config });
    await expect(getTrialConfig()).resolves.toEqual(config);
    await setTrialConfig(config);
    expect(storageSetMock).toHaveBeenCalledWith({ trial_config: config });
  });

  it('initializes trial and computes active status and summaries', async () => {
    storageSetMock.mockResolvedValue(undefined);
    const config = await initializeTrial(3);
    expect(config.version).toBe('1.2.3');
    storageGetMock.mockResolvedValue({ trial_config: config });
    const status = await checkTrialStatus();
    expect(status.isTrial).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(formatRemainingTime(status)).toContain('剩余');
    await expect(isFeatureAvailable()).resolves.toBe(true);
    await expect(getTrialSummary()).resolves.toContain('试用版本');
  });

  it('handles expired and expiring trial notices', async () => {
    storageGetMock.mockResolvedValueOnce({ trial_config: { isTrial: true, expirationTime: Date.now() - 1, trialDays: 7, version: '1.0.0' } });
    await showExpirationNotice();
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'AiiinOB 试用版已过期' }));

    createNotificationMock.mockClear();
    storageGetMock.mockResolvedValueOnce({ trial_config: { isTrial: true, expirationTime: Date.now() + 60 * 60 * 1000, trialDays: 7, version: '1.0.0' } });
    await showExpirationNotice();
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'AiiinOB 试用版即将过期' }));
  });

  it('clears config and degrades gracefully on storage errors', async () => {
    storageRemoveMock.mockResolvedValue(undefined);
    await clearTrialConfig();
    expect(storageRemoveMock).toHaveBeenCalledWith(['trial_config', 'trial_status']);

    storageGetMock.mockRejectedValueOnce(new Error('nope'));
    await expect(getTrialConfig()).resolves.toBeNull();
  });
});
