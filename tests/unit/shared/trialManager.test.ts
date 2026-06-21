import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partialOf } from '../../utils/typeHelpers';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';
import {
  configureI18nRuntimeLanguageProvider,
  configureI18nStorage,
  setCurrentLanguage
} from '../../../src/i18n';

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
import {
  configureDefaultTrialManagerPortDependencies,
  createDefaultTrialManagerPorts
} from '../../../src/utils/trial-manager-ports';

const harness = createTestPlatformHarness();
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

const manifest: chrome.runtime.Manifest = {
  manifest_version: 3,
  name: 'Zendio Test',
  version: '1.2.3'
};

function chromeStorage(
  local: Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>
): typeof chrome.storage {
  return partialOf<typeof chrome.storage>({
    local: partialOf<chrome.storage.LocalStorageArea>(local)
  });
}

function chromeRuntime(): typeof chrome.runtime {
  return partialOf<typeof chrome.runtime>({
    getManifest: vi.fn(() => manifest)
  });
}

function installChrome(chromeApi: Partial<typeof chrome>): void {
  globalThis.chrome = partialOf<typeof chrome>(chromeApi);
  configureDefaultTrialManagerPortDependencies({
    storage: chromeApi.storage?.local ?? null,
    runtime: chromeApi.runtime
      ? {
          getManifest: chromeApi.runtime.getManifest
        }
      : undefined,
    createNotification: chromeApi.notifications?.create
      ? (options) => chromeApi.notifications?.create(options)
      : undefined
  });
}

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
  } satisfies Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>;
  const createNotificationMock = vi.fn((_options: chrome.notifications.NotificationCreateOptions) =>
    Promise.resolve('notice-id')
  );

  function createNotification(
    options: chrome.notifications.NotificationCreateOptions
  ): Promise<string>;
  function createNotification(
    notificationId: string,
    options: chrome.notifications.NotificationCreateOptions
  ): Promise<string>;
  function createNotification(
    options: chrome.notifications.NotificationCreateOptions,
    callback: (notificationId: string) => void
  ): void;
  function createNotification(
    notificationId: string,
    options: chrome.notifications.NotificationCreateOptions,
    callback: (notificationId: string) => void
  ): void;
  function createNotification(
    notificationIdOrOptions: string | chrome.notifications.NotificationCreateOptions,
    optionsOrCallback?:
      | chrome.notifications.NotificationCreateOptions
      | ((notificationId: string) => void),
    callback?: (notificationId: string) => void
  ): Promise<string> | void {
    const options =
      typeof notificationIdOrOptions === 'string' ? optionsOrCallback : notificationIdOrOptions;
    const result =
      options && typeof options !== 'function'
        ? createNotificationMock(options)
        : Promise.resolve('notice-id');
    const resolvedCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (resolvedCallback) {
      resolvedCallback('notice-id');
      return undefined;
    }
    return result;
  }

  const notifications = partialOf<NonNullable<typeof chrome.notifications>>({
    create: createNotification
  });

  beforeEach(async () => {
    harness.configure();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T00:00:00Z'));
    configureI18nRuntimeLanguageProvider(null);
    configureI18nStorage(harness.storage.sync);
    await setCurrentLanguage('en');
    installChrome({
      storage: chromeStorage(storage),
      runtime: chromeRuntime(),
      notifications
    });
  });

  async function setLanguage(language: 'en' | 'zh-CN') {
    await setCurrentLanguage(language);
  }

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

  it('creates default ports from injected dependencies without global chrome access', async () => {
    const storagePort = {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve(undefined)),
      remove: vi.fn(() => Promise.resolve(undefined))
    } satisfies Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>;
    const notificationCreate = vi.fn(() => Promise.resolve('trial-notice'));
    const ports = createDefaultTrialManagerPorts({
      storage: storagePort,
      runtime: {
        getManifest: () => ({ version: '9.9.9' })
      },
      notifications: {
        create: notificationCreate
      }
    });
    const options = {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Trial',
      message: 'Trial expiring'
    } satisfies chrome.notifications.NotificationCreateOptions;

    await ports.createNotification?.(options);

    expect(ports.storage).toBe(storagePort);
    expect(ports.getManifestVersion()).toBe('9.9.9');
    expect(notificationCreate).toHaveBeenCalledWith('trial-expiration-notice', options);
  });

  it('returns null for invalid stored trial config', async () => {
    storageGetMock.mockResolvedValue({ trial_config: { isTrial: true, trialDays: 7 } });

    await expect(getTrialConfig()).resolves.toBeNull();
  });

  it('logs and returns null when storage get rejects', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValueOnce(error);

    await expect(getTrialConfig()).resolves.toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to read trial config:',
      error
    );
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
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to persist trial config:',
      error
    );
  });

  it('rejects setTrialConfig with a clear error when storage is missing', async () => {
    installChrome({ runtime: chromeRuntime() });

    await expect(
      setTrialConfig({
        isTrial: true,
        expirationTime: Date.now() + 1000,
        trialDays: 7,
        version: '1.0.0'
      })
    ).rejects.toThrow('chrome.storage.local is unavailable');
  });

  it('initializes trial and computes active status and localized summaries', async () => {
    await setLanguage('en');
    storageSetMock.mockResolvedValue(undefined);
    const config = await initializeTrial(3);
    expect(config.version).toBe('1.2.3');
    expect(config.expirationTime).toBe(new Date('2026-03-12T00:00:00Z').getTime());
    storageGetMock.mockResolvedValue({ trial_config: config });
    const status = await checkTrialStatus();
    expect(status.isTrial).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(formatRemainingTime(status, 'en')).toContain('days');
    await expect(isFeatureAvailable()).resolves.toBe(true);
    const summary = await getTrialSummary();
    expect(summary).toContain('Trial - 3 days');
    expect(summary).not.toMatch(CJK_REGEX);
  });

  it('localizes notifications and summaries in English without CJK', async () => {
    await setLanguage('en');
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() - 1,
        trialDays: 7,
        version: '1.0.0'
      }
    });
    await showExpirationNotice();
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Trial expired',
        message:
          'Thank you for trying Zendio! The trial period has ended. Please contact the developer for the full version.'
      })
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
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Trial expiring soon',
        message: 'The trial expires in 1 hour. Please contact the developer in time.'
      })
    );

    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: new Date('2026-03-10T12:00:00Z').getTime(),
        trialDays: 7,
        version: '1.0.0'
      }
    });
    const summary = await getTrialSummary();
    expect(summary).toContain('Trial -');
    expect(summary).toContain('March');
    expect(summary).not.toMatch(CJK_REGEX);
  });

  it('renders catalog-backed zh-CN notifications and summaries', async () => {
    await setLanguage('zh-CN');
    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: Date.now() - 1,
        trialDays: 7,
        version: '1.0.0'
      }
    });
    await showExpirationNotice();
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '试用版已过期',
        message: '感谢您试用 Zendio！试用期已结束，请联系开发者获取正式版本。'
      })
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
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '试用版即将过期',
        message: '试用版将在 1小时 后过期，请及时联系开发者。'
      })
    );

    storageGetMock.mockResolvedValueOnce({
      trial_config: {
        isTrial: true,
        expirationTime: new Date('2026-03-10T12:00:00Z').getTime(),
        trialDays: 7,
        version: '1.0.0'
      }
    });
    const summary = await getTrialSummary();
    expect(summary).toContain('试用版本 -');
    expect(summary).toContain('年');
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
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to create trial notification:',
      error
    );
  });

  it('skips expiration notices when notifications are unavailable', async () => {
    installChrome({
      storage: chromeStorage(storage),
      runtime: chromeRuntime()
    });
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
    expect(consoleLogSpy).toHaveBeenCalledWith('[trial-manager] Trial configuration cleared');

    const getError = new Error('nope');
    storageGetMock.mockRejectedValueOnce(getError);
    await expect(getTrialConfig()).resolves.toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to read trial config:',
      getError
    );
  });

  it('logs and returns when clearTrialConfig cannot remove storage keys', async () => {
    const error = new Error('remove failed');
    storageRemoveMock.mockRejectedValueOnce(error);

    await expect(clearTrialConfig()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to clear trial config:',
      error
    );
  });

  it('logs and returns when clearTrialConfig has no storage port', async () => {
    installChrome({ runtime: chromeRuntime() });

    await expect(clearTrialConfig()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[trial-manager] Failed to clear trial config: chrome.storage.local is unavailable'
    );
  });
});
