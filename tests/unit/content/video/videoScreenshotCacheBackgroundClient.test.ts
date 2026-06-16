/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { createVideoScreenshotCacheClientRepository } from '@content/video/videoScreenshotCacheClientRepository';
import { createVideoScreenshotCacheRepository } from '@content/video/videoScreenshotCacheRepository';
import type { VideoCaptureScreenshot } from '@content/video/types';
import type { StorageAreaService } from '@platform/interfaces/storage';
import type { MessagingService } from '@platform/interfaces/messaging';
import {
  VIDEO_SCREENSHOT_CACHE_INDEX_KEY,
  createVideoScreenshotCacheStorageKey,
  normalizeVideoScreenshotCacheEntry,
  normalizeVideoScreenshotCacheIndex,
  type VideoScreenshotCacheRef
} from '@content/video/videoScreenshotCacheTypes';
import type { VideoScreenshotCacheResponse } from '@content/video/videoScreenshotCacheMessages';
import { createBackgroundVideoScreenshotCacheHandler } from '../../../../src/background/services/videoScreenshotCacheService';
import type { BackgroundVideoScreenshotCacheHandler } from '../../../../src/background/services/videoScreenshotCacheService';

const BASE_TIME = 2_000_000_000_000;
type StoredValue = Parameters<StorageAreaService['set']>[1];

class SharedBackingStore {
  readonly values = new Map<string, StoredValue>();
  pendingIndexResolvers: Array<() => void> = [];
  releaseScheduled = false;
}

class BarrierStorageArea implements StorageAreaService {
  constructor(
    private readonly backing: SharedBackingStore,
    private readonly options: { delayIndexReads?: boolean } = {}
  ) {}

  async get<T = StoredValue>(key: string): Promise<T | undefined> {
    if (this.options.delayIndexReads === true && key === VIDEO_SCREENSHOT_CACHE_INDEX_KEY) {
      await this.waitForIndexReadTurn();
    }
    return this.backing.values.get(key) as T | undefined;
  }

  set<T = StoredValue>(key: string, value: T): Promise<void> {
    this.backing.values.set(key, value);
    return Promise.resolve();
  }

  getMany<T = StoredValue>(keys: string[]): Promise<Record<string, T | undefined>> {
    return Promise.resolve(
      Object.fromEntries(keys.map((key) => [key, this.backing.values.get(key) as T | undefined]))
    );
  }

  setMany<T = StoredValue>(entries: Record<string, T>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.backing.values.set(key, value);
    }
    return Promise.resolve();
  }

  remove(key: string | string[]): Promise<void> {
    for (const currentKey of Array.isArray(key) ? key : [key]) {
      this.backing.values.delete(currentKey);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.backing.values.clear();
    return Promise.resolve();
  }

  watchKey(): () => void {
    return () => undefined;
  }

  watchAll(): () => void {
    return () => undefined;
  }

  snapshotKeys(): string[] {
    return [...this.backing.values.keys()].sort();
  }

  private waitForIndexReadTurn(): Promise<void> {
    return new Promise((resolve) => {
      this.backing.pendingIndexResolvers.push(resolve);
      if (this.backing.pendingIndexResolvers.length >= 2) {
        this.releasePendingIndexReads();
        return;
      }
      if (!this.backing.releaseScheduled) {
        this.backing.releaseScheduled = true;
        setTimeout(() => this.releasePendingIndexReads(), 0);
      }
    });
  }

  private releasePendingIndexReads(): void {
    const resolvers = this.backing.pendingIndexResolvers.splice(0);
    this.backing.releaseScheduled = false;
    for (const resolve of resolvers) {
      resolve();
    }
  }
}

function createScreenshot(
  id: string,
  content: string,
  capturedAt = BASE_TIME
): VideoCaptureScreenshot {
  const blob = new Blob([content], { type: 'image/jpeg' });
  return {
    id,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    capturedAt,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  };
}

async function readIndex(area: Pick<StorageAreaService, 'get'>) {
  return normalizeVideoScreenshotCacheIndex(await area.get(VIDEO_SCREENSHOT_CACHE_INDEX_KEY));
}

function requireSavedRef(
  result: Awaited<ReturnType<ReturnType<typeof createVideoScreenshotCacheRepository>['save']>>
): VideoScreenshotCacheRef {
  expect(result.status).toBe('saved');
  if (result.status !== 'saved') {
    throw new Error('expected screenshot cache save to succeed');
  }
  return result.ref;
}

