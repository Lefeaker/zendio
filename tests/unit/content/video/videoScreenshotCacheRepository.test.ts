/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import type { StorageAreaService } from '@platform/interfaces/storage';
import {
  VIDEO_SCREENSHOT_CACHE_INDEX_KEY,
  normalizeVideoScreenshotCacheEntry,
  normalizeVideoScreenshotCacheIndex,
  type VideoScreenshotCacheRef
} from '@content/video/videoScreenshotCacheTypes';
import { createVideoScreenshotCacheRepository } from '@content/video/videoScreenshotCacheRepository';
import type { VideoCaptureScreenshot } from '@content/video/types';

const BASE_TIME = 2_000_000_000_000;
type StoredValue = Parameters<StorageAreaService['set']>[1];

class MemoryStorageArea implements StorageAreaService {
  private readonly values = new Map<string, StoredValue>();

  get<T = StoredValue>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.values.get(key) as T | undefined);
  }

  set<T = StoredValue>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  getMany<T = StoredValue>(keys: string[]): Promise<Record<string, T | undefined>> {
    return Promise.resolve(
      Object.fromEntries(keys.map((key) => [key, this.values.get(key) as T | undefined]))
    );
  }

  setMany<T = StoredValue>(entries: Record<string, T>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.values.set(key, value);
    }
    return Promise.resolve();
  }

  remove(key: string | string[]): Promise<void> {
    for (const currentKey of Array.isArray(key) ? key : [key]) {
      this.values.delete(currentKey);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.values.clear();
    return Promise.resolve();
  }

  watchKey(): () => void {
    return () => undefined;
  }

  watchAll(): () => void {
    return () => undefined;
  }

  peek(key: string): StoredValue {
    return this.values.get(key);
  }

  snapshotKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

class DelayedIndexReadStorageArea implements StorageAreaService {
  private readonly area = new MemoryStorageArea();
  private pendingIndexResolvers: Array<() => void> = [];
  private releaseScheduled = false;

  async get<T = StoredValue>(key: string): Promise<T | undefined> {
    if (key === VIDEO_SCREENSHOT_CACHE_INDEX_KEY) {
      await this.waitForIndexReadTurn();
    }
    return this.area.get<T>(key);
  }

  set<T = StoredValue>(key: string, value: T): Promise<void> {
    return this.area.set(key, value);
  }

  getMany<T = StoredValue>(keys: string[]): Promise<Record<string, T | undefined>> {
    return this.area.getMany<T>(keys);
  }

  setMany<T = StoredValue>(entries: Record<string, T>): Promise<void> {
    return this.area.setMany<T>(entries);
  }

  remove(key: string | string[]): Promise<void> {
    return this.area.remove(key);
  }

  clear(): Promise<void> {
    return this.area.clear();
  }

  watchKey(): () => void {
    return () => undefined;
  }

  watchAll(): () => void {
    return () => undefined;
  }

  snapshotKeys(): string[] {
    return this.area.snapshotKeys();
  }

  private waitForIndexReadTurn(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingIndexResolvers.push(resolve);
      if (this.pendingIndexResolvers.length >= 2) {
        this.releasePendingIndexReads();
        return;
      }
      if (!this.releaseScheduled) {
        this.releaseScheduled = true;
        setTimeout(() => this.releasePendingIndexReads(), 0);
      }
    });
  }

  private releasePendingIndexReads(): void {
    const resolvers = this.pendingIndexResolvers.splice(0);
    this.releaseScheduled = false;
    for (const resolve of resolvers) {
      resolve();
    }
  }
}

