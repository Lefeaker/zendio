/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  StorageAreaChangeCallback,
  StorageChangeMap,
  StorageService,
  StorageValueMap
} from '@platform/interfaces/storage';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import {
  SESSION_DRAFT_INDEX_KEY,
  SessionDraftRuntimeMessageSchema,
  createSessionDraftIndex,
  createSessionDraftIndexEntry,
  createSessionDraftPageKey,
  createSessionDraftStoragePolicy,
  createSessionDraftStorageKey,
  normalizeSessionDraftStoredValue,
  SESSION_DRAFT_LEASE_DURATION_MS,
  SessionDraftEnvelopeSchema,
  type SessionDraftClientEnvelope,
  type SessionDraftEnvelope,
  type SessionDraftRequest,
  type ReaderSessionDraftEnvelope,
  type SessionDraftStoragePolicy,
  type VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import { createSessionDraftRepository } from '@content/sessionDrafts';
import type { ReaderSessionAdapter } from '@content/clipper/services/selectionController';
import type { VideoSessionAdapter } from '@content/video/application/videoSessionPort';
import { buildReaderSessionDraftEnvelope } from '@content/reader/sessionDrafts';
import { startSessionDraftAutoRestore } from '@content/runtime/sessionDraftAutoRestore';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope
} from '@content/video/sessionDrafts';
import { createSessionDraftStore } from '../../../src/background/services/sessionDraftStore';
import { handleSessionDraftMessage } from '../../../src/background/listeners/sessionDraftMessages';
import { configureSessionDraftRuntimeMessenger } from '../../../src/content/sessionDrafts/sessionDraftTabContext';

