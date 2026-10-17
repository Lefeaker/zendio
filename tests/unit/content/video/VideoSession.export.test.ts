/* @vitest-environment jsdom */

import {
  __resetContentSessionRegistryForTests,
  isVideoSessionActive
} from '@content/runtime/contentSessionRegistry';
import { createSessionDraftStorageKey } from '@shared/sessionDrafts';
import { createSessionDraftRepository } from '@content/sessionDrafts/sessionDraftRepository';
import type { VideoPanelCallbacks } from '@content/video/application/videoPanelModel';
import { VideoSession } from '@content/video/session';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope
} from '@content/video/sessionDrafts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClipSaveFailure } from '@shared/types/clipResult';

import {
  createDependencies,
  createView,
  getVideoSessionHarnessMocks,
  listVideoDraftCandidates,
  loadLatestVideoDraft,
  readDraftIndex,
  readStoredVideoDraft,
  removalCallIncludesKey,
  requireMountedPanelCallbacks,
  requirePromise,
  requireVideoElement,
  resetVideoSessionHarnessMocks,
  restoreVideoSessionHarnessGlobals,
  seedTimestampCaptures,
  toSessionTestApi
} from './videoSessionTestHarness';

const { exportMock, sendPreparedMock } = getVideoSessionHarnessMocks();

