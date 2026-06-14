/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionDraftPageKey,
  createSessionDraftRepository,
  createSessionDraftStorageKey,
  type VideoSessionDraftEnvelope
} from '@content/sessionDrafts';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  type VideoSessionDraftPayloadShape
} from '@content/video/sessionDrafts';
import { VideoSessionState } from '@content/video/sessionState';
import type { StorageAreaService } from '@platform/interfaces/storage';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import { VideoSessionDraftController } from '@content/video/videoSessionDraftController';
import type { VideoCaptureScreenshot } from '@content/video/types';
import {
  createVideoScreenshotCacheStorageKey,
  type VideoScreenshotCacheRef
} from '@content/video/videoScreenshotCacheTypes';
import type { VideoScreenshotCacheRepository } from '@content/video/videoScreenshotCacheRepository';

type TrackedStorageArea = ReturnType<typeof createTrackedStorageArea>;

function createTrackedStorageArea() {
  const area = createMemoryStorageArea();
  return {
    ...area,
    get: vi.fn(area.get),
    set: vi.fn(area.set),
    getMany: vi.fn(area.getMany),
    setMany: vi.fn(area.setMany),
    remove: vi.fn(area.remove),
    clear: vi.fn(area.clear),
    watchKey: vi.fn(area.watchKey),
    watchAll: vi.fn(area.watchAll)
  };
}

function createTimestampCapture(id = 'timestamp-1') {
  return {
    kind: 'timestamp' as const,
    id,
    timeSec: 42,
    comment: 'note',
    url: 'https://video.example/watch?t=42',
    createdAt: 1
  };
}

function createBlobScreenshotFixture(
  text = 'frame',
  capturedAt = 2_000_000_000_101
): VideoCaptureScreenshot {
  const blob = new Blob([text], { type: 'image/jpeg' });
  return {
    id: 'shot-1',
    fileName: 'video-0m42s.jpg',
    mimeType: 'image/jpeg',
    capturedAt,
    dataUrl: 'data:image/jpeg;base64,cHJpdmF0ZS1mcmFtZQ==',
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  };
}

function createScreenshotCacheRef(
  overrides: Partial<VideoScreenshotCacheRef> = {}
): VideoScreenshotCacheRef {
  const pageKey = overrides.pageKey ?? createSessionDraftPageKey('video', document.location.href);
  const captureId = overrides.captureId ?? 'ts-1';
  const id = overrides.id ?? 'shot-1';
  const capturedAt = overrides.capturedAt ?? 2_000_000_000_101;
  const expiresAt = overrides.expiresAt ?? capturedAt + 60_000;

  return {
    schemaVersion: 1,
    pageKey,
    captureId,
    id,
    key:
      overrides.key ??
      createVideoScreenshotCacheStorageKey({
        pageKey,
        captureId,
        screenshotId: id
      }),
    fileName: overrides.fileName ?? 'video-0m42s.jpg',
    mimeType: 'image/jpeg',
    byteLength: overrides.byteLength ?? 12,
    capturedAt,
    expiresAt
  };
}

function createDestinationState(metadata?: ExportDestinationMetadata) {
  let current = metadata;
  return {
    get metadata() {
      return current;
    },
    applyMetadata: vi.fn((next: ExportDestinationMetadata | undefined) => {
      current = next;
    }),
    getCurrent: () => current
  };
}

function createHarness(
  options: {
    destinationMetadata?: ExportDestinationMetadata;
    screenshotCache?: Pick<VideoScreenshotCacheRepository, 'load' | 'removeMany'>;
  } = {}
) {
  const state = new VideoSessionState('gradient');
  const storage = createTrackedStorageArea();
  const destinationState = createDestinationState(options.destinationMetadata);
  let domDrafts: Record<string, string> = {};
  const dom = {
    readCommentDrafts: vi.fn(() => ({ ...domDrafts })),
    setCommentDrafts: vi.fn((drafts: Record<string, string>) => {
      domDrafts = { ...drafts };
    })
  };
  const cleanupState = {
    isCleaningUp: false,
    shouldTrackSavingState: true
  };
  const controller = new VideoSessionDraftController({
    doc: document,
    state,
    destinationState,
    storageArea: storage as unknown as StorageAreaService,
    dom,
    applyHint: vi.fn(),
    readCleanupState: () => ({ ...cleanupState }),
    ...(options.screenshotCache ? { screenshotCache: options.screenshotCache } : {})
  });
  const repository = createSessionDraftRepository(storage as unknown as StorageAreaService);

  return {
    state,
    storage,
    repository,
    dom,
    controller,
    destinationState,
    cleanupState,
    setDomDrafts: (drafts: Record<string, string>) => {
      domDrafts = { ...drafts };
    }
  };
}