function createHarness(
  initialUrl: string,
  options: {
    sessionDraftStoragePolicy?: SessionDraftStoragePolicy;
  } = {}
) {
  document.body.innerHTML = '<main id="app">content</main>';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible'
  });

  let href = initialUrl;
  const localBase = createMemoryStorageArea();
  const localValues = new Map<string, StorageValueMap[string]>();
  const localWatchers = new Set<StorageAreaChangeCallback>();
  const notifyLocalWatchers = (changes: StorageChangeMap): void => {
    localWatchers.forEach((watcher) => watcher(changes));
  };
  const local = {
    ...localBase,
    async set<T>(key: string, value: T) {
      const oldValue = localValues.get(key);
      await localBase.set(key, value);
      localValues.set(key, value);
      notifyLocalWatchers({
        [key]: {
          ...(oldValue !== undefined ? { oldValue } : {}),
          newValue: value
        }
      });
    },
    async setMany<T>(entries: Record<string, T>) {
      const changes: StorageChangeMap = {};
      for (const [key, value] of Object.entries(entries)) {
        const oldValue = localValues.get(key);
        changes[key] = {
          ...(oldValue !== undefined ? { oldValue } : {}),
          newValue: value
        };
      }
      await localBase.setMany(entries);
      for (const [key, value] of Object.entries(entries)) localValues.set(key, value);
      notifyLocalWatchers(changes);
    },
    async remove(keys: string | string[]) {
      const normalizedKeys = Array.isArray(keys) ? keys : [keys];
      const changes: StorageChangeMap = {};
      for (const key of normalizedKeys) {
        const oldValue = localValues.get(key);
        if (oldValue !== undefined) changes[key] = { oldValue };
      }
      await localBase.remove(normalizedKeys);
      for (const key of normalizedKeys) localValues.delete(key);
      notifyLocalWatchers(changes);
    },
    async clear() {
      const changes: StorageChangeMap = Object.fromEntries(
        Array.from(localValues, ([key, oldValue]) => [key, { oldValue }])
      );
      await localBase.clear();
      localValues.clear();
      notifyLocalWatchers(changes);
    },
    getAll() {
      return Promise.resolve(Object.fromEntries(localValues));
    },
    watchAll(callback: StorageAreaChangeCallback) {
      localWatchers.add(callback);
      return () => localWatchers.delete(callback);
    }
  };
  const storage: StorageService = {
    local,
    sync: createMemoryStorageArea()
  };
  const draftStore = createSessionDraftStore(storage.local, {
    ownerLivenessProbe: () => Promise.resolve('inactive'),
    createLeaseId: () => 'auto-restore-lease',
    ...(options.sessionDraftStoragePolicy
      ? { retentionPolicy: options.sessionDraftStoragePolicy.retentionPolicy }
      : {})
  });
  if (!draftStore.ok) throw new Error(draftStore.code);
  const operations: SessionDraftRequest[] = [];
  configureSessionDraftRuntimeMessenger((message) => {
    const normalized = normalizeSessionDraftStoredValue(message);
    const parsed = SessionDraftRuntimeMessageSchema.safeParse(normalized);
    if (parsed.success) operations.push(parsed.data.request);
    return handleSessionDraftMessage(draftStore.store, normalized, {
      tabId: 9,
      frameId: 0
    }).then((result) => result as never);
  });
  const repository = createSessionDraftRepository(
    storage.local,
    options.sessionDraftStoragePolicy
      ? { retentionPolicy: options.sessionDraftStoragePolicy.retentionPolicy }
      : {}
  );
  const readerStart = vi.fn<ReaderSessionAdapter['start']>().mockResolvedValue(undefined);
  const videoStart = vi.fn<VideoSessionAdapter['start']>().mockResolvedValue(undefined);
  const createReaderSession = vi.fn<
    (
      draft: ReaderSessionDraftEnvelope,
      signal: AbortSignal,
      onStartCommitted: () => void
    ) => ReaderSessionAdapter
  >(() => ({
    start: readerStart,
    ingestExternalHighlight: vi.fn()
  }));
  const createVideoSession = vi.fn<
    (
      draft: VideoSessionDraftEnvelope,
      signal: AbortSignal,
      onStartCommitted: () => void
    ) => VideoSessionAdapter
  >(() => ({
    start: videoStart,
    ingestTextCapture: vi.fn()
  }));
  const isReaderSessionActive = vi.fn(() => false);
  const isVideoSessionActive = vi.fn(() => false);
  const isVideoCandidateUrl = vi.fn((url: string) => url.includes('youtube.com/watch'));

  return {
    repository,
    operations,
    storage,
    currentUrl: () => href,
    setUrl: (url: string) => {
      href = url;
    },
    createReaderSession,
    createVideoSession,
    readerStart,
    videoStart,
    isReaderSessionActive,
    isVideoSessionActive,
    isVideoCandidateUrl,
    start: () =>
      startSessionDraftAutoRestore({
        document,
        window,
        storage,
        currentUrl: () => href,
        createReaderSession,
        createVideoSession,
        isReaderSessionActive,
        isVideoSessionActive,
        isVideoCandidateUrl,
        ...(options.sessionDraftStoragePolicy
          ? { sessionDraftStoragePolicy: options.sessionDraftStoragePolicy }
          : {})
      })
  };
}

async function seedStoredDraft(
  harness: ReturnType<typeof createHarness>,
  envelope: SessionDraftClientEnvelope
): Promise<void> {
  const storageKey = createSessionDraftStorageKey({
    mode: envelope.mode,
    pageKey: envelope.pageKey,
    draftId: envelope.draftId
  });

  const record: SessionDraftEnvelope = SessionDraftEnvelopeSchema.parse({
    ...envelope,
    revision: 1,
    ...(envelope.status === 'restorable'
      ? {}
      : {
          lease: {
            leaseId: `fixture-${envelope.draftId}`,
            owner: { tabId: 9, frameId: 0 },
            renewedAt: envelope.updatedAt,
            leaseExpiresAt: envelope.updatedAt + SESSION_DRAFT_LEASE_DURATION_MS
          }
        })
  });
  await harness.storage.local.setMany({
    [storageKey]: record,
    [SESSION_DRAFT_INDEX_KEY]: createSessionDraftIndex([
      createSessionDraftIndexEntry(storageKey, record)
    ])
  });
}

