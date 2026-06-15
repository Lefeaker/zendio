import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsQueueStorageArea } from '../../../src/shared/analytics/analyticsQueueStorage';

const STORAGE_KEY = 'analytics_event_queue';

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createLocalStorageArea(): AnalyticsQueueStorageArea & { snapshot: () => unknown } {
  const values = new Map<string, unknown>();
  const get = vi.fn(
    async <T>(key: string) => values.get(key) as T | undefined
  ) as AnalyticsQueueStorageArea['get'];
  const set = vi.fn(async <T>(key: string, value: T) => {
    values.set(key, clone(value));
  }) as AnalyticsQueueStorageArea['set'];
  const remove = vi.fn(async (key: string | string[]) => {
    const keys = Array.isArray(key) ? key : [key];
    keys.forEach((entry) => values.delete(entry));
  }) as AnalyticsQueueStorageArea['remove'];

  return {
    get,
    set,
    remove,
    snapshot: () => clone(values.get(STORAGE_KEY))
  };
}

describe('analyticsQueueStorage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns an empty queue for malformed stored values instead of throwing', async () => {
    const storageArea = createLocalStorageArea();
    await storageArea.set(STORAGE_KEY, { unexpected: true });

    const { createStorageAnalyticsQueueStorage } =
      await import('../../../src/shared/analytics/analyticsQueueStorage');
    const queueStorage = createStorageAnalyticsQueueStorage(storageArea, STORAGE_KEY, {
      now: () => 200000,
      maxAgeMs: 20000
    });

    await expect(queueStorage.load()).resolves.toEqual([]);
  });

  it('drops stale, malformed, and schema-invalid entries while preserving sanitized ones', async () => {
    const storageArea = createLocalStorageArea();
    await storageArea.set(STORAGE_KEY, [
      {
        id: 'valid-1',
        eventName: 'support_link_clicked',
        params: {
          target: 'ko-fi',
          url: 'https://ko-fi.com/should-not-survive'
        },
        enqueuedAt: 190000,
        attemptCount: 0
      },
      {
        id: 'stale-1',
        eventName: 'support_dislike_clicked',
        enqueuedAt: 1,
        attemptCount: 0
      },
      {
        id: 'bad-event',
        eventName: 'not_real',
        enqueuedAt: 190000,
        attemptCount: 0
      },
      {
        id: 'missing-required',
        eventName: 'support_link_clicked',
        params: {
          url: 'https://ko-fi.com/required-param-missing'
        },
        enqueuedAt: 190000,
        attemptCount: 0
      },
      {
        id: 'bad-attempt',
        eventName: 'support_dislike_clicked',
        enqueuedAt: 190000,
        attemptCount: -1
      }
    ]);

    const { createStorageAnalyticsQueueStorage } =
      await import('../../../src/shared/analytics/analyticsQueueStorage');
    const queueStorage = createStorageAnalyticsQueueStorage(storageArea, STORAGE_KEY, {
      now: () => 200000,
      maxAgeMs: 20000
    });

    await expect(queueStorage.load()).resolves.toEqual([
      {
        id: 'valid-1',
        eventName: 'support_link_clicked',
        params: {
          target: 'ko-fi'
        },
        enqueuedAt: 190000,
        attemptCount: 0
      }
    ]);
  });

  it('persists only sanitized entries and removes the storage key when cleared', async () => {
    const storageArea = createLocalStorageArea();
    const { createStorageAnalyticsQueueStorage } =
      await import('../../../src/shared/analytics/analyticsQueueStorage');
    const queueStorage = createStorageAnalyticsQueueStorage(storageArea, STORAGE_KEY, {
      now: () => 200000,
      maxAgeMs: 24 * 60 * 60 * 1000
    });

    await queueStorage.save([
      {
        id: 'save-1',
        eventName: 'support_link_clicked',
        params: {
          target: 'afdian',
          url: 'https://afdian.com/should-not-persist'
        },
        enqueuedAt: 195000,
        attemptCount: 2,
        nextAttemptAt: 210000
      }
    ]);

    expect(storageArea.snapshot()).toEqual([
      {
        id: 'save-1',
        eventName: 'support_link_clicked',
        params: {
          target: 'afdian'
        },
        enqueuedAt: 195000,
        attemptCount: 2,
        nextAttemptAt: 210000
      }
    ]);

    await queueStorage.clear();

    expect(storageArea.snapshot()).toBeUndefined();
  });

  it('provides a shared usage-queue storage binding and clear helper', async () => {
    const storageArea = createLocalStorageArea();
    const activeQueue = {
      clear: vi.fn(async () => undefined)
    };
    const { clearAnalyticsQueueStorage, createUsageAnalyticsQueueStorage } =
      await import('../../../src/shared/analytics/analyticsQueueStorage');
    const queueStorage = createUsageAnalyticsQueueStorage(storageArea, { now: () => 200000 });

    await queueStorage.save([
      {
        id: 'binding-1',
        eventName: 'support_dislike_clicked',
        enqueuedAt: 199000,
        attemptCount: 0
      }
    ]);
    await expect(storageArea.get('analytics_event_queue')).resolves.toEqual([
      expect.objectContaining({
        id: 'binding-1',
        eventName: 'support_dislike_clicked'
      })
    ]);

    await clearAnalyticsQueueStorage(activeQueue, queueStorage);
    expect(activeQueue.clear).toHaveBeenCalledTimes(1);

    await clearAnalyticsQueueStorage(null, queueStorage);
    await expect(storageArea.get('analytics_event_queue')).resolves.toBeUndefined();
  });
});