async function seedRestorableDraft(
  storage: TrackedStorageArea,
  options: {
    destination?: ExportDestinationMetadata;
    commentDrafts?: Record<string, string>;
  } = {}
) {
  const repository = createSessionDraftRepository(storage as unknown as StorageAreaService);
  const draft = createVideoSessionDraftEnvelope({
    draftId: 'restored-draft',
    pageUrl: document.location.href,
    pageTitle: 'Restored title',
    updatedAt: 2_000_000_000_100,
    status: 'restorable',
    payload: buildVideoSessionDraftPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 42,
          url: 'https://video.example/watch?t=42',
          comment: 'restored note',
          createdAt: 2_000_000_000_100,
          screenshotRequested: true
        }
      ],
      commentDrafts: options.commentDrafts ?? { 'ts-1': 'draft note' },
      ...(options.destination ? { destination: options.destination } : {}),
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      videoTitle: 'Restored title',
      videoUrl: document.location.href,
      canonicalUrl: document.location.href
    })
  });
  await repository.save(draft);
  return {
    draft,
    storageKey: createSessionDraftStorageKey({
      mode: 'video',
      pageKey: draft.pageKey,
      draftId: draft.draftId
    })
  };
}

async function seedRestorableDraftWithPayload(
  storage: TrackedStorageArea,
  payload: ReturnType<typeof buildVideoSessionDraftPayload>
) {
  const repository = createSessionDraftRepository(storage as unknown as StorageAreaService);
  const draft = createVideoSessionDraftEnvelope({
    draftId: 'restored-draft',
    pageUrl: document.location.href,
    pageTitle: 'Restored title',
    updatedAt: 2_000_000_000_100,
    status: 'restorable',
    payload
  });
  await repository.save(draft);
  return {
    draft,
    storageKey: createSessionDraftStorageKey({
      mode: 'video',
      pageKey: draft.pageKey,
      draftId: draft.draftId
    })
  };
}

function getDraftStorageKey(draft: VideoSessionDraftEnvelope): string {
  return createSessionDraftStorageKey({
    mode: 'video',
    pageKey: draft.pageKey,
    draftId: draft.draftId
  });
}

function matchesRemovalKey(value: unknown, key: string): boolean {
  if (typeof value === 'string') {
    return value === key;
  }
  if (Array.isArray(value)) {
    return value.includes(key);
  }
  return typeof value === 'object' && value !== null && 'key' in value && value.key === key;
}