function createReaderDraftEnvelope(
  pageUrl: string,
  updatedAt = Date.now()
): ReaderSessionDraftEnvelope {
  const wrapper = document.createElement('mark');
  wrapper.dataset.readerHighlightId = 'draft-highlight';
  wrapper.textContent = 'Reader highlight';
  const envelope = buildReaderSessionDraftEnvelope({
    draftId: `reader-${updatedAt}`,
    createdAt: updatedAt - 1,
    now: updatedAt,
    pageUrl,
    pageTitle: 'Reader draft',
    highlights: [
      {
        id: 'draft-highlight',
        selectedHtml: '<mark>Reader highlight</mark>',
        selectedText: 'Reader highlight',
        comment: 'reader comment',
        fragmentUrl: '#draft-highlight',
        wrapper,
        wrapperSegments: [wrapper],
        createdAt: updatedAt
      }
    ],
    commentDrafts: {
      'draft-highlight': 'reader comment'
    },
    status: 'restorable'
  });
  if (!envelope) {
    throw new Error('Expected reader draft envelope');
  }
  return {
    ...envelope,
    pageKey: createSessionDraftPageKey('reader', pageUrl),
    expiresAt: updatedAt + 60_000
  };
}

function createVideoDraftEnvelope(pageUrl: string, updatedAt = Date.now()) {
  return createVideoSessionDraftEnvelope({
    draftId: `video-${updatedAt}`,
    pageUrl,
    pageTitle: 'Video draft',
    updatedAt,
    createdAt: updatedAt - 1,
    expiresAt: updatedAt + 60_000,
    status: 'restorable',
    payload: buildVideoSessionDraftPayload({
      captures: [],
      commentDrafts: {
        timestamp: 'video comment'
      },
      platform: 'youtube',
      videoId: 'video-1',
      videoUrl: pageUrl,
      canonicalUrl: pageUrl,
      videoTitle: 'Video draft'
    })
  });
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
  if (!vi.isFakeTimers()) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe('sessionDraftAutoRestore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('starts video session when a video draft exists on a supported video URL', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    await harness.repository.save(createVideoDraftEnvelope(url));

    const stop = harness.start();
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.videoStart).toHaveBeenCalledTimes(1));
    const claimedVideoDraft = harness.createVideoSession.mock.calls[0]?.[0];
    expect(claimedVideoDraft?.draftId).toMatch(/^video-/);
    expect(claimedVideoDraft?.lease).toBeDefined();
    expect(harness.readerStart).not.toHaveBeenCalled();
    stop();
  });

  it('starts reader session when a reader draft exists and no video draft is restored', async () => {
    const url = 'https://example.com/article';
    const harness = createHarness(url);
    await harness.repository.save(createReaderDraftEnvelope(url));

    const stop = harness.start();
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.readerStart).toHaveBeenCalledTimes(1));
    const claimedReaderDraft = harness.createReaderSession.mock.calls[0]?.[0];
    expect(claimedReaderDraft?.draftId).toMatch(/^reader-/);
    expect(claimedReaderDraft?.lease).toBeDefined();
    expect(harness.readerStart.mock.calls[0]).toHaveLength(0);
    expect(harness.videoStart).not.toHaveBeenCalled();
    stop();
  });

  it('keeps the default Free retention window for auto-restore', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T08:00:00Z'));
    const url = 'https://example.com/article';
    const harness = createHarness(url);
    const staleUpdatedAt = Date.now() - 49 * 60 * 60 * 1000;
    await seedStoredDraft(harness, {
      ...createReaderDraftEnvelope(url, staleUpdatedAt),
      expiresAt: Date.now() + 60_000
    });

    const stop = harness.start();
    await flushAsyncWork();

    expect(harness.readerStart).not.toHaveBeenCalled();
    expect(harness.videoStart).not.toHaveBeenCalled();
    stop();
  });

  it('threads an injected generic retention policy through auto-restore', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T08:00:00Z'));
    const url = 'https://example.com/article';
    const harness = createHarness(url, {
      sessionDraftStoragePolicy: createSessionDraftStoragePolicy({
        retentionPolicy: {
          retentionMs: 96 * 60 * 60 * 1000,
          maxRestorablePages: null,
          maxItemsPerPage: null
        }
      })
    });
    const staleUpdatedAt = Date.now() - 49 * 60 * 60 * 1000;
    await seedStoredDraft(harness, {
      ...createReaderDraftEnvelope(url, staleUpdatedAt),
      expiresAt: Date.now() + 60_000
    });

    const stop = harness.start();
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.readerStart).toHaveBeenCalledTimes(1));
    expect(harness.videoStart).not.toHaveBeenCalled();
    stop();
  });

  it('ignores terminal reader drafts during auto-restore', async () => {
    const url = 'https://example.com/article';
    const harness = createHarness(url);

    await seedStoredDraft(harness, {
      ...createReaderDraftEnvelope(url),
      status: 'discarded'
    });

    const stop = harness.start();
    await flushAsyncWork();

    expect(harness.readerStart).not.toHaveBeenCalled();
    expect(harness.videoStart).not.toHaveBeenCalled();
    stop();
  });

  it('ignores terminal video drafts during auto-restore', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    const videoDraft = createVideoDraftEnvelope(url);
    document.body.appendChild(document.createElement('video'));

    await seedStoredDraft(harness, {
      ...videoDraft,
      status: 'exported'
    });

    const stop = harness.start();
    await flushAsyncWork();

    expect(harness.videoStart).not.toHaveBeenCalled();
    expect(harness.readerStart).not.toHaveBeenCalled();
    stop();
  });

  it('starts nothing when no draft exists', async () => {
    const harness = createHarness('https://example.com/article');

    const stop = harness.start();
    await flushAsyncWork();

    expect(harness.readerStart).not.toHaveBeenCalled();
    expect(harness.videoStart).not.toHaveBeenCalled();
    stop();
  });

  it('rechecks when a live-page draft handoff becomes restorable after startup', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    const activeEnvelope = {
      ...createVideoDraftEnvelope(url),
      status: 'active' as const
    };
    await seedStoredDraft(harness, activeEnvelope);

    const stop = harness.start();
    await flushAsyncWork();
    expect(harness.videoStart).not.toHaveBeenCalled();

    const storageKey = createSessionDraftStorageKey(activeEnvelope);
    const activeRecord = await harness.storage.local.get<SessionDraftEnvelope>(storageKey);
    if (!activeRecord) throw new Error('Expected active video draft record');
    const { lease, ...recordWithoutLease } = activeRecord;
    void lease;
    const restorableRecord = SessionDraftEnvelopeSchema.parse({
      ...recordWithoutLease,
      status: 'restorable',
      revision: activeRecord.revision + 1,
      updatedAt: activeRecord.updatedAt + 1
    });
    await harness.storage.local.setMany({
      [storageKey]: restorableRecord,
      [SESSION_DRAFT_INDEX_KEY]: createSessionDraftIndex([
        createSessionDraftIndexEntry(storageKey, restorableRecord)
      ])
    });
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.videoStart).toHaveBeenCalledTimes(1));
    const startCall = harness.createVideoSession.mock.calls[0];
    if (!startCall) throw new Error('Expected one Video session factory call');
    const [claimedDraft] = startCall;
    expect(claimedDraft.draftId).toBe(activeEnvelope.draftId);
    expect(claimedDraft.status).toBe('active');
    expect(claimedDraft.lease).toBeDefined();
    stop();
  });

  it.each([
    ['reader', true, false],
    ['video', false, true]
  ])(
    'starts nothing when an active %s session already exists',
    async (_, readerActive, videoActive) => {
      const url = 'https://www.youtube.com/watch?v=video-1';
      const harness = createHarness(url);
      harness.isReaderSessionActive.mockReturnValue(readerActive);
      harness.isVideoSessionActive.mockReturnValue(videoActive);
      document.body.appendChild(document.createElement('video'));
      await harness.repository.save(createReaderDraftEnvelope(url));
      await harness.repository.save(createVideoDraftEnvelope(url));

      const stop = harness.start();
      await flushAsyncWork();

      expect(harness.createReaderSession).not.toHaveBeenCalled();
      expect(harness.createVideoSession).not.toHaveBeenCalled();
      stop();
    }
  );

  it('prefers video draft restoration when both reader and video drafts exist on a supported video URL', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    await harness.repository.save(createReaderDraftEnvelope(url));
    await harness.repository.save(createVideoDraftEnvelope(url));

    const stop = harness.start();
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.videoStart).toHaveBeenCalledTimes(1));
    expect(harness.readerStart).not.toHaveBeenCalled();
    expect(
      harness.operations
        .filter((request) => request.operation === 'selectAndClaim')
        .map((request) => request.mode)
    ).toEqual(['video']);
    stop();
  });

  it('releases the auto-restore claim when session startup fails', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    await harness.repository.save(createVideoDraftEnvelope(url));
    harness.videoStart.mockRejectedValueOnce(new Error('startup failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const stop = harness.start();
    await flushAsyncWork();

    await vi.waitFor(async () => {
      const listed = await harness.repository.list({
        operation: 'list',
        mode: 'video',
        pageUrl: url
      });
      expect(listed.outcome).toBe('listed');
      if (listed.outcome === 'listed') {
        expect(listed.envelopes[0]).toMatchObject({ status: 'restorable' });
        expect(listed.envelopes[0]).not.toHaveProperty('lease');
      }
    });
    stop();
  });

  it('releases the claim when auto-restore stops during pending startup', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    await harness.repository.save(createVideoDraftEnvelope(url));
    let finishStart: (() => void) | undefined;
    harness.videoStart.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const stop = harness.start();
    await vi.waitFor(() => expect(harness.videoStart).toHaveBeenCalledTimes(1));
    stop();

    await vi.waitFor(async () => {
      const listed = await harness.repository.list({
        operation: 'list',
        mode: 'video',
        pageUrl: url
      });
      expect(listed.outcome).toBe('listed');
      if (listed.outcome === 'listed') expect(listed.envelopes[0]).not.toHaveProperty('lease');
    });
    finishStart?.();
  });

  it('does not release a claim after the real session accepts startup ownership', async () => {
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    document.body.appendChild(document.createElement('video'));
    await harness.repository.save(createVideoDraftEnvelope(url));
    let finishStart: (() => void) | undefined;
    harness.createVideoSession.mockImplementationOnce((_draft, _signal, commit) => {
      commit();
      return {
        start: () =>
          new Promise<void>((resolve) => {
            finishStart = resolve;
          }),
        ingestTextCapture: vi.fn()
      };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const stop = harness.start();
    await vi.waitFor(() => expect(harness.createVideoSession).toHaveBeenCalledTimes(1));
    stop();

    const listed = await harness.repository.list({
      operation: 'list',
      mode: 'video',
      pageUrl: url
    });
    expect(listed.outcome).toBe('listed');
    if (listed.outcome === 'listed') {
      const envelope = listed.envelopes[0];
      if (!envelope || !('lease' in envelope)) throw new Error('expected claimed draft lease');
      expect(envelope.lease).toBeDefined();
    }
    finishStart?.();
  });

  it('reacts to navigation events and rechecks the new URL', async () => {
    const initialUrl = 'https://example.com/first';
    const nextUrl = 'https://example.com/second';
    const harness = createHarness(initialUrl);
    const stop = harness.start();

    await flushAsyncWork();
    expect(harness.readerStart).not.toHaveBeenCalled();

    await harness.repository.save(createReaderDraftEnvelope(nextUrl));
    harness.setUrl(nextUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.readerStart).toHaveBeenCalledTimes(1));
    stop();
  });

  it('retries video draft restoration after a bounded wait when the video element appears later', async () => {
    vi.useFakeTimers();
    const url = 'https://www.youtube.com/watch?v=video-1';
    const harness = createHarness(url);
    await harness.repository.save(createVideoDraftEnvelope(url));

    const stop = harness.start();
    await vi.advanceTimersByTimeAsync(2_000);
    await flushAsyncWork();
    expect(harness.videoStart).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement('video'));
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsyncWork();

    await vi.waitFor(() => expect(harness.videoStart).toHaveBeenCalledTimes(1));
    stop();
  });
});
