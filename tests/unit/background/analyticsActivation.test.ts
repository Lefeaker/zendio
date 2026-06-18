import { beforeEach, describe, expect, it, vi } from 'vitest';

type ActivationStorageValue = Record<string, unknown> | undefined;

function createActivationStorage() {
  const values = new Map<string, ActivationStorageValue>();

  return {
    local: {
      get: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
      set: vi.fn(async <T>(key: string, value: T) => {
        values.set(key, structuredClone(value) as ActivationStorageValue);
      }),
      remove: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        keys.forEach((entry) => values.delete(entry));
      })
    },
    snapshot: (key: string) => values.get(key)
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

  it('tracks milestones once per identity and removes the stored state when the identity is cleared', async () => {
    const storage = createActivationStorage();
    const activation = await import('../../../src/background/services/analyticsActivation');
    activation.configureActivationAnalyticsStorage(storage.local as never);
    const trackEvent = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));

    await activation.trackActivationMilestoneIfNeeded({
      clientId: 'client-1',
      milestone: 'first_reader_exported',
      trackEvent
    });
    await activation.trackActivationMilestoneIfNeeded({
      clientId: 'client-1',
      milestone: 'first_reader_exported',
      trackEvent
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);

    await activation.reconcileActivationAnalyticsIdentity(undefined);

    expect(storage.local.remove).toHaveBeenCalledWith('analytics_activation_state:client-1');
    expect(storage.snapshot('analytics_activation_state:client-1')).toBeUndefined();
  });
});