function createClientMessaging(
  handleMessage: BackgroundVideoScreenshotCacheHandler
): Pick<MessagingService, 'send'> {
  return {
    async send<TResult>(message: Parameters<MessagingService['send']>[0]): Promise<TResult> {
      return (await handleMessage(message)) as TResult;
    }
  };
}

function createStaticMessaging(
  response: VideoScreenshotCacheResponse
): Pick<MessagingService, 'send'> {
  return {
    send<TResult>(): Promise<TResult> {
      return Promise.resolve(response as TResult);
    }
  };
}

function createRef(): VideoScreenshotCacheRef {
  return {
    schemaVersion: 1,
    pageKey: 'page-a',
    captureId: 'capture-a',
    id: 'shot-a',
    key: createVideoScreenshotCacheStorageKey({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshotId: 'shot-a'
    }),
    fileName: 'shot-a.jpg',
    mimeType: 'image/jpeg',
    byteLength: 1,
    capturedAt: BASE_TIME,
    expiresAt: BASE_TIME + 1_000
  };
}

describe('background-owned video screenshot cache client', () => {
  it('serializes concurrent saves from separate content clients through one background owner', async () => {
    const backing = new SharedBackingStore();
    const legacyFirst = createVideoScreenshotCacheRepository(
      new BarrierStorageArea(backing, { delayIndexReads: true }),
      {
        now: () => BASE_TIME,
        ttlMs: 20
      }
    );
    const legacySecond = createVideoScreenshotCacheRepository(
      new BarrierStorageArea(backing, { delayIndexReads: true }),
      {
        now: () => BASE_TIME,
        ttlMs: 20
      }
    );

    const [legacyA, legacyB] = await Promise.all([
      legacyFirst.save({
        pageKey: 'page-a',
        captureId: 'capture-a',
        screenshot: createScreenshot('legacy-a', 'legacy-a')
      }),
      legacySecond.save({
        pageKey: 'page-a',
        captureId: 'capture-b',
        screenshot: createScreenshot('legacy-b', 'legacy-b')
      })
    ]);

    const legacyRefA = requireSavedRef(legacyA);
    const legacyRefB = requireSavedRef(legacyB);
    expect((await readIndex(new BarrierStorageArea(backing)))?.entries).toHaveLength(1);
    expect(await new BarrierStorageArea(backing).get(legacyRefA.key)).not.toBeUndefined();
    expect(await new BarrierStorageArea(backing).get(legacyRefB.key)).not.toBeUndefined();

    await new BarrierStorageArea(backing).clear();

    const backgroundArea = new BarrierStorageArea(backing, { delayIndexReads: true });
    const handleMessage = createBackgroundVideoScreenshotCacheHandler(
      { local: backgroundArea },
      {
        now: () => BASE_TIME,
        ttlMs: 20
      }
    );
    const firstClient = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });
    const secondClient = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });

    const [first, second] = await Promise.all([
      firstClient.save({
        pageKey: 'page-a',
        captureId: 'capture-a',
        screenshot: createScreenshot('shot-a', 'frame-a')
      }),
      secondClient.save({
        pageKey: 'page-a',
        captureId: 'capture-b',
        screenshot: createScreenshot('shot-b', 'frame-b')
      })
    ]);

    const firstRef = requireSavedRef(first);
    const secondRef = requireSavedRef(second);
    expect(
      (await readIndex(backgroundArea))?.entries.map((entry) => entry.captureId).sort()
    ).toEqual(['capture-a', 'capture-b']);
    expect(await backgroundArea.get(firstRef.key)).not.toBeUndefined();
    expect(await backgroundArea.get(secondRef.key)).not.toBeUndefined();

    await firstClient.pruneExpired();

    expect((await readIndex(backgroundArea))?.entries).toHaveLength(2);
    expect(
      backgroundArea.snapshotKeys().filter((key) => key !== VIDEO_SCREENSHOT_CACHE_INDEX_KEY)
    ).toHaveLength(2);
  });

  it('saves and loads blob screenshots through serialized runtime-message content', async () => {
    const area = new BarrierStorageArea(new SharedBackingStore());
    const handleMessage = createBackgroundVideoScreenshotCacheHandler(
      { local: area },
      { now: () => BASE_TIME }
    );
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });

    const saved = await client.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-a', 'frame-a')
    });
    const ref = requireSavedRef(saved);

    const storedEntry = normalizeVideoScreenshotCacheEntry(await area.get(ref.key));
    expect(storedEntry?.content.data).toMatch(/^[A-Za-z0-9+/]+=*$/u);

    const loaded = await client.load(ref);

    expect(loaded).toMatchObject({
      id: 'shot-a',
      fileName: 'shot-a.jpg',
      mimeType: 'image/jpeg',
      capturedAt: BASE_TIME
    });
    await expect(loaded?.content?.blob.text()).resolves.toBe('frame-a');
  });

  it('serializes removeMany and prune operations through the background owner', async () => {
    const backing = new SharedBackingStore();
    let nowMs = BASE_TIME;
    const area = new BarrierStorageArea(backing, { delayIndexReads: true });
    const handleMessage = createBackgroundVideoScreenshotCacheHandler(
      { local: area },
      {
        now: () => nowMs,
        ttlMs: 20
      }
    );
    const firstClient = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });
    const secondClient = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });

    const firstRef = requireSavedRef(
      await firstClient.save({
        pageKey: 'page-a',
        captureId: 'capture-a',
        screenshot: createScreenshot('shot-a', 'frame-a')
      })
    );
    const secondRef = requireSavedRef(
      await firstClient.save({
        pageKey: 'page-a',
        captureId: 'capture-b',
        screenshot: createScreenshot('shot-b', 'frame-b')
      })
    );
    nowMs += 25;

    await Promise.all([firstClient.removeMany([firstRef]), secondClient.pruneExpired()]);

    expect(await area.get(firstRef.key)).toBeUndefined();
    expect(await area.get(secondRef.key)).toBeUndefined();
    expect((await readIndex(area))?.entries).toEqual([]);
  });

  it('cleans missing and malformed refs without dropping unrelated index entries', async () => {
    const area = new BarrierStorageArea(new SharedBackingStore());
    const handleMessage = createBackgroundVideoScreenshotCacheHandler(
      { local: area },
      { now: () => BASE_TIME }
    );
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createClientMessaging(handleMessage)
    });

    const missingRef = requireSavedRef(
      await client.save({
        pageKey: 'page-a',
        captureId: 'capture-missing',
        screenshot: createScreenshot('shot-missing', 'frame-missing')
      })
    );
    const malformedRef = requireSavedRef(
      await client.save({
        pageKey: 'page-a',
        captureId: 'capture-malformed',
        screenshot: createScreenshot('shot-malformed', 'frame-malformed')
      })
    );
    const retainedRef = requireSavedRef(
      await client.save({
        pageKey: 'page-a',
        captureId: 'capture-retained',
        screenshot: createScreenshot('shot-retained', 'frame-retained')
      })
    );

    await area.remove(missingRef.key);
    const malformedEntry = normalizeVideoScreenshotCacheEntry(await area.get(malformedRef.key));
    if (!malformedEntry) {
      throw new Error('expected malformed entry setup');
    }
    await area.set(malformedRef.key, {
      ...malformedEntry,
      content: {
        ...malformedEntry.content,
        data: '*** not base64 ***'
      }
    });

    await expect(client.load(missingRef)).resolves.toBeNull();
    await expect(client.load(malformedRef)).resolves.toBeNull();

    expect((await readIndex(area))?.entries.map((entry) => entry.captureId)).toEqual([
      'capture-retained'
    ]);
    expect(await area.get(retainedRef.key)).not.toBeUndefined();
    await expect(client.load(retainedRef)).resolves.toMatchObject({
      id: 'shot-retained'
    });
  });

  it('rejects removeMany when the background mutation response fails', async () => {
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createStaticMessaging({
        success: false,
        error: 'background cleanup failed'
      })
    });

    await expect(client.removeMany([createRef()])).rejects.toThrow('background cleanup failed');
  });

  it('returns a technical save error code when the background response shape is invalid', async () => {
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createStaticMessaging({} as VideoScreenshotCacheResponse)
    });

    await expect(
      client.save({
        pageKey: 'page-a',
        captureId: 'capture-a',
        screenshot: createScreenshot('shot-invalid', 'frame-invalid')
      })
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'serialize-failed',
      error: 'VIDEO_SCREENSHOT_CACHE_INVALID_RESPONSE'
    });
  });

  it('rejects pruneExpired when the background mutation operation mismatches', async () => {
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createStaticMessaging({
        success: true,
        operation: 'pruneToLimits'
      })
    });

    await expect(client.pruneExpired()).rejects.toThrow('Unexpected pruneExpired response.');
  });

  it('resolves mutation requests only after a matching background response', async () => {
    const client = createVideoScreenshotCacheClientRepository({
      messaging: createStaticMessaging({
        success: true,
        operation: 'removeMany'
      })
    });

    await expect(client.removeMany([createRef()])).resolves.toBeUndefined();
  });
});