function requireCacheRef(
  ref: VideoScreenshotCacheRef | undefined,
  label = 'expected cache ref'
): VideoScreenshotCacheRef {
  if (!ref) {
    throw new Error(label);
  }
  return ref;
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

async function expectRemoved(
  area: Pick<StorageAreaService, 'get'>,
  ref: VideoScreenshotCacheRef
): Promise<void> {
  expect(await area.get(ref.key)).toBeUndefined();
  const index = await readIndex(area);
  expect(index?.entries.find((entry) => entry.key === ref.key)).toBeUndefined();
}

describe('videoScreenshotCacheRepository', () => {
  it('saves and loads a screenshot while keeping the draft ref metadata-only', async () => {
    const area = new MemoryStorageArea();
    const nowMs = BASE_TIME;
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs
    });

    const saved = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-a', 'frame-a')
    });

    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') {
      throw new Error('expected saved result');
    }

    const ref = saved.ref;
    const refValues = Object.values(ref);
    expect(ref).not.toHaveProperty('content');
    expect(ref).not.toHaveProperty('dataUrl');
    expect(refValues.some((value) => value instanceof Blob)).toBe(false);
    expect(
      refValues.some((value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    ).toBe(false);

    const index = await readIndex(area);
    expect(index?.schemaVersion).toBe(1);
    expect(index?.entries).toHaveLength(1);
    expect(index?.entries[0]).toMatchObject({
      key: ref.key,
      pageKey: 'page-a',
      captureId: 'capture-a',
      id: 'shot-a',
      fileName: 'shot-a.jpg',
      mimeType: 'image/jpeg'
    });

    const storedEntry = normalizeVideoScreenshotCacheEntry(await area.get(ref.key));
    expect(storedEntry?.content.data).toMatch(/^[A-Za-z0-9+/]+=*$/u);

    const loaded = await repository.load(ref);
    expect(loaded).not.toBeNull();
    if (!loaded?.content) {
      throw new Error('expected loaded screenshot content');
    }
    expect(loaded?.id).toBe('shot-a');
    expect(loaded?.fileName).toBe('shot-a.jpg');
    expect(loaded?.mimeType).toBe('image/jpeg');
    expect(loaded.content.byteLength).toBe(storedEntry?.byteLength);
    await expect(loaded.content.blob.text()).resolves.toBe('frame-a');
  });

  it('returns a typed skip for oversized screenshots and does not write storage', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      maxContentBytes: 4
    });

    const result = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-big', '12345')
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'content-too-large',
      byteLength: 5,
      maxContentBytes: 4
    });
    expect(await area.get(VIDEO_SCREENSHOT_CACHE_INDEX_KEY)).toBeUndefined();
    expect(area.snapshotKeys()).toEqual([]);
  });

  it('skips unsafe raw URL page keys before writing cache storage', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME
    });

    const result = await repository.save({
      pageKey: 'https://video.example/watch?v=private-token',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-url-leak', 'frame-url-leak')
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'invalid-metadata',
      field: 'pageKey'
    });
    expect(await area.get(VIDEO_SCREENSHOT_CACHE_INDEX_KEY)).toBeUndefined();
    expect(area.snapshotKeys()).toEqual([]);
  });

  it('saves when screenshot capture time is ahead of the repository clock', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME,
      ttlMs: 100
    });

    const saved = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-clock', 'frame-clock', BASE_TIME + 10)
    });

    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') {
      throw new Error('expected saved result');
    }

    const entry = normalizeVideoScreenshotCacheEntry(await area.get(saved.ref.key));
    expect(entry).toMatchObject({
      capturedAt: BASE_TIME + 10,
      createdAt: BASE_TIME + 10,
      updatedAt: BASE_TIME + 10,
      expiresAt: BASE_TIME + 110
    });
  });

  it('returns a technical code when screenshot serialization fails before storage write', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME
    });
    const brokenBlob = {
      async arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error('blob exploded');
      },
      size: 1,
      type: 'image/jpeg'
    } as unknown as Blob;

    const result = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: {
        id: 'shot-broken',
        fileName: 'shot-broken.jpg',
        mimeType: 'image/jpeg',
        capturedAt: BASE_TIME,
        content: {
          kind: 'blob',
          blob: brokenBlob,
          byteLength: 1
        }
      }
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'serialize-failed',
      error: 'VIDEO_SCREENSHOT_CACHE_SERIALIZE_FAILED'
    });
    expect(area.snapshotKeys()).toEqual([]);
  });

  it('returns a technical code when the normalized cache entry is rejected', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME
    });

    const result = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: {
        id: '',
        fileName: 'broken.jpg',
        mimeType: 'image/jpeg',
        capturedAt: BASE_TIME,
        content: {
          kind: 'blob',
          blob: new Blob(['x'], { type: 'image/jpeg' }),
          byteLength: 1
        }
      } as VideoCaptureScreenshot
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'serialize-failed',
      error: 'VIDEO_SCREENSHOT_CACHE_ENTRY_REJECTED'
    });
    expect(area.snapshotKeys()).toEqual([]);
  });

  it('returns null and opportunistically cleans missing cache entries on load', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME
    });
    const saved = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-missing', 'frame-missing')
    });
    if (saved.status !== 'saved') {
      throw new Error('expected saved result');
    }

    await area.remove(saved.ref.key);

    await expect(repository.load(saved.ref)).resolves.toBeNull();
    await expectRemoved(area, saved.ref);
  });

  it('returns null and cleans expired cache entries on load and explicit prune', async () => {
    const area = new MemoryStorageArea();
    let nowMs = BASE_TIME;
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      ttlMs: 20
    });
    const first = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-expired-a', 'frame-a')
    });
    const second = await repository.save({
      pageKey: 'page-b',
      captureId: 'capture-b',
      screenshot: createScreenshot('shot-expired-b', 'frame-b')
    });
    if (first.status !== 'saved' || second.status !== 'saved') {
      throw new Error('expected saved results');
    }

    nowMs += 25;

    await expect(repository.load(first.ref)).resolves.toBeNull();
    await repository.pruneExpired();

    expect((await readIndex(area))?.entries).toEqual([]);
    expect(await area.get(first.ref.key)).toBeUndefined();
    expect(await area.get(second.ref.key)).toBeUndefined();
  });

  it('returns null and cleans invalid base64 or corrupt stored content', async () => {
    const area = new MemoryStorageArea();
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => BASE_TIME
    });
    const invalidBase64 = await repository.save({
      pageKey: 'page-a',
      captureId: 'capture-a',
      screenshot: createScreenshot('shot-invalid', 'frame-invalid')
    });
    if (invalidBase64.status !== 'saved') {
      throw new Error('expected saved result');
    }

    const malformedEntry = normalizeVideoScreenshotCacheEntry(
      await area.get(invalidBase64.ref.key)
    );
    if (!malformedEntry) {
      throw new Error('expected stored entry');
    }
    await area.set(invalidBase64.ref.key, {
      ...malformedEntry,
      content: {
        ...malformedEntry.content,
        data: '*** not base64 ***'
      }
    });

    await expect(repository.load(invalidBase64.ref)).resolves.toBeNull();
    await expectRemoved(area, invalidBase64.ref);

    const corrupted = await repository.save({
      pageKey: 'page-b',
      captureId: 'capture-b',
      screenshot: createScreenshot('shot-corrupt', 'frame-corrupt')
    });
    if (corrupted.status !== 'saved') {
      throw new Error('expected saved result');
    }

    const corruptedEntry = normalizeVideoScreenshotCacheEntry(await area.get(corrupted.ref.key));
    if (!corruptedEntry) {
      throw new Error('expected stored entry');
    }
    await area.set(corrupted.ref.key, {
      ...corruptedEntry,
      content: {
        ...corruptedEntry.content,
        byteLength: corruptedEntry.content.byteLength + 1
      }
    });

    await expect(repository.load(corrupted.ref)).resolves.toBeNull();
    await expectRemoved(area, corrupted.ref);
  });

  it('prunes oldest entries per page when a lower per-page limit is applied', async () => {
    const area = new MemoryStorageArea();
    let nowMs = BASE_TIME;
    const writer = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      maxPageEntries: 10,
      maxGlobalEntries: 10
    });

    const refs: VideoScreenshotCacheRef[] = [];
    for (const shotId of ['shot-1', 'shot-2', 'shot-3']) {
      const saved = await writer.save({
        pageKey: 'page-a',
        captureId: `capture-${shotId}`,
        screenshot: createScreenshot(shotId, `frame-${shotId}`, nowMs)
      });
      if (saved.status !== 'saved') {
        throw new Error('expected saved result');
      }
      refs.push(saved.ref);
      nowMs += 1;
    }

    const limiter = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      maxPageEntries: 2,
      maxGlobalEntries: 10
    });

    await limiter.pruneToLimits();

    const index = await readIndex(area);
    expect(index?.entries.map((entry) => entry.id)).toEqual(['shot-3', 'shot-2']);
    await expectRemoved(area, requireCacheRef(refs[0]));
  });

  it('prunes oldest entries globally when a lower global limit is applied', async () => {
    const area = new MemoryStorageArea();
    let nowMs = BASE_TIME;
    const writer = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      maxPageEntries: 10,
      maxGlobalEntries: 10
    });

    const refs: VideoScreenshotCacheRef[] = [];
    for (const [pageKey, shotId] of [
      ['page-a', 'shot-1'],
      ['page-b', 'shot-2'],
      ['page-c', 'shot-3'],
      ['page-d', 'shot-4']
    ] as const) {
      const saved = await writer.save({
        pageKey,
        captureId: `capture-${shotId}`,
        screenshot: createScreenshot(shotId, `frame-${shotId}`, nowMs)
      });
      if (saved.status !== 'saved') {
        throw new Error('expected saved result');
      }
      refs.push(saved.ref);
      nowMs += 1;
    }

    const limiter = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      maxPageEntries: 10,
      maxGlobalEntries: 3
    });

    await limiter.pruneToLimits();

    const index = await readIndex(area);
    expect(index?.entries.map((entry) => entry.id)).toEqual(['shot-4', 'shot-3', 'shot-2']);
    await expectRemoved(area, requireCacheRef(refs[0]));
  });

  it('removes one or many refs and keeps the index in sync', async () => {
    const area = new MemoryStorageArea();
    let nowMs = BASE_TIME;
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs
    });

    const savedRefs: VideoScreenshotCacheRef[] = [];
    for (const shotId of ['shot-1', 'shot-2', 'shot-3']) {
      const saved = await repository.save({
        pageKey: 'page-a',
        captureId: `capture-${shotId}`,
        screenshot: createScreenshot(shotId, `frame-${shotId}`, nowMs)
      });
      if (saved.status !== 'saved') {
        throw new Error('expected saved result');
      }
      savedRefs.push(saved.ref);
      nowMs += 1;
    }

    await repository.remove(requireCacheRef(savedRefs[0]));
    expect((await readIndex(area))?.entries.map((entry) => entry.id)).toEqual(['shot-3', 'shot-2']);
    expect(await area.get(requireCacheRef(savedRefs[0]).key)).toBeUndefined();

    await repository.removeMany(savedRefs.slice(1));
    expect((await readIndex(area))?.entries).toEqual([]);
    expect(await area.get(requireCacheRef(savedRefs[1]).key)).toBeUndefined();
    expect(await area.get(requireCacheRef(savedRefs[2]).key)).toBeUndefined();
  });

  it('serializes concurrent saves so the index retains all saved entries and prune can remove them', async () => {
    const area = new DelayedIndexReadStorageArea();
    let nowMs = BASE_TIME;
    const repository = createVideoScreenshotCacheRepository(area, {
      now: () => nowMs,
      ttlMs: 20
    });

    const [first, second] = await Promise.all([
      repository.save({
        pageKey: 'page-a',
        captureId: 'capture-a',
        screenshot: createScreenshot('shot-a', 'frame-a')
      }),
      repository.save({
        pageKey: 'page-a',
        captureId: 'capture-b',
        screenshot: createScreenshot('shot-b', 'frame-b')
      })
    ]);

    expect(first.status).toBe('saved');
    expect(second.status).toBe('saved');
    if (first.status !== 'saved' || second.status !== 'saved') {
      throw new Error('expected both concurrent saves to succeed');
    }

    expect((await readIndex(area))?.entries.map((entry) => entry.captureId).sort()).toEqual([
      'capture-a',
      'capture-b'
    ]);
    expect(await area.get(first.ref.key)).not.toBeUndefined();
    expect(await area.get(second.ref.key)).not.toBeUndefined();

    nowMs += 25;
    await repository.pruneExpired();

    expect(await area.get(first.ref.key)).toBeUndefined();
    expect(await area.get(second.ref.key)).toBeUndefined();
    expect((await readIndex(area))?.entries).toEqual([]);
    expect(area.snapshotKeys().filter((key) => key !== VIDEO_SCREENSHOT_CACHE_INDEX_KEY)).toEqual(
      []
    );
  });
});