describe('VideoSession export', () => {
  it.each<'unknown' | 'saved'>(['unknown', 'saved'])(
    'hydrates a %s Video marker with corrupt progress and ordinary Finish never dispatches',
    async (outcome) => {
      vi.useFakeTimers();
      const deps = createDependencies();
      const repository = createSessionDraftRepository(deps.storage.local);
      const marker = {
        operationId: 'op_corrupt1',
        snapshotId: 'a'.repeat(64),
        outcome,
        startedAt: 1
      };
      const envelope = createVideoSessionDraftEnvelope({
        draftId: 'video-progress',
        pageUrl: document.location.href,
        pageTitle: 'Preserved',
        updatedAt: Date.now(),
        status: 'restorable',
        payload: buildVideoSessionDraftPayload({
          captures: [
            {
              kind: 'timestamp',
              id: 'one',
              timeSec: 42,
              url: document.location.href,
              comment: 'Keep this video note',
              createdAt: Date.now()
            }
          ],
          commentDrafts: {},
          platform: 'youtube',
          videoId: 'one',
          videoUrl: document.location.href,
          canonicalUrl: document.location.href,
          videoTitle: 'Preserved',
          exportAttempt: marker
        })
      });
      const saved = await repository.save(envelope);
      const key = createSessionDraftStorageKey(saved);
      await deps.storage.local.set(key, {
        ...saved,
        payload: {
          ...saved.payload,
          exportAttempt: { ...marker, attachmentProgress: { total: 51 } }
        }
      });
      const session = new VideoSession(document, deps);
      const api = toSessionTestApi(session);
      await session.start();
      expect(api.state.exportAttempt).toEqual(marker);
      expect(api.state.captures[0]?.comment).toBe('Keep this video note');
      await api.finish();
      expect(exportMock).not.toHaveBeenCalled();
      expect(sendPreparedMock).not.toHaveBeenCalled();
      api.cleanup();
      vi.useRealTimers();
    }
  );
  it.each<'continue' | 'edit' | 'missing-snapshot'>(['continue', 'edit', 'missing-snapshot'])(
    'preserves the prepared payload and checks %s for attachment recovery',
    async (scenario) => {
      vi.useFakeTimers();
      const startedAt = new Date(2026, 9, 15, 23, 59, 59).getTime();
      vi.setSystemTime(startedAt);
      const deps = createDependencies();
      const session = new VideoSession(document, deps);
      const api = toSessionTestApi(session);
      await session.start();
      await api.handleAddCapture();
      exportMock.mockImplementationOnce((input) => {
        const operationId = input.operationId;
        if (!operationId) throw new Error('Missing attempt ID');
        input.onPrepared?.({
          operationId,
          ...(input.exportStartedAt !== undefined
            ? { exportStartedAt: input.exportStartedAt }
            : {}),
          content: 'Original final Markdown',
          title: input.videoTitle,
          url: input.canonicalUrl,
          videoUrl: input.videoUrl,
          timestamp: 1,
          platform: 'youtube'
        });
        return Promise.resolve(
          createClipSaveFailure('unknown', 'write', 'attachments', {
            operationId,
            planId: 'a'.repeat(64),
            storageTarget: 'downloads',
            total: 2,
            phase: 'attachments',
            confirmed: [
              {
                id: 'one',
                outputPath: 'one.jpg',
                download: { id: 1, filename: '/downloads/one.jpg' }
              }
            ]
          })
        );
      });
      await api.finish();
      await api.finish();
      expect(exportMock).toHaveBeenCalledTimes(1);
      const [draft] = await listVideoDraftCandidates(deps);
      expect(draft?.payload.exportAttempt?.attachmentProgress?.confirmed).toHaveLength(1);
      expect(exportMock.mock.calls[0]?.[0].exportStartedAt).toBe(startedAt);
      if (scenario === 'edit') {
        const capture = api.state.captures[0];
        if (!capture) throw new Error('Expected the captured video note');
        capture.comment = 'Newer note';
      }
      if (scenario === 'missing-snapshot') api.state.frozenExportPayload = undefined;
      api.state.exportRecoveryAction = 'continue';
      vi.setSystemTime(startedAt + 2000);
      await api.finish();
      expect(exportMock).toHaveBeenCalledTimes(1);
      if (scenario === 'continue') {
        expect(sendPreparedMock).toHaveBeenCalledTimes(1);
        expect(sendPreparedMock.mock.calls[0]?.[0].content).toBe('Original final Markdown');
        expect(sendPreparedMock.mock.calls[0]?.[0].operationId).toBe(
          draft?.payload.exportAttempt?.operationId
        );
        expect(sendPreparedMock.mock.calls[0]?.[0].exportStartedAt).toBe(startedAt);
        expect(sendPreparedMock.mock.calls[0]?.[1]?.confirmed).toHaveLength(1);
        expect(isVideoSessionActive(document)).toBe(false);
      } else {
        expect(sendPreparedMock).not.toHaveBeenCalled();
        expect(api.state.exportAttempt?.attachmentProgress?.confirmed).toHaveLength(1);
        expect(isVideoSessionActive(document)).toBe(true);
        api.cleanup();
      }
      vi.useRealTimers();
    }
  );
  it('creates a new operation and path time only for an explicit save-again', async () => {
    vi.useFakeTimers();
    const startedAt = new Date(2026, 9, 15, 23, 59, 59).getTime();
    vi.setSystemTime(startedAt);
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const api = toSessionTestApi(session);
    await session.start();
    await api.handleAddCapture();
    exportMock.mockResolvedValueOnce(createClipSaveFailure('unknown'));
    await api.finish();
    const original = exportMock.mock.calls[0]?.[0];
    expect(original?.exportStartedAt).toBe(startedAt);
    vi.setSystemTime(startedAt + 2000);
    api.state.exportRecoveryAction = 'save-again';
    await api.finish();
    expect(exportMock).toHaveBeenCalledTimes(2);
    expect(exportMock.mock.calls[1]?.[0].operationId).not.toBe(original?.operationId);
    expect(exportMock.mock.calls[1]?.[0].exportStartedAt).toBe(startedAt + 2000);
    expect(isVideoSessionActive(document)).toBe(false);
    vi.useRealTimers();
  });
  beforeEach(() => {
    document.body.innerHTML = '<h1>Video Title</h1><video></video>';
    document.title = 'Video Title___哔哩哔哩_bilibili';
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    });
    __resetContentSessionRegistryForTests(document);
    resetVideoSessionHarnessMocks();
  });

  afterEach(() => {
    restoreVideoSessionHarnessGlobals();
  });

  it('keeps an unknown save durable and does not re-export until explicitly requested', async () => {
    vi.useFakeTimers();
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const api = toSessionTestApi(session);
    await session.start();
    Object.defineProperty(requireVideoElement(), 'currentTime', { value: 42, configurable: true });
    await api.handleAddCapture();
    exportMock.mockResolvedValueOnce({
      success: false,
      outcome: 'unknown',
      failureCategory: 'connection'
    });
    await api.finish();
    await api.finish();
    expect(exportMock).toHaveBeenCalledTimes(1);
    const [draft] = await listVideoDraftCandidates(deps);
    expect(draft?.payload.exportAttempt).toMatchObject({ outcome: 'unknown' });
    expect(isVideoSessionActive(document)).toBe(true);
    const capture = api.state.captures[0];
    if (!capture) throw new Error('Expected the captured video note');
    capture.comment = 'New edit after uncertain save';
    api.state.exportRecoveryAction = 'confirm-saved';
    await api.finish();
    expect(exportMock).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(true);
    expect(JSON.stringify(await listVideoDraftCandidates(deps))).toContain(
      'New edit after uncertain save'
    );
    api.cleanup();
    vi.useRealTimers();
  });

  it('does not clear edits to captures excluded by the draft retention cap', async () => {
    vi.useFakeTimers();
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const api = toSessionTestApi(session);
    await session.start();
    api.state.captures = Array.from({ length: 21 }, (_, index) => ({
      kind: 'timestamp',
      id: `retention-${index}`,
      timeSec: index,
      url: `https://example.com/video?t=${index}`,
      comment: `Comment ${index}`,
      createdAt: index + 1
    }));
    exportMock.mockResolvedValueOnce({ success: false, outcome: 'unknown' });
    await api.finish();
    const [draft] = await listVideoDraftCandidates(deps);
    expect(JSON.stringify(draft?.payload)).not.toContain('"id":"retention-0"');
    const oldest = api.state.captures[0];
    if (!oldest) throw new Error('Expected the oldest retained live capture');
    oldest.comment = 'New edit on oldest capture';
    api.state.exportRecoveryAction = 'confirm-saved';
    await api.finish();
    expect(isVideoSessionActive(document)).toBe(true);
    expect(api.state.captures[0]?.comment).toBe('New edit on oldest capture');
    expect(exportMock).toHaveBeenCalledTimes(1);
    expect(await listVideoDraftCandidates(deps)).toHaveLength(1);
    api.cleanup();
    vi.useRealTimers();
  });

  it('removes the current video draft after successful export but keeps it after export failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    await sessionApi.handleAddCapture();
    await vi.advanceTimersByTimeAsync(200);

    expect(await listVideoDraftCandidates(deps)).toHaveLength(1);

    exportMock.mockResolvedValueOnce({ success: true });
    await sessionApi.finish();

    expect(await listVideoDraftCandidates(deps)).toHaveLength(0);

    const failureDeps = createDependencies();
    const failureSession = new VideoSession(document, failureDeps);
    const failureApi = toSessionTestApi(failureSession);
    await failureSession.start();
    Object.defineProperty(requireVideoElement(), 'currentTime', { value: 44, configurable: true });
    await failureApi.handleAddCapture();
    await vi.advanceTimersByTimeAsync(200);
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as never);

    await failureApi.finish();

    expect(await listVideoDraftCandidates(failureDeps)).toHaveLength(1);

    failureApi.cleanup();
    vi.useRealTimers();
  });

  it('keeps the session mounted when export exact-key removal fails after terminalization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    Object.defineProperty(requireVideoElement(), 'currentTime', {
      value: 42,
      configurable: true
    });
    await sessionApi.handleAddCapture();

    const [currentDraft] = await listVideoDraftCandidates(deps, document.location.href, null);
    if (!currentDraft) {
      throw new Error('expected an active current draft');
    }
    const currentDraftKey = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: currentDraft.pageKey,
      draftId: currentDraft.draftId
    });
    const passthroughRemove = vi.mocked(deps.storage.local.remove).getMockImplementation();
    if (!passthroughRemove) {
      throw new Error('expected storage remove implementation');
    }
    vi.mocked(deps.storage.local.remove).mockImplementation(async (...args) => {
      const [value] = args;
      if (removalCallIncludesKey(value, currentDraftKey)) {
        throw new Error('remove current exact key after terminal export failed');
      }
      return await passthroughRemove(...args);
    });

    await requirePromise(requireMountedPanelCallbacks(mountedCallbacks).onFinish());

    expect(view.destroy).not.toHaveBeenCalled();
    expect(isVideoSessionActive(document)).toBe(true);
    expect(await readDraftIndex(deps)).toMatchObject({
      entries: [],
      pendingRemovals: [expect.objectContaining({ key: currentDraftKey })]
    });
    await expect(deps.storage.local.get(currentDraftKey)).resolves.toMatchObject({
      kind: 'session-draft-removal-tombstone',
      key: currentDraftKey
    });

    vi.useRealTimers();
  });

  it('syncs live sixth draft into state before export begins', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as never);
    const sixthDraft = 'sixth draft that must survive export start';
    const view = createView({
      snapshotCommentDrafts: vi.fn(() => ({ 'timestamp-6': sixthDraft }))
    });
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    const deps = createDependencies();
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    seedTimestampCaptures(sessionApi, 6);
    sessionApi.state.commentDrafts = {
      'timestamp-6': 'stale draft that should be replaced'
    };

    await requirePromise(requireMountedPanelCallbacks(mountedCallbacks).onFinish());

    expect(exportMock).toHaveBeenCalled();
    expect(sessionApi.state.commentDrafts).toMatchObject({
      'timestamp-6': sixthDraft
    });

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('exports through the exporter and cleans up on success', async () => {
    const dependencies = createDependencies();
    const session = new VideoSession(document, dependencies);
    const sessionApi = toSessionTestApi(session);
    const cleanupSpy = vi.spyOn(sessionApi, 'cleanup');

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: '',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      }
    ];

    await sessionApi.finish();

    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: 'video:test',
        videoTitle: 'Video Title'
      })
    );
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 10,
      message: {
        key: 'supportProgressVideoPreparing',
        fallback: 'Preparing video export'
      }
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 34,
      message: {
        key: 'supportProgressVideoGenerating',
        fallback: 'Generating video note'
      }
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 70,
      message: {
        key: 'supportProgressVideoWriting',
        fallback: 'Writing to Obsidian'
      }
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 100,
      variant: 'success'
    });
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('retries superseded restored cleanup before exporting and removing the current exact draft', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const repository = createSessionDraftRepository(deps.storage.local);
    const restoredDraft = createVideoSessionDraftEnvelope({
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
            createdAt: 2_000_000_000_100
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Restored title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    });
    await repository.save(restoredDraft);
    const restoredDraftKey = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: restoredDraft.pageKey,
      draftId: restoredDraft.draftId
    });
    const passthroughRemove = vi.mocked(deps.storage.local.remove).getMockImplementation();
    if (!passthroughRemove) {
      throw new Error('expected storage remove implementation');
    }
    let failSupersededCleanup = true;
    vi.mocked(deps.storage.local.remove).mockImplementation(async (...args) => {
      const [value] = args;
      if (failSupersededCleanup && removalCallIncludesKey(value, restoredDraftKey)) {
        failSupersededCleanup = false;
        throw new Error('keep restored exact key active before export');
      }
      return await passthroughRemove(...args);
    });

    const session = new VideoSession(document, deps);
    await session.start();
    await requirePromise(
      requireMountedPanelCallbacks(mountedCallbacks).onSubmitCaptureEdit('ts-1', 'committed note')
    );

    const beforeFinish = await listVideoDraftCandidates(deps, document.location.href, null);
    expect(beforeFinish).toHaveLength(1);
    const currentDraft = beforeFinish[0];
    if (!currentDraft) {
      throw new Error('expected a current replacement draft');
    }
    const currentDraftKey = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: currentDraft.pageKey,
      draftId: currentDraft.draftId
    });

    await requirePromise(requireMountedPanelCallbacks(mountedCallbacks).onFinish());

    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
    await expect(loadLatestVideoDraft(deps)).resolves.toBeNull();
    await expect(listVideoDraftCandidates(deps, document.location.href, null)).resolves.toEqual([]);
    const draftIndex = await readDraftIndex(deps);
    if (!draftIndex) {
      throw new Error('Expected session draft index');
    }
    expect(draftIndex).toMatchObject({ entries: [], pendingRemovals: [] });
    await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toBeUndefined();
    await expect(readStoredVideoDraft(deps, restoredDraftKey)).resolves.toBeUndefined();
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, currentDraftKey))
    ).toHaveLength(1);
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, restoredDraftKey))
    ).toHaveLength(2);

    vi.useRealTimers();
  });

  it('keeps the session alive when export fails', async () => {
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as {
      success: boolean;
      error: string;
    });
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const applyHintSpy = vi.spyOn(sessionApi, 'applyHint');

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: '',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      }
    ];

    await sessionApi.finish();

    expect(applyHintSpy).toHaveBeenCalledWith('failure');
    expect(deps.showSupportProgress).toHaveBeenCalledWith({
      value: 100,
      variant: 'failure'
    });
    expect(isVideoSessionActive(document)).toBe(true);

    sessionApi.cleanup();
  });

  it('keeps the session alive when the exporter returns an invalid empty response', async () => {
    exportMock.mockResolvedValueOnce(null as never);
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const applyHintSpy = vi.spyOn(sessionApi, 'applyHint');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: '',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      }
    ];

    await sessionApi.finish();

    expect(applyHintSpy).toHaveBeenCalledWith('failure');
    expect(deps.showSupportProgress).toHaveBeenCalledWith({
      value: 100,
      variant: 'failure'
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[VideoSession] Export failed:',
      expect.objectContaining({
        message: 'CLIP_RESULT_UNKNOWN'
      })
    );
    expect(consoleErrorSpy.mock.calls[0]?.[1]).toMatchObject({ result: { outcome: 'unknown' } });
    expect(isVideoSessionActive(document)).toBe(true);

    consoleErrorSpy.mockRestore();
    sessionApi.cleanup();
  });
});
