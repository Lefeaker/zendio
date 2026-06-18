import { beforeEach, describe, expect, it, vi } from 'vitest';

type ActivationStorageValue = Record<string, unknown> | undefined;
const ACTIVATION_STATE_KEY = 'analytics_activation_state';

function createActivationStorage() {
  const values = new Map<string, ActivationStorageValue>();

  return {
    local: {
      get: vi.fn(<T>(key: string) => Promise.resolve(values.get(key) as T | undefined)),
      set: vi.fn(<T>(key: string, value: T) => {
        values.set(key, structuredClone(value) as ActivationStorageValue);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        keys.forEach((entry) => values.delete(entry));
        return Promise.resolve();
      })
    },
    snapshot: (key: string) => values.get(key),
    setRaw: (key: string, value: ActivationStorageValue) => {
      values.set(key, structuredClone(value) as ActivationStorageValue);
    }
  };
}

describe('analyticsActivation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('tracks extension installs once and does not persist idempotency after a rejected send', async () => {
    const storage = createActivationStorage();
    const activation = await import('../../../src/background/services/analyticsActivation');
    activation.configureActivationAnalyticsStorage(storage.local as never);
    const trackEvent = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(true);

    await activation.trackExtensionInstalledIfNeeded({
      clientId: 'client-1',
      trackEvent
    });
    await activation.trackExtensionInstalledIfNeeded({
      clientId: 'client-1',
      trackEvent
    });
    await activation.trackExtensionInstalledIfNeeded({
      clientId: 'client-1',
      trackEvent
    });

    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it('emits active day once per UTC day and advances the bucket on the next day', async () => {
    const storage = createActivationStorage();
    const activation = await import('../../../src/background/services/analyticsActivation');
    activation.configureActivationAnalyticsStorage(storage.local as never);
    const trackEvent = vi.fn<(params: { day_index_bucket: string }) => Promise<boolean>>(() =>
      Promise.resolve(true)
    );

    await activation.trackActivationActiveDayIfNeeded({
      clientId: 'client-1',
      now: () => new Date('2026-06-18T03:00:00.000Z'),
      trackEvent
    });
    await activation.trackActivationActiveDayIfNeeded({
      clientId: 'client-1',
      now: () => new Date('2026-06-18T23:59:59.000Z'),
      trackEvent
    });
    await activation.trackActivationActiveDayIfNeeded({
      clientId: 'client-1',
      now: () => new Date('2026-06-19T00:00:01.000Z'),
      trackEvent
    });

    expect(trackEvent).toHaveBeenNthCalledWith(1, { day_index_bucket: 'day_0' });
    expect(trackEvent).toHaveBeenNthCalledWith(2, { day_index_bucket: 'day_1' });
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it('does not reuse install, active-day, or milestone flags after the analytics identity changes', async () => {
    const storage = createActivationStorage();
    const activation = await import('../../../src/background/services/analyticsActivation');
    activation.configureActivationAnalyticsStorage(storage.local as never);
    const trackInstall = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const trackDay = vi.fn<(params: { day_index_bucket: string }) => Promise<boolean>>(() =>
      Promise.resolve(true)
    );
    const trackMilestone = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));

    await activation.trackExtensionInstalledIfNeeded({
      clientId: 'client-1',
      trackEvent: trackInstall
    });
    await activation.trackActivationActiveDayIfNeeded({
      clientId: 'client-1',
      now: () => new Date('2026-06-18T10:00:00.000Z'),
      trackEvent: trackDay
    });
    await activation.trackActivationMilestoneIfNeeded({
      clientId: 'client-1',
      milestone: 'first_reader_exported',
      trackEvent: trackMilestone
    });

    await activation.trackExtensionInstalledIfNeeded({
      clientId: 'client-2',
      trackEvent: trackInstall
    });
    await activation.trackActivationActiveDayIfNeeded({
      clientId: 'client-2',
      now: () => new Date('2026-06-18T10:00:00.000Z'),
      trackEvent: trackDay
    });
    await activation.trackActivationMilestoneIfNeeded({
      clientId: 'client-2',
      milestone: 'first_reader_exported',
      trackEvent: trackMilestone
    });

    expect(trackInstall).toHaveBeenCalledTimes(2);
    expect(trackDay).toHaveBeenNthCalledWith(1, { day_index_bucket: 'day_0' });
    expect(trackDay).toHaveBeenNthCalledWith(2, { day_index_bucket: 'day_0' });
    expect(trackMilestone).toHaveBeenCalledTimes(2);
    expect(storage.local.remove).toHaveBeenCalledWith(ACTIVATION_STATE_KEY);
    expect(storage.snapshot(ACTIVATION_STATE_KEY)).toMatchObject({
      clientId: 'client-2',
      firstConsentedActiveUtcDate: '2026-06-18',
      lastEmittedActiveUtcDate: '2026-06-18',
      emittedFlags: {
        extension_installed: true,
        first_reader_exported: true
      }
    });
  });

  it('normalizes invalid optional persisted fields before writing activation flags', async () => {
    const storage = createActivationStorage();
    storage.setRaw(ACTIVATION_STATE_KEY, {
      clientId: 'client-1',
      firstConsentedActiveUtcDate: 'not-a-date',
      lastEmittedActiveUtcDate: 42,
      emittedFlags: {
        extension_installed: false,
        first_clip_saved: true
      }
    });
    const activation = await import('../../../src/background/services/analyticsActivation');
    activation.configureActivationAnalyticsStorage(storage.local as never);
    const trackEvent = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));

    await activation.trackActivationMilestoneIfNeeded({
      clientId: 'client-1',
      milestone: 'first_reader_exported',
      trackEvent
    });

    expect(storage.snapshot(ACTIVATION_STATE_KEY)).toEqual({
      clientId: 'client-1',
      emittedFlags: {
        first_clip_saved: true,
        first_reader_exported: true
      }
    });
  });
});
