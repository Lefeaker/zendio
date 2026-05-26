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
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = {
    get: storageGetMock,
    set: storageSetMock,
    remove: storageRemoveMock
  } as unknown as ChromeLike['chrome']['storage']['local'];
  const createNotificationMock = vi.fn();
  const notifications = { create: createNotificationMock } as unknown as NonNullable<
    ChromeLike['chrome']['notifications']
  >;

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
    const config: TrialConfig = {
      isTrial: true,
      expirationTime: Date.now() + 1000,
      trialDays: 7,
      version: '1.0.0'
    };
    storageGetMock.mockResolvedValue({ trial_config: config });
    await expect(getTrialConfig()).resolves.toEqual(config);
    await setTrialConfig(config);
    expect(storageSetMock).toHaveBeenCalledWith({ trial_config: config });
  });

  it('returns null for invalid stored trial config', async () => {
    storageGetMock.mockResolvedValue({ trial_config: { isTrial: true, trialDays: 7 } });

    await expect(getTrialConfig()).resolves.toBeNull();
  });

  it('logs and returns null when storage get rejects', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValueOnce(error);

    await expect(getTrialConfig()).resolves.toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[trial-manager] 获取试用配置失败:', error);
  });

  it('rejects setTrialConfig when storage set rejects', async () => {
    const error = new Error('set failed');
    const config: TrialConfig = {
      isTrial: true,
      expirationTime: Date.now() + 1000,
      trialDays: 7,
      version: '1.0.0'
    };
    storageSetMock.mockRejectedValueOnce(error);

    await expect(setTrialConfig(config)).rejects.toThrow('set failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[trial-manager] 设置试用配置失败:', error);
  });

  it('rejects setTrialConfig with a clear error when storage is missing', async () => {
    runtime.chrome = {
      runtime: {
        getManifest: vi.fn(() => manifest)
      }
    } as unknown as typeof chrome;

    await expect(
      setTrialConfig({
        isTrial: true,
        expirationTime: Date.now() + 1000,
        trialDays: 7,
        version: '1.0.0'
      })
    ).rejects.toThrow('chrome.storage.local is unavailable');
  });

  it('initializes trial and computes active status and summaries', async () => {
    storageSetMock.mockResolvedValue(undefined);
    const config = await initializeTrial(3);
    expect(config.version).toBe('1.2.3');
    expect(config.expirationTime).toBe(new Date('2026-03-12T00:00:00Z').getTime());
    storageGetMock.mockResolvedValue({ trial_config: config });
    const status = await checkTrialStatus();
    expect(status.isTrial).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(formatRemainingTime(status)).toContain('剩余');
    await expect(isFeatureAvailable()).resolves.toBe(true);
    await expect(getTrialSummary()).resolves.toContain('试用版本');
  });

  it('handles expired and expiring trial notices', async () => {
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() - 1,
        trialDays: 7,
        version: '1.0.0'
      }
    });
    await showExpirationNotice();
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'AiiinOB 试用版已过期' })
    );

    createNotificationMock.mockClear();
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() + 60 * 60 * 1000,
        trialDays: 7,
        version: '1.0.0'
      }
    });
    await showExpirationNotice();
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'AiiinOB 试用版即将过期' })
    );
  });

  it('logs notification failures without rejecting expiration notices', async () => {
    const error = new Error('notification failed');
    createNotificationMock.mockRejectedValueOnce(error);
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() - 1,
        trialDays: 7,
        version: '1.0.0'
      }
    });

    await expect(showExpirationNotice()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[trial-manager] 试用通知创建失败:', error);
  });

  it('skips expiration notices when notifications are unavailable', async () => {
    runtime.chrome = {
      storage: { local: storage },
      runtime: {
        getManifest: vi.fn(() => manifest)
      }
    } as unknown as typeof chrome;
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() - 1,
        trialDays: 7,
        version: '1.0.0'
      }
    });

    await expect(showExpirationNotice()).resolves.toBeUndefined();
  });

  it('clears config and degrades gracefully on storage errors', async () => {
    storageRemoveMock.mockResolvedValue(undefined);
    await clearTrialConfig();
    expect(storageRemoveMock).toHaveBeenCalledWith(['trial_config', 'trial_status']);
    expect(consoleLogSpy).toHaveBeenCalledWith('试用配置已清除');

    const getError = new Error('nope');
    storageGetMock.mockRejectedValueOnce(getError);
    await expect(getTrialConfig()).resolves.toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[trial-manager] 获取试用配置失败:', getError);
  });

  it('logs and returns when clearTrialConfig cannot remove storage keys', async () => {
    const error = new Error('remove failed');
    storageRemoveMock.mockRejectedValueOnce(error);

    await expect(clearTrialConfig()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[trial-manager] 清除试用配置失败:', error);
  });

  it('logs and returns when clearTrialConfig has no storage port', async () => {
    runtime.chrome = {
      runtime: {
        getManifest: vi.fn(() => manifest)
      }
    } as unknown as typeof chrome;

    await expect(clearTrialConfig()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] 清除试用配置失败: chrome.storage.local is unavailable'
    );
  });
});
