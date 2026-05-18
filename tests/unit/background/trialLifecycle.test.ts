import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asType, intervalId } from '../../utils/typeHelpers';
import type { StorageAreaService } from '../../../src/platform/interfaces/storage';

function createStorageArea() {
  return {
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve(undefined)),
    getMany: vi.fn(() => Promise.resolve({})),
    setMany: vi.fn(() => Promise.resolve(undefined)),
    remove: vi.fn(() => Promise.resolve(undefined)),
    clear: vi.fn(() => Promise.resolve(undefined)),
    watchKey: vi.fn(() => () => undefined),
    watchAll: vi.fn(() => () => undefined)
  } satisfies StorageAreaService;
}

describe('trialLifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('initializes trial config on first install and opens onboarding when needed', async () => {
    const { handleFirstInstall } = await import('../../../src/background/trialLifecycle');
    const initializeTrial = vi.fn(() => Promise.resolve(undefined));
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ trialDays: 14 })
      })
    );
    const tabsCreate = vi.fn(() => Promise.resolve(undefined));

    await handleFirstInstall(
      { reason: 'install' },
      {
        runtime: {
          getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
          onInstalled: vi.fn()
        },
        storage: {
          local: createStorageArea()
        },
        tabs: {
          create: tabsCreate
        },
        fetch: asType<typeof fetch>(fetchMock),
        initializeTrial
      }
    );

    expect(fetchMock).toHaveBeenCalledWith('chrome-extension://test/trial-config.json');
    expect(initializeTrial).toHaveBeenCalledWith(14);
    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://test/onboarding/index.html'
    });
  });

  it('registers installed and suspend lifecycle handlers', async () => {
    const { registerTrialLifecycle } = await import('../../../src/background/trialLifecycle');
    const onInstalled = vi.fn();
    const registerOnSuspend = vi.fn();

    registerTrialLifecycle({
      runtime: {
        getURL: vi.fn(),
        onInstalled
      },
      storage: asType({ local: { get: vi.fn() } }),
      tabs: asType({ create: vi.fn() }),
      fetch: asType<typeof fetch>(vi.fn()),
      initializeTrial: vi.fn(async () => undefined),
      checkTrialStatus: vi.fn(async () => ({
        isTrial: false,
        isExpired: false,
        remainingDays: Infinity,
        remainingHours: Infinity,
        expirationDate: null,
        isExpiringSoon: false
      })),
      showExpirationNotice: vi.fn(async () => undefined),
      cleanupBackgroundDependencies: vi.fn(),
      registerOnSuspend,
      setInterval: asType<typeof setInterval>(vi.fn())
    });

    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(registerOnSuspend).toHaveBeenCalledTimes(1);
  });

  it('initializeTrialSystem notifies only for expiring/expired', async () => {
    const { initializeTrialSystem } = await import('../../../src/background/trialLifecycle');
    const showExpirationNotice = vi.fn(async () => undefined);

    // Case 1: trial and expiring soon → notify once and schedule timer
    const checkTrialStatusExpiring = vi.fn(async () => ({
      isTrial: true,
      isExpired: false,
      remainingDays: 1,
      remainingHours: 12,
      expirationDate: null,
      isExpiringSoon: true
    }));
    const scheduled: Array<() => void> = [];
    const setIntervalStub = (cb: () => void) => {
      scheduled.push(cb);
      return intervalId(1);
    };

    await initializeTrialSystem({
      checkTrialStatus: checkTrialStatusExpiring,
      showExpirationNotice,
      setInterval: asType<typeof setInterval>(setIntervalStub)
    });

    expect(showExpirationNotice).toHaveBeenCalledTimes(1);
    expect(scheduled.length).toBe(1);

    // Trigger scheduled check: still expiring → notify again
    scheduled[0]();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(showExpirationNotice).toHaveBeenCalledTimes(2);

    // Case 2: trial but not expiring → no notify
    const checkTrialStatusOk = vi.fn(async () => ({
      isTrial: true,
      isExpired: false,
      remainingDays: 10,
      remainingHours: 240,
      expirationDate: null,
      isExpiringSoon: false
    }));
    showExpirationNotice.mockClear();
    await initializeTrialSystem({
      checkTrialStatus: checkTrialStatusOk,
      showExpirationNotice,
      setInterval: asType<typeof setInterval>(setIntervalStub)
    });
    expect(showExpirationNotice).not.toHaveBeenCalled();
  });
});