async function waitForAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('VideoSessionDraftController', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '<video></video>';
    document.title = 'Video Title';
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('removes the exact current key and returns noCaptures when the draft becomes empty', async () => {
    const { controller, repository, state, setDomDrafts, storage } = createHarness();
    state.captures = [createTimestampCapture()];
    setDomDrafts({ 'timestamp-1': 'draft note' });

    const pending = controller.scheduleSave();
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    const [activeDraft] = await repository.listCandidates('video', document.location.href);
    if (!activeDraft || activeDraft.mode !== 'video') {
      throw new Error('expected an active video draft');
    }
    const currentDraftKey = getDraftStorageKey(activeDraft);

    state.captures = [];
    state.commentDrafts = {};
    setDomDrafts({});

    const result = await controller.flushNow('active');

    expect(result).toBe('noCaptures');
    await expect(repository.loadLatest('video', document.location.href)).resolves.toBeNull();
    await expect(repository.listCandidates('video', document.location.href)).resolves.toEqual([]);
    await expect(controller.remove()).resolves.toBeUndefined();
    await expect(repository.loadLatest('video', document.location.href)).resolves.toBeNull();
    await expect(storage.get(currentDraftKey)).resolves.toBeUndefined();
  });

  it('schedules and flushes active drafts with exact active status', async () => {
    const { controller, repository, state, setDomDrafts } = createHarness();
    state.captures = [createTimestampCapture()];
    setDomDrafts({ 'timestamp-1': 'draft note' });
    controller.syncCommentDrafts();

    const pending = controller.scheduleSave();
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    let latestDraft = await repository.loadLatest('video', document.location.href);
    expect(latestDraft).toMatchObject({
      status: 'active',
      payload: { commentDrafts: { 'timestamp-1': 'draft note' } }
    });

    setDomDrafts({ 'timestamp-1': 'draft note v2' });
    const result = await controller.flushNow('active');

    expect(result).toBe('ready');
    latestDraft = await repository.loadLatest('video', document.location.href);
    expect(latestDraft).toMatchObject({
      status: 'active',
      payload: { commentDrafts: { 'timestamp-1': 'draft note v2' } }
    });
  });

  it('binds pagehide and beforeunload persistence and unregisters cleanly on dispose', async () => {
    const { controller, repository, state, setDomDrafts, storage } = createHarness();
    state.captures = [createTimestampCapture()];
    setDomDrafts({ 'timestamp-1': 'draft note' });

    controller.bindPersistence();
    window.dispatchEvent(new Event('pagehide'));
    await waitForAsyncWork();

    let latestDraft = await repository.loadLatest('video', document.location.href);
    expect(latestDraft).toMatchObject({ status: 'restorable' });

    const callsAfterBind = storage.setMany.mock.calls.length;
    await controller.dispose();

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    await waitForAsyncWork();

    expect(storage.setMany).toHaveBeenCalledTimes(callsAfterBind);
    latestDraft = await repository.loadLatest('video', document.location.href);
    expect(latestDraft).toMatchObject({ status: 'restorable' });
  });

  it('hydrates captures, comment drafts, and destination state from a restored same-page draft', async () => {
    const destination = {
      kind: 'downloads',
      adapterId: 'downloads',
      title: 'Downloads',
      type: 'folder'
    } as const;
    const harness = createHarness();
    await seedRestorableDraft(harness.storage, { destination });

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true
      })
    ]);
    expect(harness.state.commentDrafts).toEqual({ 'ts-1': 'draft note' });
    expect(harness.dom.setCommentDrafts).toHaveBeenCalledWith({ 'ts-1': 'draft note' });
    expect(harness.destinationState.applyMetadata).toHaveBeenCalledWith(destination);
    expect(harness.destinationState.getCurrent()).toEqual(destination);
  });

  it('persists screenshotRef metadata without serializing screenshot bytes into the draft payload', async () => {
    vi.setSystemTime(new Date('2026-06-14T10:40:00Z'));
    const harness = createHarness();
    const screenshotRef = createScreenshotCacheRef({ captureId: 'timestamp-1' });
    harness.state.captures = [
      {
        ...createTimestampCapture(),
        screenshotRequested: true,
        screenshotRef,
        screenshot: createBlobScreenshotFixture('private-frame')
      }
    ];

    const result = await harness.controller.flushNow('active');

    expect(result).toBe('ready');
    const storedDraft = await harness.repository.loadLatest('video', document.location.href);
    expect(storedDraft).not.toBeNull();
    if (!storedDraft || storedDraft.mode !== 'video') {
      throw new Error('expected an active video draft');
    }
    const payload = storedDraft.payload as VideoSessionDraftPayloadShape;

    expect(payload.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'timestamp-1',
        screenshotRequested: true,
        screenshotRef
      })
    ]);
    expect(payload.captures[0]).not.toHaveProperty('screenshot');
    expect(payload.captures[0]).not.toHaveProperty('dataUrl');
    expect(payload.captures[0]).not.toHaveProperty('content');
  });

  it('restores old draft payloads without screenshot refs and preserves screenshot intent', async () => {
    const screenshotCache = {
      load: vi.fn(),
      removeMany: vi.fn()
    };
    const harness = createHarness({ screenshotCache });
    await seedRestorableDraft(harness.storage);

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(screenshotCache.load).not.toHaveBeenCalled();
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true
      })
    ]);
    expect(harness.state.captures[0]).not.toHaveProperty('screenshot');
  });

  it('hydrates cached screenshots from valid screenshot refs during restore', async () => {
    const screenshotRef = createScreenshotCacheRef();
    const restoredScreenshot = createBlobScreenshotFixture('cached-frame');
    const screenshotCache = {
      load: vi.fn().mockResolvedValue(restoredScreenshot),
      removeMany: vi.fn()
    };
    const harness = createHarness({ screenshotCache });
    await seedRestorableDraftWithPayload(
      harness.storage,
      buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'restored note',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true,
            screenshotRef
          }
        ],
        commentDrafts: { 'ts-1': 'draft note' },
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Restored title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    );

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(screenshotCache.load).toHaveBeenCalledWith(screenshotRef);
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true,
        screenshotRef,
        screenshot: restoredScreenshot
      })
    ]);
  });

  it('keeps screenshot requests pending when a referenced cache entry is missing', async () => {
    const screenshotRef = createScreenshotCacheRef();
    const screenshotCache = {
      load: vi.fn().mockResolvedValue(null),
      removeMany: vi.fn()
    };
    const harness = createHarness({ screenshotCache });
    await seedRestorableDraftWithPayload(
      harness.storage,
      buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'restored note',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true,
            screenshotRef
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Restored title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    );

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(screenshotCache.load).toHaveBeenCalledWith(screenshotRef);
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true,
        screenshotRef
      })
    ]);
    expect(harness.state.captures[0]).not.toHaveProperty('screenshot');
  });

  it('ignores invalid screenshot refs while preserving the restored capture', async () => {
    const screenshotCache = {
      load: vi.fn(),
      removeMany: vi.fn()
    };
    const harness = createHarness({ screenshotCache });
    await seedRestorableDraftWithPayload(
      harness.storage,
      buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'restored note',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true,
            screenshotRef: {
              schemaVersion: 1,
              pageKey: document.location.href,
              captureId: 'ts-1',
              id: 'shot-1',
              key: 'invalid-ref',
              fileName: 'video-0m42s.jpg',
              mimeType: 'image/jpeg',
              byteLength: 12,
              capturedAt: 2_000_000_000_101,
              expiresAt: 2_000_000_060_101
            } as never
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Restored title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    );

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(screenshotCache.load).not.toHaveBeenCalled();
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true
      })
    ]);
    expect(harness.state.captures[0]).not.toHaveProperty('screenshot');
    expect(harness.state.captures[0]).not.toHaveProperty('screenshotRef');
  });

  it('keeps restore non-fatal when loading a referenced screenshot throws', async () => {
    const screenshotRef = createScreenshotCacheRef();
    const screenshotCache = {
      load: vi.fn().mockRejectedValue(new Error('cache load failed')),
      removeMany: vi.fn()
    };
    const harness = createHarness({ screenshotCache });
    await seedRestorableDraftWithPayload(
      harness.storage,
      buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'restored note',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true,
            screenshotRef
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Restored title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    );

    const restored = await harness.controller.restoreDraftState();

    expect(restored).toBe(true);
    expect(screenshotCache.load).toHaveBeenCalledWith(screenshotRef);
    expect(harness.state.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true,
        screenshotRef
      })
    ]);
    expect(harness.state.captures[0]).not.toHaveProperty('screenshot');
  });

  it('writes exported terminal envelopes to the current and restored exact keys before cleanup', async () => {
    const harness = createHarness();
    const { storage, controller, repository, state, setDomDrafts } = harness;
    const { draft: restoredDraft, storageKey: restoredDraftKey } = await seedRestorableDraft(
      storage,
      { commentDrafts: {} }
    );
    const passthroughRemove = storage.remove.getMockImplementation();
    if (!passthroughRemove) {
      throw new Error('expected storage remove implementation');
    }
    let failSupersededCleanup = true;
    storage.remove.mockImplementation(async (...args) => {
      const [value] = args;
      if (failSupersededCleanup && matchesRemovalKey(value, restoredDraftKey)) {
        failSupersededCleanup = false;
        throw new Error('keep restored exact key active before export');
      }
      return await passthroughRemove(...args);
    });

    await controller.restoreDraftState();
    state.captures[0] = {
      ...createTimestampCapture('ts-1'),
      comment: 'committed note'
    };
    setDomDrafts({});
    await controller.flushNow('active');

    const candidates = await repository.listCandidates('video', document.location.href);
    const currentDraft = candidates.find(
      (candidate) => candidate.draftId !== restoredDraft.draftId
    );
    if (!currentDraft || currentDraft.mode !== 'video') {
      throw new Error('expected a current replacement draft');
    }
    const currentDraftKey = getDraftStorageKey(currentDraft);

    storage.remove.mockClear();
    storage.remove.mockImplementation(async (...args) => {
      const [value] = args;
      if (matchesRemovalKey(value, currentDraftKey) || matchesRemovalKey(value, restoredDraftKey)) {
        throw new Error('terminal cleanup should be best-effort');
      }
      return await passthroughRemove(...args);
    });

    const terminalized = await controller.finalizeTerminal('exported');

    expect(terminalized).toBe(true);
    await expect(repository.loadLatest('video', document.location.href)).resolves.toBeNull();
    await expect(
      (storage as unknown as StorageAreaService).get<VideoSessionDraftEnvelope>(currentDraftKey)
    ).resolves.toMatchObject({
      draftId: currentDraft.draftId,
      status: 'exported'
    });
    await expect(
      (storage as unknown as StorageAreaService).get<VideoSessionDraftEnvelope>(restoredDraftKey)
    ).resolves.toMatchObject({
      draftId: restoredDraft.draftId,
      status: 'exported'
    });
  });

  it('returns false on terminal persistence failure and keeps the active draft intact', async () => {
    const { controller, repository, state, setDomDrafts, storage } = createHarness();
    state.captures = [createTimestampCapture()];
    setDomDrafts({});

    await controller.flushNow('active');
    const activeDraft = await repository.loadLatest('video', document.location.href);
    if (!activeDraft || activeDraft.mode !== 'video') {
      throw new Error('expected an active draft before terminal finalization');
    }

    storage.remove.mockClear();
    storage.setMany.mockImplementationOnce(() => Promise.reject(new Error('terminal save failed')));

    const terminalized = await controller.finalizeTerminal('discarded');

    expect(terminalized).toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
    await expect(repository.loadLatest('video', document.location.href)).resolves.toMatchObject({
      draftId: activeDraft.draftId,
      status: 'active'
    });
  });

  it('removes exact screenshot refs during terminal cleanup when the cache repository is available', async () => {
    const screenshotRef = createScreenshotCacheRef({ captureId: 'ts-1' });
    const screenshotCache = {
      load: vi.fn(),
      removeMany: vi.fn().mockResolvedValue(undefined)
    };
    const harness = createHarness({ screenshotCache });
    harness.state.captures = [
      {
        ...createTimestampCapture('ts-1'),
        screenshotRequested: true,
        screenshotRef
      }
    ];
    await harness.controller.flushNow('active');

    const terminalized = await harness.controller.finalizeTerminal('discarded');

    expect(terminalized).toBe(true);
    expect(screenshotCache.removeMany).toHaveBeenCalledWith([screenshotRef]);
  });

  it.each([
    {
      label: 'restored',
      prepare: async (harness: ReturnType<typeof createHarness>) => {
        const { storageKey } = await seedRestorableDraft(harness.storage, { commentDrafts: {} });
        await harness.controller.restoreDraftState();
        return storageKey;
      }
    },
    {
      label: 'legacy',
      prepare: async (harness: ReturnType<typeof createHarness>) => {
        await harness.storage.set('legacy-video-captures', { legacy: true });
        harness.controller.handleLegacyRestore('legacy-video-captures');
        harness.state.captures = [createTimestampCapture()];
        return 'legacy-video-captures';
      }
    }
  ])('$label cleanup failures are warned but not fatal', async ({ prepare }) => {
    const harness = createHarness();
    const { controller, repository, state, setDomDrafts, storage } = harness;
    const targetKey = await prepare(harness);
    state.captures = [createTimestampCapture('ts-1')];
    setDomDrafts({});
    storage.remove.mockImplementation(async (value) => {
      if (matchesRemovalKey(value, targetKey)) {
        throw new Error(`cleanup failed for ${targetKey}`);
      }
      return undefined;
    });

    const result = await controller.flushNow('active');

    expect(result).toBe('ready');
    expect(warnSpy).toHaveBeenCalledWith(
      '[VideoSession] Failed to clear superseded durable draft sources:',
      expect.any(Error)
    );
    await expect(repository.listCandidates('video', document.location.href)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'active' })])
    );
  });
});
