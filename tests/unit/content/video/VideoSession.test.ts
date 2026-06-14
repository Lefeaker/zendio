/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';
import {
  SESSION_DRAFT_INDEX_KEY,
  createSessionDraftStorageKey
} from '@content/sessionDrafts/sessionDraftKeys';
import { createSessionDraftRepository } from '@content/sessionDrafts/sessionDraftRepository';
import { configureSessionDraftRuntimeMessenger } from '@content/sessionDrafts/sessionDraftTabContext';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import { VideoSession } from '@content/video/session';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import { VideoScreenshotPreparationCoordinator } from '@content/video/videoScreenshotPreparationCoordinator';
import type { VideoPanelCallbacks } from '@content/video/application/videoPanelModel';
import type { VideoSessionDependencies } from '@content/video/sessionTypes';
import type {
  SessionDraftEnvelope,
  SessionDraftIndex,
  SessionDraftOwnerContext,
  VideoSessionDraftEnvelope
} from '@content/sessionDrafts/sessionDraftTypes';
import type { VideoSessionView } from '@content/video/application/videoSessionView';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  type VideoSessionDraftPayloadShape
} from '@content/video/sessionDrafts';
import type { VideoScreenshotCacheSaveResult } from '@content/video/videoScreenshotCacheRepository';
import type { VideoScreenshotCacheRef } from '@content/video/videoScreenshotCacheTypes';
import type { UsageEventName, UsageEventParamMap } from '@shared/types/analytics';
import {
  __resetContentSessionRegistryForTests,
  isVideoSessionActive,
  registerVideoSession
} from '@content/runtime/contentSessionRegistry';
import { setGlobal } from '../../../utils/typeHelpers';

const ensureContentI18nMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      registerDynamic: vi.fn(),
      destroy: vi.fn()
    })
  )
);
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => null));
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      videoPanelTitle: DEFAULT_SESSION_MESSAGES.panel.title,
      videoPanelStatus: DEFAULT_SESSION_MESSAGES.panel.status,
      videoPanelCounter: DEFAULT_SESSION_MESSAGES.panel.counter,
      videoPanelCounterZero: DEFAULT_SESSION_MESSAGES.panel.counterZero,
      videoPanelAdd: DEFAULT_SESSION_MESSAGES.panel.add,
      videoPanelFinish: DEFAULT_SESSION_MESSAGES.panel.finish,
      videoPanelCancel: DEFAULT_SESSION_MESSAGES.panel.cancel,
      videoPanelHint: DEFAULT_SESSION_MESSAGES.panel.hint,
      videoCaptureEditLabel: DEFAULT_SESSION_MESSAGES.panel.captureEditLabel,
      videoCaptureDeleteLabel: DEFAULT_SESSION_MESSAGES.panel.captureDeleteLabel,
      videoCaptureNoComment: DEFAULT_SESSION_MESSAGES.panel.captureNoComment,
      videoCaptureSaveLabel: DEFAULT_SESSION_MESSAGES.panel.captureSaveLabel,
      videoCaptureCancelLabel: DEFAULT_SESSION_MESSAGES.panel.captureCancelLabel,
      videoCaptureEditPlaceholder: DEFAULT_SESSION_MESSAGES.panel.captureEditPlaceholder,
      videoCaptureFocusLabel: DEFAULT_SESSION_MESSAGES.panel.captureFocusLabel,
      videoHintNoVideo: DEFAULT_SESSION_MESSAGES.hintNoVideo,
      videoHintReady: DEFAULT_SESSION_MESSAGES.hintReady,
      videoHintNoCaptures: DEFAULT_SESSION_MESSAGES.hintNoCaptures,
      videoHintSaving: DEFAULT_SESSION_MESSAGES.hintSaving,
      videoHintExporting: DEFAULT_SESSION_MESSAGES.hintExporting,
      videoHintFailure: DEFAULT_SESSION_MESSAGES.hintFailure,
      videoTimestampSectionTitle: DEFAULT_SESSION_MESSAGES.timestampSectionTitle,
      videoFragmentSectionTitle: DEFAULT_SESSION_MESSAGES.fragmentSectionTitle
    })
  )
);
const loadFragmentConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const saveCaptureDataMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const loadStoredCaptureDataMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const detectVideoIdentityMock = vi.hoisted(() =>
  vi.fn((url: string) => ({
    platform: 'bilibili',
    videoId: 'BV1xx411c7mD',
    canonicalUrl: url,
    storageKey: 'video:test'
  }))
);
const exportMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ success: true })));
const createVideoPlatformAdapterMock = vi.hoisted(() =>
  vi.fn(() => ({
    platform: 'bilibili',
    shouldActivate: vi.fn(() => true),
    resolveSelection: vi.fn(() => null),
    findTextRange: vi.fn(() => null),
    highlight: vi.fn(() => undefined),
    restoreHighlight: vi.fn(() => undefined),
    observeDomChanges: vi.fn(),
    handleMutations: vi.fn(),
    buildTimestampUrl: vi.fn((timeSec: number) => `https://video.example/watch?t=${timeSec}`),
    formatVideoTitle: vi.fn((title: string) => title.replace(/_+哔哩哔哩.*/i, '').trim() || null),
    dispose: vi.fn()
  }))
);
const originalMutationObserver = globalThis.MutationObserver;

vi.mock('../../../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));
vi.mock('../../../../src/content/clipper/services/fragmentConfig', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/content/clipper/services/fragmentConfig')
  >('../../../../src/content/clipper/services/fragmentConfig');
  return {
    ...actual,
    loadFragmentConfig: loadFragmentConfigMock
  };
});
vi.mock('../../../../src/content/video/captureStorage', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/content/video/captureStorage')
  >('../../../../src/content/video/captureStorage');
  return {
    ...actual,
    saveCaptureData: saveCaptureDataMock,
    loadStoredCaptureData: loadStoredCaptureDataMock
  };
});
vi.mock('../../../../src/content/video/utils', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/content/video/utils')>(
    '../../../../src/content/video/utils'
  );
  return {
    ...actual,
    detectVideoIdentity: detectVideoIdentityMock
  };
});
vi.mock('../../../../src/content/video/platforms', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/content/video/platforms')>(
    '../../../../src/content/video/platforms'
  );
  return {
    ...actual,
    createVideoPlatformAdapter: createVideoPlatformAdapterMock
  };
});
vi.mock('../../../../src/content/video/videoSessionExporter', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/content/video/videoSessionExporter')
  >('../../../../src/content/video/videoSessionExporter');
  return {
    ...actual,
    VideoSessionExporter: vi.fn().mockImplementation(function VideoSessionExporterMock() {
      return {
        export: exportMock
      };
    })
  };
});

type TestView = VideoSessionView & {
  snapshotCommentDrafts?: Mock<NonNullable<VideoSessionView['snapshotCommentDrafts']>>;
  hydrateCommentDrafts?: Mock<NonNullable<VideoSessionView['hydrateCommentDrafts']>>;
  updateCount: Mock<VideoSessionView['updateCount']>;
  setCaptures: Mock<VideoSessionView['setCaptures']>;
  updateHint: Mock<VideoSessionView['updateHint']>;
  updateTexts: Mock<VideoSessionView['updateTexts']>;
  beginEditingCapture: Mock<VideoSessionView['beginEditingCapture']>;
  stopEditing: Mock<VideoSessionView['stopEditing']>;
  collapse: Mock<NonNullable<VideoSessionView['collapse']>>;
  destroy: Mock<VideoSessionView['destroy']>;
};

type SessionTestApi = {
  applyHint: (state: string) => void;
  cleanup: () => void;
  handleAddCapture: (source?: 'button' | 'note-input') => Promise<void>;
  toggleCaptureScreenshot: (id: string) => Promise<void>;
  addCurrentTimestamp: (
    source?: 'button' | 'note-input',
    options?: {
      comment?: string;
      captureScreenshot?: boolean;
      pauseVideo?: boolean;
      beginEditing?: boolean;
      resumePlayback?: boolean;
      collapseAfterCapture?: boolean;
    }
  ) => Promise<void>;
  finish: () => Promise<void>;
  cancel: () => void;
  state: {
    captures: Array<{
      kind: 'timestamp' | 'fragment';
      id: string;
      comment: string;
      createdAt: number;
      timeSec?: number;
      url?: string;
      selectedText?: string;
      selectedHtml?: string;
      fragmentUrl?: string;
      wrapperId?: string;
      screenshotRequested?: boolean;
      screenshot?: {
        id?: string;
        fileName: string;
        mimeType: 'image/jpeg';
        capturedAt?: number;
        dataUrl?: string;
        content?: {
          kind: 'blob';
          byteLength: number;
          blob: Blob;
        };
      };
      screenshotRef?: VideoScreenshotCacheRef;
    }>;
    commentDrafts?: Record<string, string>;
    saving?: boolean;
  };
};

type CaptureState = SessionTestApi['state']['captures'][number];
type TimestampCaptureScreenshot = NonNullable<CaptureState['screenshot']>;

type TabContextProbeMessage = { type: 'AIIOB_IS_TAB_CONTEXT_ACTIVE' };
type TabContextProbeResponse = {
  success: true;
  active?: boolean;
  tabId?: number;
  windowId?: number;
  frameId?: number;
};

function isTabContextProbeMessage(message: object | null): message is TabContextProbeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'AIIOB_IS_TAB_CONTEXT_ACTIVE'
  );
}

type DraftMutationAct = (
  api: SessionTestApi,
  ids: string[],
  activeId: string,
  session: VideoSession,
  callbacks: VideoPanelCallbacks
) => void | Promise<void>;

interface DraftMutationCase {
  label: string;
  act: DraftMutationAct;
}

function createView(
  overrides: {
    snapshotCommentDrafts?: Mock<NonNullable<VideoSessionView['snapshotCommentDrafts']>>;
    hydrateCommentDrafts?: Mock<NonNullable<VideoSessionView['hydrateCommentDrafts']>>;
  } = {}
): TestView {
  return {
    ...(overrides.snapshotCommentDrafts
      ? { snapshotCommentDrafts: overrides.snapshotCommentDrafts }
      : {}),
    ...(overrides.hydrateCommentDrafts
      ? { hydrateCommentDrafts: overrides.hydrateCommentDrafts }
      : {}),
    updateCount: vi.fn<VideoSessionView['updateCount']>(),
    setCaptures: vi.fn<VideoSessionView['setCaptures']>(),
    updateHint: vi.fn<VideoSessionView['updateHint']>(),
    updateTexts: vi.fn<VideoSessionView['updateTexts']>(),
    beginEditingCapture: vi.fn<VideoSessionView['beginEditingCapture']>(),
    stopEditing: vi.fn<VideoSessionView['stopEditing']>(),
    collapse: vi.fn<NonNullable<VideoSessionView['collapse']>>(),
    destroy: vi.fn<VideoSessionView['destroy']>()
  };
}

function createDependencies(videoConfig: unknown = null): VideoSessionDependencies {
  const showSupportProgress = vi.fn();
  const trackUsageEvent = vi.fn(() => Promise.resolve(undefined));
  const localArea = createMemoryStorageArea();
  const syncArea = createMemoryStorageArea();
  const local = {
    ...localArea,
    get: vi.fn(localArea.get),
    set: vi.fn(localArea.set),
    getMany: vi.fn(localArea.getMany),
    setMany: vi.fn(localArea.setMany),
    remove: vi.fn(localArea.remove),
    clear: vi.fn(localArea.clear)
  };
  const sync = {
    ...syncArea,
    get: vi.fn(syncArea.get),
    set: vi.fn(syncArea.set),
    getMany: vi.fn(syncArea.getMany),
    setMany: vi.fn(syncArea.setMany),
    remove: vi.fn(syncArea.remove),
    clear: vi.fn(syncArea.clear)
  };
  return {
    viewFactory: {
      createView: vi.fn(() => createView())
    },
    optionsRepository: {
      get: vi.fn(() => Promise.resolve({ readingSession: { highlightTheme: 'gradient' } })),
      set: vi.fn(() => Promise.resolve(undefined)),
      onChange: vi.fn(() => () => {})
    },
    videoRepository: {
      getVideoConfig: vi.fn(() => Promise.resolve(videoConfig)),
      savePromptPosition: vi.fn(() => Promise.resolve(undefined)),
      saveControlBarPreferences: vi.fn(() => Promise.resolve(undefined)),
      getPromptPosition: vi.fn(() => Promise.resolve(null)),
      sendVideoClip: vi.fn(() => Promise.resolve({ success: true })),
      onConfigChange: vi.fn(() => () => {})
    },
    storage: {
      local,
      sync
    },
    showSupportProgress,
    trackUsageEvent
  } as unknown as VideoSessionDependencies;
}

async function listVideoDraftCandidates(
  deps: VideoSessionDependencies,
  pageUrl = document.location.href,
  ownerContext?: SessionDraftOwnerContext | null
): Promise<VideoSessionDraftEnvelope[]> {
  const repository = createSessionDraftRepository(deps.storage.local);
  const candidates = await repository.listCandidates(
    'video',
    pageUrl,
    undefined,
    ownerContext === undefined ? undefined : { ownerContext }
  );
  return candidates.filter(
    (candidate: SessionDraftEnvelope): candidate is VideoSessionDraftEnvelope =>
      candidate.mode === 'video'
  );
}

async function readDraftIndex(
  deps: VideoSessionDependencies
): Promise<SessionDraftIndex | undefined> {
  return deps.storage.local.get<SessionDraftIndex>(SESSION_DRAFT_INDEX_KEY);
}

async function loadLatestVideoDraft(
  deps: VideoSessionDependencies,
  pageUrl = document.location.href,
  ownerContext?: SessionDraftOwnerContext | null
): Promise<VideoSessionDraftEnvelope | null> {
  const repository = createSessionDraftRepository(deps.storage.local);
  const candidate = await repository.loadLatest(
    'video',
    pageUrl,
    undefined,
    ownerContext === undefined ? undefined : { ownerContext }
  );
  return candidate?.mode === 'video' ? candidate : null;
}

async function readStoredVideoDraft(
  deps: VideoSessionDependencies,
  storageKey: string
): Promise<VideoSessionDraftEnvelope | undefined> {
  const value = await deps.storage.local.get<SessionDraftEnvelope>(storageKey);
  return value?.mode === 'video' ? value : undefined;
}

function requireMountedPanelCallbacks(callbacks: VideoPanelCallbacks | null): VideoPanelCallbacks {
  if (!callbacks) {
    throw new Error('Video panel callbacks were not mounted');
  }
  return callbacks;
}

function requirePromise(value: void | Promise<void>): Promise<void> {
  if (!(value instanceof Promise)) {
    throw new Error('Expected panel callback to return a Promise');
  }
  return value;
}

function requireVideoElement(): HTMLVideoElement {
  const video = document.querySelector('video');
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('video fixture did not mount');
  }
  return video;
}

function toSessionTestApi(session: VideoSession): SessionTestApi {
  return session as unknown as SessionTestApi;
}

function toDraftControllerTestApi(session: VideoSession): {
  flushNow: (
    status?: 'active' | 'restorable'
  ) => Promise<'ready' | 'failure' | 'noCaptures' | null>;
} {
  const draftController = (session as unknown as { draftController?: unknown }).draftController;
  if (
    !draftController ||
    typeof draftController !== 'object' ||
    !('flushNow' in draftController) ||
    typeof draftController.flushNow !== 'function'
  ) {
    throw new Error('draft controller was not initialized');
  }
  return draftController as {
    flushNow: (
      status?: 'active' | 'restorable'
    ) => Promise<'ready' | 'failure' | 'noCaptures' | null>;
  };
}

function seedTimestampCaptures(sessionApi: SessionTestApi, count: number): string[] {
  const now = Date.now();
  sessionApi.state.captures = Array.from({ length: count }, (_, index) => ({
    kind: 'timestamp',
    id: `timestamp-${index + 1}`,
    timeSec: 10 + index,
    comment: '',
    url: `https://video.example/watch?t=${10 + index}`,
    createdAt: now + index
  }));
  return sessionApi.state.captures.map((capture) => capture.id);
}

function pickUnrelatedCaptureId(ids: string[], activeId: string): string {
  const unrelatedId = ids.find((id) => id !== activeId);
  if (!unrelatedId) {
    throw new Error(`Unable to find unrelated capture for ${activeId}`);
  }
  return unrelatedId;
}

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createBlobScreenshotFixture(
  text: string,
  capturedAt: number,
  options: {
    id?: string;
    fileName?: string;
  } = {}
) {
  const blob = new Blob([text], { type: 'image/jpeg' });
  return {
    id: options.id ?? `shot-${capturedAt}`,
    fileName: options.fileName ?? `file-${capturedAt}.jpg`,
    mimeType: 'image/jpeg' as const,
    capturedAt,
    content: {
      kind: 'blob' as const,
      blob,
      byteLength: blob.size
    }
  };
}

function removalCallIncludesKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.includes(key);
  }
  return value === key;
}

async function flushMutationWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForMockCalls(mock: MockInstance, expectedCalls = 1, turns = 30): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    if (mock.mock.calls.length >= expectedCalls) {
      return;
    }
    await Promise.resolve();
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(0);
      continue;
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
}

async function waitForTimestampScreenshot(
  capture: CaptureState,
  turns = 30
): Promise<TimestampCaptureScreenshot> {
  for (let index = 0; index < turns; index += 1) {
    const screenshot = capture.screenshot;
    if (screenshot) {
      return screenshot;
    }
    await flushMutationWork();
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(0);
      continue;
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
  throw new Error('expected restored timestamp screenshot to be populated');
}

class RecordingMutationObserver extends MutationObserver {
  static instances: RecordingMutationObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

  constructor(public readonly callback: MutationCallback) {
    super(callback);
    RecordingMutationObserver.instances.push(this);
  }

  static reset(): void {
    RecordingMutationObserver.instances = [];
  }
}

async function readLatestVideoDraftCandidate(deps: VideoSessionDependencies) {
  const candidates = await listVideoDraftCandidates(deps);
  return [...candidates].sort((left, right) => left.updatedAt - right.updatedAt).at(-1) ?? null;
}

function createPreparationVideoHarness(
  options: {
    currentTime?: number;
    videoWidth?: number;
    videoHeight?: number;
    sourceUrl?: string;
  } = {}
) {
  const video = document.createElement('video');
  let currentTime = options.currentTime ?? 0;
  let videoWidth = options.videoWidth ?? 640;
  let videoHeight = options.videoHeight ?? 360;
  let sourceUrl = options.sourceUrl ?? 'https://cdn.example/video.mp4';
  const currentTimeSetSpy = vi.fn((value: number) => {
    currentTime = value;
    video.dispatchEvent(new Event('seeked'));
  });

  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: currentTimeSetSpy,
    configurable: true
  });
  Object.defineProperty(video, 'videoWidth', {
    get: () => videoWidth,
    configurable: true
  });
  Object.defineProperty(video, 'videoHeight', {
    get: () => videoHeight,
    configurable: true
  });
  Object.defineProperty(video, 'currentSrc', {
    get: () => sourceUrl,
    configurable: true
  });
  Object.defineProperty(video, 'src', {
    get: () => sourceUrl,
    set: (value: string) => {
      sourceUrl = value;
    },
    configurable: true
  });

  return {
    video,
    currentTimeSetSpy,
    setDimensions: (width: number, height: number) => {
      videoWidth = width;
      videoHeight = height;
    }
  };
}

function getTrackUsageEventMock(
  deps: VideoSessionDependencies
): Mock<
  <EventName extends UsageEventName>(
    event: EventName,
    params?: UsageEventParamMap[EventName]
  ) => Promise<void>
> {
  return deps.trackUsageEvent as ReturnType<typeof vi.fn>;
}

function expectNoForbiddenAnalyticsKeys(params: Record<string, unknown> | undefined): void {
  const keys = Object.keys(params ?? {});
  expect(keys).not.toContain('timestamp_count_bucket');
  expect(keys).not.toContain('fragment_count_bucket');
  expect(keys).not.toContain('has_comment');
  expect(keys).not.toContain('screenshot_requested');
  expect(keys).not.toContain('capture_kind');
  expect(keys).not.toContain('action');
  expect(keys).not.toContain('duration_ms');
  expect(keys).not.toContain('outcome');
}

describe('VideoSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '<h1>Video Title</h1><video></video>';
    document.title = 'Video Title___哔哩哔哩_bilibili';
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    });
    __resetContentSessionRegistryForTests(document);
    vi.clearAllMocks();
    saveCaptureDataMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    globalThis.MutationObserver = originalMutationObserver;
  });

  it('requires explicit dependencies', () => {
    const deps = createDependencies();
    expect(() => new VideoSession(document, deps)).not.toThrow();
  });

  it('returns early when a session is already active', async () => {
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const applyHintSpy = vi.spyOn(sessionApi, 'applyHint');
    registerVideoSession({ id: 'active' }, document);

    await session.start();

    expect(applyHintSpy).toHaveBeenCalledWith('ready');
    expect(ensureContentI18nMock).not.toHaveBeenCalled();
  });

  it('starts, mounts the panel, and registers the session', async () => {
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(isVideoSessionActive(document)).toBe(true);
    expect(view?.updateTexts).toHaveBeenCalledWith(
      expect.objectContaining({
        title: DEFAULT_SESSION_MESSAGES.panel.title
      })
    );

    sessionApi.cleanup();
  });

  it.each(['restorable', 'active'] as const)(
    'hydrates legacy %s drafts by preparing requested screenshots through fallback without touching visible playback',
    async (status) => {
      const deps = createDependencies();
      const repository = createSessionDraftRepository(deps.storage.local);
      const cacheRepositoryModule =
        await import('../../../../src/content/video/videoScreenshotCacheRepository');
      const cacheTypesModule =
        await import('../../../../src/content/video/videoScreenshotCacheTypes');
      const savedRef = {
        schemaVersion: 1 as const,
        pageKey: 'video-example',
        captureId: 'ts-1',
        id: 'shot-restore-legacy',
        key: cacheTypesModule.createVideoScreenshotCacheStorageKey({
          pageKey: 'video-example',
          captureId: 'ts-1',
          screenshotId: 'shot-restore-legacy'
        }),
        fileName: 'video-0m42s.jpg',
        mimeType: 'image/jpeg' as const,
        byteLength: 14,
        capturedAt: 2_000_000_000_300,
        expiresAt: 2_000_000_000_300 + 60_000
      };
      const loadSpy = vi.fn(async () => null);
      const saveSpy = vi.fn(
        async (): Promise<VideoScreenshotCacheSaveResult> => ({
          status: 'saved',
          ref: savedRef
        })
      );
      const createRepositorySpy = vi
        .spyOn(cacheRepositoryModule, 'createVideoScreenshotCacheRepository')
        .mockReturnValue({
          save: saveSpy,
          load: loadSpy,
          remove: vi.fn(async () => undefined),
          removeMany: vi.fn(async () => undefined),
          pruneExpired: vi.fn(async () => undefined),
          pruneToLimits: vi.fn(async () => undefined)
        });
      const envelope = createVideoSessionDraftEnvelope({
        draftId: 'draft-start-1',
        pageUrl: document.location.href,
        pageTitle: 'Draft title',
        updatedAt: 2_000_000_000_100,
        status,
        payload: buildVideoSessionDraftPayload({
          captures: [
            {
              kind: 'timestamp',
              id: 'ts-1',
              timeSec: 42,
              url: 'https://video.example/watch?t=42',
              comment: 'Restored marker',
              createdAt: 2_000_000_000_100,
              screenshotRequested: true
            },
            {
              kind: 'fragment',
              id: 'frag-1',
              timeSec: 45,
              comment: 'Restored fragment',
              selectedText: 'Quoted text',
              selectedHtml: '<p>Quoted text</p>',
              fragmentUrl: 'https://video.example/watch#:~:text=Quoted%20text',
              createdAt: 2_000_000_000_102
            }
          ],
          commentDrafts: { 'ts-1': 'draft note' },
          platform: 'bilibili',
          videoId: 'BV1xx411c7mD',
          videoTitle: 'Draft title',
          videoUrl: document.location.href,
          canonicalUrl: document.location.href
        })
      });
      await repository.save(envelope);
      const session = new VideoSession(document, deps);
      const sessionApi = toSessionTestApi(session);
      const canvas = document.createElement('canvas');
      const drawImage = vi.fn();
      const toBlob = vi.fn((callback: BlobCallback) => {
        callback(new Blob(['restored-frame'], { type: 'image/jpeg' }));
      });
      const toDataURL = vi.fn();
      const hiddenVideo = createPreparationVideoHarness({
        currentTime: 0,
        sourceUrl: 'https://cdn.example/video.mp4'
      });
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          if (tagName.toLowerCase() === 'video') {
            return hiddenVideo.video;
          }
          if (tagName.toLowerCase() === 'canvas') {
            Object.defineProperty(canvas, 'getContext', {
              value: vi.fn(() => ({ drawImage })),
              configurable: true
            });
            Object.defineProperty(canvas, 'toBlob', {
              value: toBlob,
              configurable: true
            });
            Object.defineProperty(canvas, 'toDataURL', {
              value: toDataURL,
              configurable: true
            });
            return canvas;
          }
          return Document.prototype.createElement.call(document, tagName);
        });
      const video = requireVideoElement();
      let currentTime = 8;
      let paused = false;
      const currentTimeSetSpy = vi.fn((value: number) => {
        currentTime = value;
      });
      Object.defineProperty(video, 'currentTime', {
        get: () => currentTime,
        set: currentTimeSetSpy,
        configurable: true
      });
      Object.defineProperty(video, 'paused', {
        get: () => paused,
        configurable: true
      });
      Object.defineProperty(video, 'readyState', {
        value: 4,
        configurable: true
      });
      Object.defineProperty(video, 'videoWidth', {
        value: 640,
        configurable: true
      });
      Object.defineProperty(video, 'videoHeight', {
        value: 360,
        configurable: true
      });
      Object.defineProperty(video, 'currentSrc', {
        value: 'https://cdn.example/video.mp4',
        configurable: true
      });
      Object.defineProperty(video, 'src', {
        value: 'https://cdn.example/video.mp4',
        configurable: true
      });
      const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
        paused = true;
      });
      const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
        paused = false;
        return Promise.resolve();
      });

      try {
        await session.start();
        await waitForMockCalls(drawImage);

        expect(drawImage).toHaveBeenCalledWith(hiddenVideo.video, 0, 0, 640, 360);
        expect(hiddenVideo.currentTimeSetSpy).toHaveBeenCalledWith(42);
        expect(sessionApi.state.captures).toHaveLength(2);
        const [restoredTimestamp, restoredFragment] = sessionApi.state.captures;
        expect(restoredTimestamp).toMatchObject({
          kind: 'timestamp',
          id: 'ts-1',
          screenshotRequested: true
        });
        if (restoredTimestamp?.kind !== 'timestamp') {
          throw new Error('expected restored timestamp capture');
        }
        const restoredScreenshot = await waitForTimestampScreenshot(restoredTimestamp);
        expect(restoredScreenshot).toMatchObject({
          mimeType: 'image/jpeg',
          content: {
            kind: 'blob',
            byteLength: 14
          }
        });
        expect(restoredScreenshot.content?.blob).toBeInstanceOf(Blob);
        expect(restoredScreenshot.content?.blob.size).toBe(14);
        expect(loadSpy).not.toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            captureId: 'ts-1',
            pageKey: expect.any(String),
            screenshot: restoredScreenshot
          })
        );
        expect(toBlob).toHaveBeenCalledTimes(1);
        expect(toDataURL).not.toHaveBeenCalled();
        expect(restoredFragment).toMatchObject({
          kind: 'fragment',
          id: 'frag-1',
          selectedText: 'Quoted text'
        });
        expect(currentTime).toBe(8);
        expect(currentTimeSetSpy).not.toHaveBeenCalled();
        expect(pauseSpy).not.toHaveBeenCalled();
        expect(playSpy).not.toHaveBeenCalled();
        expect(sessionApi.state.commentDrafts).toEqual({ 'ts-1': 'draft note' });
        expect(loadStoredCaptureDataMock).not.toHaveBeenCalled();

        expect(restoredTimestamp.screenshotRef).toEqual(savedRef);
        await flushMutationWork();
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 200);
        });
        await flushMutationWork();

        let candidateWithRef: VideoSessionDraftEnvelope | null = null;
        for (let index = 0; index < 20; index += 1) {
          const candidates = await listVideoDraftCandidates(deps);
          candidateWithRef =
            candidates.find((candidate) => {
              const payload = candidate.payload as VideoSessionDraftPayloadShape | undefined;
              const capture = payload?.captures[0] as
                | { screenshotRef?: VideoScreenshotCacheRef }
                | undefined;
              return capture?.screenshotRef !== undefined;
            }) ?? null;
          if (candidateWithRef) {
            break;
          }
          await flushMutationWork();
        }

        const latestPayload = candidateWithRef?.payload as
          | VideoSessionDraftPayloadShape
          | undefined;
        expect(
          latestPayload?.captures[0] as
            | {
                id?: string;
                screenshotRequested?: boolean;
                screenshotRef?: VideoScreenshotCacheRef;
              }
            | undefined
        ).toMatchObject({
          id: 'ts-1',
          screenshotRequested: true,
          screenshotRef: savedRef
        });
        expect(latestPayload?.captures[0]).not.toHaveProperty('screenshot');
        expect(latestPayload?.captures[0]).not.toHaveProperty('dataUrl');
        expect(latestPayload?.captures[0]).not.toHaveProperty('content');
      } finally {
        createElementSpy.mockRestore();
        createRepositorySpy.mockRestore();
        sessionApi.cleanup();
      }
    }
  );

  it('hydrates cached screenshot refs from restored drafts without touching visible playback or recapturing', async () => {
    const deps = createDependencies();
    const repository = createSessionDraftRepository(deps.storage.local);
    const cacheRepositoryModule =
      await import('../../../../src/content/video/videoScreenshotCacheRepository');
    const cacheTypesModule =
      await import('../../../../src/content/video/videoScreenshotCacheTypes');
    const restoredScreenshot = createBlobScreenshotFixture('cached-frame', 2_000_000_000_101, {
      id: 'shot-cached',
      fileName: 'video-0m42s.jpg'
    });
    const savedRef = {
      schemaVersion: 1 as const,
      pageKey: 'video-example',
      captureId: 'ts-1',
      id: 'shot-cached',
      key: cacheTypesModule.createVideoScreenshotCacheStorageKey({
        pageKey: 'video-example',
        captureId: 'ts-1',
        screenshotId: 'shot-cached'
      }),
      fileName: 'video-0m42s.jpg',
      mimeType: 'image/jpeg' as const,
      byteLength: restoredScreenshot.content.byteLength,
      capturedAt: restoredScreenshot.capturedAt,
      expiresAt: restoredScreenshot.capturedAt + 60_000
    };
    const loadSpy = vi.fn(async () => restoredScreenshot);
    const saveSpy = vi.fn(async (): Promise<VideoScreenshotCacheSaveResult> => {
      throw new Error('cache save should not run for cache-hit restore');
    });
    const createRepositorySpy = vi
      .spyOn(cacheRepositoryModule, 'createVideoScreenshotCacheRepository')
      .mockReturnValue({
        save: saveSpy,
        load: loadSpy,
        remove: vi.fn(async () => undefined),
        removeMany: vi.fn(async () => undefined),
        pruneExpired: vi.fn(async () => undefined),
        pruneToLimits: vi.fn(async () => undefined)
      });
    const envelope = createVideoSessionDraftEnvelope({
      draftId: 'draft-cache-hit-1',
      pageUrl: document.location.href,
      pageTitle: 'Draft title',
      updatedAt: 2_000_000_000_100,
      status: 'restorable',
      payload: buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'Restored marker',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true,
            screenshotRef: savedRef
          }
        ],
        commentDrafts: { 'ts-1': 'draft note' },
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Draft title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    });
    await repository.save(envelope);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toBlob = vi.fn();
    const toDataURL = vi.fn();
    const hiddenVideo = createPreparationVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hiddenVideo.video;
      }
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const video = requireVideoElement();
    let currentTime = 8;
    let paused = false;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      get: () => paused,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true
    });
    Object.defineProperty(video, 'videoHeight', {
      value: 360,
      configurable: true
    });
    Object.defineProperty(video, 'currentSrc', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    Object.defineProperty(video, 'src', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    try {
      await session.start();

      expect(sessionApi.state.captures).toHaveLength(1);
      const restoredTimestamp = sessionApi.state.captures[0];
      if (!restoredTimestamp || restoredTimestamp.kind !== 'timestamp') {
        throw new Error('expected restored timestamp capture');
      }

      const hydratedScreenshot = await waitForTimestampScreenshot(restoredTimestamp);
      expect(hydratedScreenshot).toBe(restoredScreenshot);
      expect(loadSpy).toHaveBeenCalledWith(savedRef);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(drawImage).not.toHaveBeenCalled();
      expect(toBlob).not.toHaveBeenCalled();
      expect(toDataURL).not.toHaveBeenCalled();
      expect(hiddenVideo.currentTimeSetSpy).not.toHaveBeenCalled();
      expect(currentTime).toBe(8);
      expect(currentTimeSetSpy).not.toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
      expect(playSpy).not.toHaveBeenCalled();
      expect(restoredTimestamp.screenshotRef).toEqual(savedRef);
      expect(loadStoredCaptureDataMock).not.toHaveBeenCalled();

      const latestCandidate = await readLatestVideoDraftCandidate(deps);
      const latestPayload = latestCandidate?.payload as VideoSessionDraftPayloadShape | undefined;
      expect(
        latestPayload?.captures[0] as
          | {
              id?: string;
              screenshotRequested?: boolean;
              screenshotRef?: VideoScreenshotCacheRef;
            }
          | undefined
      ).toMatchObject({
        id: 'ts-1',
        screenshotRequested: true,
        screenshotRef: savedRef
      });
      expect(latestPayload?.captures[0]).not.toHaveProperty('screenshot');
      expect(latestPayload?.captures[0]).not.toHaveProperty('dataUrl');
      expect(latestPayload?.captures[0]).not.toHaveProperty('content');
    } finally {
      createElementSpy.mockRestore();
      createRepositorySpy.mockRestore();
      sessionApi.cleanup();
    }
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

  it('updates live draft state without hydrating stale panel state back into the view', async () => {
    vi.useFakeTimers();
    const hydrateCommentDrafts = vi.fn<NonNullable<VideoSessionView['hydrateCommentDrafts']>>();
    const view = createView({ hydrateCommentDrafts });
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    const deps = createDependencies();
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    hydrateCommentDrafts.mockClear();

    requireMountedPanelCallbacks(mountedCallbacks).onCommentDraftChange?.({
      'timestamp-1': 'live draft from panel input'
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(sessionApi.state.commentDrafts).toEqual({
      'timestamp-1': 'live draft from panel input'
    });
    expect(hydrateCommentDrafts).not.toHaveBeenCalled();

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('cleans up after export when exact-key draft removal fails after the terminal envelope is written', async () => {
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

    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
    await expect(loadLatestVideoDraft(deps)).resolves.toBeNull();
    await expect(listVideoDraftCandidates(deps, document.location.href, null)).resolves.toEqual([]);
    expect(await readDraftIndex(deps)).toMatchObject({
      entries: [expect.objectContaining({ draftId: currentDraft.draftId, status: 'exported' })]
    });
    await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraft.draftId,
      status: 'exported'
    });

    vi.useRealTimers();
  });

  const draftMutationCases: DraftMutationCase[] = [
    {
      label: 'submit another capture',
      act: async (
        _api: SessionTestApi,
        ids: string[],
        activeId: string,
        _session: VideoSession,
        callbacks: VideoPanelCallbacks
      ) => {
        const unrelatedId = pickUnrelatedCaptureId(ids, activeId);
        await requirePromise(callbacks.onSubmitCaptureEdit(unrelatedId, 'edited comment'));
      }
    },
    {
      label: 'add timestamp',
      act: async (
        api: SessionTestApi,
        _ids: string[],
        _activeId: string,
        _session: VideoSession,
        _callbacks: VideoPanelCallbacks
      ) => {
        await api.addCurrentTimestamp('button', { beginEditing: false });
      }
    },
    {
      label: 'toggle screenshot',
      act: async (
        api: SessionTestApi,
        ids: string[],
        activeId: string,
        _session: VideoSession,
        _callbacks: VideoPanelCallbacks
      ) => {
        await api.toggleCaptureScreenshot(pickUnrelatedCaptureId(ids, activeId));
      }
    },
    {
      label: 'ingest fragment',
      act: (
        _api: SessionTestApi,
        _ids: string[],
        _activeId: string,
        session: VideoSession,
        _callbacks: VideoPanelCallbacks
      ) => {
        session.ingestTextCapture('<p>Selected text</p>', 'Selected text', 'fragment note');
      }
    },
    {
      label: 'delete another capture',
      act: (
        _api: SessionTestApi,
        ids: string[],
        activeId: string,
        _session: VideoSession,
        callbacks: VideoPanelCallbacks
      ) => {
        callbacks.onDeleteCapture(pickUnrelatedCaptureId(ids, activeId));
      }
    },
    {
      label: 'select destination',
      act: async (
        _api: SessionTestApi,
        _ids: string[],
        _activeId: string,
        _session: VideoSession,
        callbacks: VideoPanelCallbacks
      ) => {
        if (!callbacks.onSelectDestination) {
          throw new Error('destination callback was not mounted');
        }
        const selectPromise = requirePromise(callbacks.onSelectDestination('downloads'));
        await vi.advanceTimersByTimeAsync(200);
        await selectPromise;
      }
    }
  ];

  const activeDraftCases = [
    { label: 'first', activeIndex: 1 },
    { label: 'middle', activeIndex: 4 },
    { label: 'sixth', activeIndex: 6 },
    { label: 'last', activeIndex: 8 }
  ] as const;

  it.each(
    draftMutationCases.flatMap((mutationCase) =>
      activeDraftCases.map(
        (activeCase) =>
          [activeCase.label, mutationCase.label, activeCase.activeIndex, mutationCase.act] as const
      )
    )
  )(
    'syncs the %s active draft before %s',
    async (_activeLabel, _mutationLabel, activeIndex, act) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
      const activeId = `timestamp-${activeIndex}`;
      const activeDraft = `${activeId} draft that must survive runtime mutation`;
      const snapshotCommentDrafts = vi.fn(() => ({ [activeId]: activeDraft }));
      const view = createView({ snapshotCommentDrafts });
      let mountedCallbacks: VideoPanelCallbacks | null = null;
      const deps = createDependencies();
      deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
        mountedCallbacks = callbacks;
        return view;
      });
      const session = new VideoSession(document, deps);
      const sessionApi = toSessionTestApi(session);

      await session.start();
      const ids = seedTimestampCaptures(sessionApi, 8);
      sessionApi.state.commentDrafts = {
        [activeId]: 'stale draft that should be replaced'
      };
      snapshotCommentDrafts.mockClear();
      Object.defineProperty(requireVideoElement(), 'currentTime', {
        value: 99,
        configurable: true
      });

      await act(sessionApi, ids, activeId, session, requireMountedPanelCallbacks(mountedCallbacks));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(200);

      expect(sessionApi.state.commentDrafts).toMatchObject({
        [activeId]: activeDraft
      });
      expect(snapshotCommentDrafts).toHaveBeenCalled();
      const draftCandidates = await listVideoDraftCandidates(deps);
      expect(
        draftCandidates.some(
          (candidate) => candidate.payload.commentDrafts?.[activeId] === activeDraft
        )
      ).toBe(true);

      sessionApi.cleanup();
      vi.useRealTimers();
    }
  );

  it('syncs live sixth draft before pagehide flush persists a restorable draft', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const sixthDraft = 'sixth draft that must survive pagehide flush';
    const view = createView({
      snapshotCommentDrafts: vi.fn(() => ({ 'timestamp-6': sixthDraft }))
    });
    const deps = createDependencies();
    const session = new VideoSession(document, {
      ...deps,
      viewFactory: {
        createView: vi.fn(() => view)
      }
    } as VideoSessionDependencies);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    seedTimestampCaptures(sessionApi, 6);
    sessionApi.state.commentDrafts = {
      'timestamp-6': 'stale draft that should be replaced'
    };

    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    await Promise.resolve();

    const latestCandidate = await readLatestVideoDraftCandidate(deps);
    expect(sessionApi.state.commentDrafts).toMatchObject({
      'timestamp-6': sixthDraft
    });
    expect(latestCandidate?.status).toBe('restorable');
    expect(latestCandidate?.payload.commentDrafts).toMatchObject({
      'timestamp-6': sixthDraft
    });

    sessionApi.cleanup();
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

  it('cleans up after cancel when exact-key draft removal fails after the terminal envelope is written', async () => {
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
        throw new Error('remove current exact key after terminal cancel failed');
      }
      return await passthroughRemove(...args);
    });

    requireMountedPanelCallbacks(mountedCallbacks).onCancel();
    await waitForMockCalls(view.destroy);

    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
    await expect(loadLatestVideoDraft(deps)).resolves.toBeNull();
    await expect(listVideoDraftCandidates(deps, document.location.href, null)).resolves.toEqual([]);
    expect(await readDraftIndex(deps)).toMatchObject({
      entries: [expect.objectContaining({ draftId: currentDraft.draftId, status: 'discarded' })]
    });
    await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraft.draftId,
      status: 'discarded'
    });

    vi.useRealTimers();
  });

  it('writes discarded terminal envelopes to the current and restored exact draft keys before cleanup', async () => {
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
        throw new Error('keep restored exact key active before cancel');
      }
      return await passthroughRemove(...args);
    });

    const session = new VideoSession(document, deps);
    await session.start();
    await requirePromise(
      requireMountedPanelCallbacks(mountedCallbacks).onSubmitCaptureEdit('ts-1', 'committed note')
    );

    const beforeCancel = await listVideoDraftCandidates(deps, document.location.href, null);
    expect(beforeCancel).toHaveLength(2);
    const currentDraft = beforeCancel.find((candidate) => candidate.draftId !== 'restored-draft');
    if (!currentDraft) {
      throw new Error('expected a current replacement draft');
    }
    const currentDraftKey = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: currentDraft.pageKey,
      draftId: currentDraft.draftId
    });

    vi.mocked(deps.storage.local.remove).mockClear();
    vi.mocked(deps.storage.local.remove).mockImplementation(async (...args) => {
      const [value] = args;
      if (
        removalCallIncludesKey(value, currentDraftKey) ||
        removalCallIncludesKey(value, restoredDraftKey)
      ) {
        throw new Error('terminal cleanup should be best-effort');
      }
      return await passthroughRemove(...args);
    });

    requireMountedPanelCallbacks(mountedCallbacks).onCancel();
    await waitForMockCalls(view.destroy);

    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
    await expect(loadLatestVideoDraft(deps)).resolves.toBeNull();
    await expect(listVideoDraftCandidates(deps, document.location.href, null)).resolves.toEqual([]);
    const draftIndex = await readDraftIndex(deps);
    if (!draftIndex) {
      throw new Error('Expected session draft index');
    }
    expect(draftIndex.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ draftId: currentDraft.draftId, status: 'discarded' }),
        expect.objectContaining({ draftId: restoredDraft.draftId, status: 'discarded' })
      ])
    );
    await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraft.draftId,
      status: 'discarded'
    });
    await expect(readStoredVideoDraft(deps, restoredDraftKey)).resolves.toMatchObject({
      draftId: restoredDraft.draftId,
      status: 'discarded'
    });
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, currentDraftKey))
    ).toHaveLength(1);
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, restoredDraftKey))
    ).toHaveLength(1);

    vi.useRealTimers();
  });

  it('keeps the session active and suppresses cancel analytics when terminal draft persistence fails', async () => {
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
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    Object.defineProperty(requireVideoElement(), 'currentTime', {
      value: 42,
      configurable: true
    });
    await sessionApi.handleAddCapture();
    trackUsageEvent.mockClear();
    view.updateHint.mockClear();
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() =>
      Promise.reject(new Error('cancel terminal save failed'))
    );

    requireMountedPanelCallbacks(mountedCallbacks).onCancel();
    await waitForMockCalls(view.updateHint);

    expect(view.destroy).not.toHaveBeenCalled();
    expect(isVideoSessionActive(document)).toBe(true);
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(trackUsageEvent).not.toHaveBeenCalled();
    await expect(loadLatestVideoDraft(deps)).resolves.toMatchObject({ status: 'active' });

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('runs outer cleanup once after successful cancel and disables draft and screenshot cleanup hooks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const cleanupSpy = vi.spyOn(sessionApi, 'cleanup');
    const screenshotDisposeSpy = vi.spyOn(
      VideoScreenshotPreparationCoordinator.prototype,
      'dispose'
    );
    let cancelCleanupCompleted = false;

    try {
      await session.start();
      Object.defineProperty(requireVideoElement(), 'currentTime', {
        value: 42,
        configurable: true
      });
      await sessionApi.handleAddCapture();
      await vi.advanceTimersByTimeAsync(200);
      await flushMutationWork();
      await expect(loadLatestVideoDraft(deps)).resolves.toMatchObject({ status: 'active' });

      vi.mocked(deps.storage.local.setMany).mockClear();
      sessionApi.cancel();
      await waitForMockCalls(cleanupSpy);
      cancelCleanupCompleted = true;

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(screenshotDisposeSpy).toHaveBeenCalledTimes(1);
      expect(isVideoSessionActive(document)).toBe(false);
      await expect(listVideoDraftCandidates(deps)).resolves.toEqual([]);

      vi.mocked(deps.storage.local.setMany).mockClear();
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(200);
      await flushMutationWork();

      expect(deps.storage.local.setMany).not.toHaveBeenCalled();
      await expect(listVideoDraftCandidates(deps)).resolves.toEqual([]);
    } finally {
      screenshotDisposeSpy.mockRestore();
      if (!cancelCleanupCompleted) {
        sessionApi.cleanup();
      }
      vi.useRealTimers();
    }
  });

  it('preserves same-page other-owner drafts after cancel when the current exact-key cleanup fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const previousChrome = globalThis.chrome;
    const currentOwner: SessionDraftOwnerContext = { tabId: 11, windowId: 1, frameId: 0 };
    const otherOwner: SessionDraftOwnerContext = { tabId: 22, windowId: 2, frameId: 0 };
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          sendMessage: vi.fn(
            (message: object | null, callback?: (response: TabContextProbeResponse) => void) => {
              if (isTabContextProbeMessage(message)) {
                callback?.({ success: true, active: true });
                return;
              }
              callback?.({ success: true, ...currentOwner });
            }
          )
        }
      }
    });
    configureSessionDraftRuntimeMessenger(async <TResult = unknown>(message: unknown) => {
      if (isTabContextProbeMessage(message as object | null)) {
        return { success: true, active: true } as TResult;
      }
      return { success: true, ...currentOwner } as TResult;
    });
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const repository = createSessionDraftRepository(deps.storage.local);
    const existing = createVideoSessionDraftEnvelope({
      draftId: 'existing-draft',
      pageUrl: document.location.href,
      pageTitle: 'Existing title',
      updatedAt: 2_000_000_000_050,
      status: 'active',
      payload: buildVideoSessionDraftPayload({
        captures: [],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Existing title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    });
    await repository.save(existing, { ownerContext: otherOwner });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    try {
      await session.start();
      const video = requireVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
      await sessionApi.handleAddCapture();
      const beforeCancel = await listVideoDraftCandidates(deps, document.location.href, null);
      expect(beforeCancel).toHaveLength(2);
      const currentDraft = beforeCancel.find((candidate) => candidate.draftId !== 'existing-draft');
      if (!currentDraft) {
        throw new Error('expected a current draft to exist before cancel');
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
          throw new Error('keep current key to verify terminal suppression');
        }
        return await passthroughRemove(...args);
      });

      requireMountedPanelCallbacks(mountedCallbacks).onCancel();
      await waitForMockCalls(view.destroy);

      const afterCancel = await listVideoDraftCandidates(deps, document.location.href, null);
      expect(afterCancel).toHaveLength(1);
      expect(afterCancel[0]?.draftId).toBe('existing-draft');
      await expect(loadLatestVideoDraft(deps, document.location.href, null)).resolves.toMatchObject(
        {
          draftId: 'existing-draft'
        }
      );
      expect(
        createSessionDraftStorageKey({
          mode: 'video',
          pageKey: afterCancel[0]!.pageKey,
          draftId: afterCancel[0]!.draftId
        })
      ).toBe(
        createSessionDraftStorageKey({
          mode: 'video',
          pageKey: existing.pageKey,
          draftId: existing.draftId
        })
      );
      const draftIndex = await readDraftIndex(deps);
      if (!draftIndex) {
        throw new Error('Expected session draft index');
      }
      expect(draftIndex.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ draftId: 'existing-draft', status: 'active' }),
          expect.objectContaining({ draftId: currentDraft.draftId, status: 'discarded' })
        ])
      );
      await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toMatchObject({
        draftId: currentDraft.draftId,
        status: 'discarded'
      });
    } finally {
      configureSessionDraftRuntimeMessenger(null);
      sessionApi.cleanup();
      if (previousChrome === undefined) {
        Reflect.deleteProperty(globalThis, 'chrome');
      } else {
        Object.defineProperty(globalThis, 'chrome', {
          configurable: true,
          value: previousChrome
        });
      }
      vi.useRealTimers();
    }
  });

  it('emits canonical start and cancel analytics with an unknown source fallback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return createView();
    });
    const session = new VideoSession(document, deps);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();

    expect(trackUsageEvent).toHaveBeenNthCalledWith(1, 'video_session_started', {
      platform: 'bilibili',
      source: 'unknown'
    });
    expect(JSON.stringify(trackUsageEvent.mock.calls.at(0)?.[1] ?? {})).not.toContain(
      'Video Title'
    );

    vi.setSystemTime(new Date('2026-03-14T10:00:05Z'));
    requireMountedPanelCallbacks(mountedCallbacks).onCancel();
    await waitForMockCalls(trackUsageEvent, 2);

    expect(trackUsageEvent).toHaveBeenNthCalledWith(2, 'video_session_cancelled', {
      platform: 'bilibili',
      duration_bucket: '3s_to_9s'
    });
    expectNoForbiddenAnalyticsKeys(
      trackUsageEvent.mock.calls.at(0)?.[1] as Record<string, unknown>
    );
    expectNoForbiddenAnalyticsKeys(
      trackUsageEvent.mock.calls.at(1)?.[1] as Record<string, unknown>
    );
    expect(trackUsageEvent.mock.calls.map(([eventName]) => eventName)).toEqual([
      'video_session_started',
      'video_session_cancelled'
    ]);

    vi.useRealTimers();
  });

  it('adds a timestamp capture, persists it, and opens edit mode', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = document.querySelector('video');
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    const pauseSpy = vi
      .spyOn(video as HTMLVideoElement, 'pause')
      .mockImplementation(() => undefined);

    await sessionApi.handleAddCapture();

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(await listVideoDraftCandidates(deps)).toHaveLength(1);
    expect(saveCaptureDataMock).not.toHaveBeenCalled();
    expect(view?.beginEditingCapture).toHaveBeenCalledWith(
      expect.stringContaining('aiob-video-'),
      ''
    );
    expect(pauseSpy).not.toHaveBeenCalled();

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('pauses playback when timestamp capture is started from the add-note input', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = document.querySelector('video');
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi
      .spyOn(video as HTMLVideoElement, 'pause')
      .mockImplementation(() => undefined);

    await sessionApi.handleAddCapture('note-input');

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(view?.beginEditingCapture).toHaveBeenCalledWith(
      expect.stringContaining('aiob-video-'),
      ''
    );

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('pauses add-note playback before the capture save resolves', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const saveGate: { resolve?: () => void } = {};
    const deps = createDependencies();
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          saveGate.resolve = () => resolve();
        })
    );
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const addPromise = sessionApi.handleAddCapture('note-input');

    await vi.advanceTimersByTimeAsync(0);

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(view?.beginEditingCapture).not.toHaveBeenCalled();

    expect(saveGate.resolve).toBeTruthy();
    if (!saveGate.resolve) {
      throw new Error('capture save did not start');
    }
    saveGate.resolve();
    await addPromise;

    expect(view?.beginEditingCapture).toHaveBeenCalledWith(
      expect.stringContaining('aiob-video-'),
      ''
    );

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('rolls back an add-note capture and playback lease when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    vi.mocked(deps.storage.local.setMany).mockRejectedValueOnce(new Error('save failed'));
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);

    await session.start();

    const video = document.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error('video fixture did not mount');
    }
    let paused = false;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    view.setCaptures.mockClear();
    view.beginEditingCapture.mockClear();
    view.stopEditing.mockClear();
    view.updateHint.mockClear();

    await session.addCurrentTimestamp('note-input');

    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(view.beginEditingCapture).not.toHaveBeenCalled();
    expect(view.stopEditing).toHaveBeenCalled();
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);

    paused = false;
    video.dispatchEvent(new Event('play'));

    expect(pauseSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not start screenshot preparation when add-with-screenshot saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    vi.mocked(deps.storage.local.setMany).mockRejectedValueOnce(new Error('save failed'));
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,frame');
    const toBlob = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });

    await session.start();

    const video = requireVideoElement();
    let paused = false;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    view.setCaptures.mockClear();
    view.stopEditing.mockClear();
    view.updateHint.mockClear();

    await session.addCurrentTimestamp('note-input', {
      comment: 'captured frame',
      captureScreenshot: true,
      pauseVideo: true,
      beginEditing: false,
      resumePlayback: true
    });

    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
    expect(toDataURL).not.toHaveBeenCalled();
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(view.stopEditing).toHaveBeenCalled();
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();

    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('rolls back a fragment capture, highlight wrapper, and editor state when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    RecordingMutationObserver.reset();
    const restoreMutationObserver = setGlobal('MutationObserver', RecordingMutationObserver);
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();
    vi.spyOn(
      toDraftControllerTestApi(session) as { flushNow: () => Promise<'failure'> },
      'flushNow'
    ).mockImplementation(async () => {
      await deferredSave.promise;
      return 'failure';
    });

    const fragmentHost = document.createElement('p');
    fragmentHost.textContent = 'Selected text that should roll back cleanly';
    document.body.append(fragmentHost);
    const textNode = fragmentHost.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('expected fragment fixture text node');
    }
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'Selected text'.length);

    session.ingestTextCapture('<p>Selected text</p>', 'Selected text', 'fragment note', range);
    await Promise.resolve();

    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    if (typeof captureId !== 'string') {
      throw new Error('expected fragment editing to start before save');
    }
    const wrapperId = `${captureId}-wrapper`;

    expect(sessionApi.state.captures).toHaveLength(1);
    expect(document.getElementById(wrapperId)).not.toBeNull();
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toHaveLength(1);
    expect(
      trackUsageEvent.mock.calls.some(([eventName]) => eventName === 'video_fragment_added')
    ).toBe(false);
    expect(RecordingMutationObserver.instances).toHaveLength(1);

    deferredSave.resolve();
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(sessionApi.state.captures).toEqual([]);
    expect(document.getElementById(wrapperId)).toBeNull();
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(view.stopEditing).toHaveBeenCalledWith(captureId);
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(
      trackUsageEvent.mock.calls.some(([eventName]) => eventName === 'video_fragment_added')
    ).toBe(false);
    expect(RecordingMutationObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(RecordingMutationObserver.instances).toHaveLength(1);

    sessionApi.cleanup();
    restoreMutationObserver();
    vi.useRealTimers();
  });

  it('updates the panel immediately for fragment adds but emits analytics only after save succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() => deferredSave.promise);
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();

    const fragmentHost = document.createElement('p');
    fragmentHost.textContent = 'Selected text that should save';
    document.body.append(fragmentHost);
    const textNode = fragmentHost.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('expected fragment fixture text node');
    }
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'Selected text'.length);

    session.ingestTextCapture('<p>Selected text</p>', 'Selected text', 'fragment note', range);
    await Promise.resolve();

    expect(sessionApi.state.captures).toHaveLength(1);
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toHaveLength(1);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    deferredSave.resolve();
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(trackUsageEvent).toHaveBeenCalledWith('video_fragment_added', {
      capture_count_bucket: 'one'
    });

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('keeps playback paused while a note editor remains active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());

    await sessionApi.handleAddCapture('note-input');
    video.dispatchEvent(new Event('play'));

    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).not.toHaveBeenCalled();

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('does not pause playback when an existing capture editor focuses by default', async () => {
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

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());

    await session.addCurrentTimestamp('button');
    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    expect(captureId).toBeTruthy();
    if (!captureId) {
      throw new Error('timestamp capture was not created');
    }
    pauseSpy.mockClear();
    playSpy.mockClear();

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onCaptureEditorFocus?.(captureId);
    video.dispatchEvent(new Event('play'));
    callbacks.onCaptureEditorBlur?.(captureId, 'outside-panel');

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();

    callbacks.onCancel();
    vi.useRealTimers();
  });

  it('pauses and restores existing capture editor focus when comment editor auto-pause is enabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies({
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip video',
      promptShortcut: 'Alt+V',
      controlBarAutoPause: true,
      controlBarScreenshot: true,
      commentEditorAutoPause: true
    });
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);

    await session.start();

    const video = requireVideoElement();
    let paused = false;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    await session.addCurrentTimestamp('button');
    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    expect(captureId).toBeTruthy();
    if (!captureId) {
      throw new Error('timestamp capture was not created');
    }
    pauseSpy.mockClear();
    playSpy.mockClear();

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onCaptureEditorFocus?.(captureId);
    video.dispatchEvent(new Event('play'));
    callbacks.onCaptureEditorBlur?.(captureId, 'outside-panel');

    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenCalledTimes(1);

    callbacks.onCancel();
    vi.useRealTimers();
  });

  it('does not restore originally paused videos when comment editor auto-pause is enabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies({
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip video',
      promptShortcut: 'Alt+V',
      controlBarAutoPause: true,
      controlBarScreenshot: true,
      commentEditorAutoPause: true
    });
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);

    await session.start();

    const video = requireVideoElement();
    let paused = true;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    await session.addCurrentTimestamp('button');
    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    expect(captureId).toBeTruthy();
    if (!captureId) {
      throw new Error('timestamp capture was not created');
    }
    pauseSpy.mockClear();
    playSpy.mockClear();

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onCaptureEditorFocus?.(captureId);
    callbacks.onCaptureEditorBlur?.(captureId, 'outside-panel');

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();

    callbacks.onCancel();
    vi.useRealTimers();
  });

  it('restores playback after panel add-note input submits with Enter', async () => {
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

    await session.start();

    const video = requireVideoElement();
    let paused = false;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    await session.addCurrentTimestamp('note-input');
    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    expect(captureId).toBeTruthy();
    if (!captureId) {
      throw new Error('add-note did not create a capture');
    }

    const submitGate: { resolve?: () => void } = {};
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          submitGate.resolve = () => resolve();
        })
    );
    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const submitPromise = requirePromise(callbacks.onSubmitCaptureEdit(captureId, 'panel note'));
    await vi.advanceTimersByTimeAsync(0);

    paused = false;
    video.dispatchEvent(new Event('play'));
    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).not.toHaveBeenCalled();

    expect(submitGate.resolve).toBeTruthy();
    submitGate.resolve?.();
    await submitPromise;

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(view.stopEditing).toHaveBeenCalledWith(captureId);

    callbacks.onCancel();
    vi.useRealTimers();
  });

  it('preserves add-note playback restore state across repeated editor focus', async () => {
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

    await session.start();

    const video = requireVideoElement();
    let paused = false;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    await session.addCurrentTimestamp('note-input');
    const captureId = view.beginEditingCapture.mock.calls.at(-1)?.[0];
    expect(captureId).toBeTruthy();
    if (!captureId) {
      throw new Error('add-note did not create a capture');
    }

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onCaptureEditorFocus?.(captureId);
    callbacks.onCaptureEditorFocus?.(captureId);

    const submitPromise = requirePromise(callbacks.onSubmitCaptureEdit(captureId, 'panel note'));
    await submitPromise;

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);

    callbacks.onCancel();
    vi.useRealTimers();
  });

  it('rolls back capture comment edits and restores the previous draft when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    vi.mocked(deps.storage.local.setMany).mockRejectedValueOnce(new Error('save failed'));
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'original note',
        url: 'https://video.example/watch?t=42',
        createdAt: 1
      }
    ];
    sessionApi.state.commentDrafts = {
      'timestamp-1': 'panel draft note'
    };
    view.setCaptures.mockClear();
    view.stopEditing.mockClear();
    view.updateHint.mockClear();

    await requirePromise(
      requireMountedPanelCallbacks(mountedCallbacks).onSubmitCaptureEdit(
        'timestamp-1',
        'edited note'
      )
    );

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'original note' });
    expect(sessionApi.state.commentDrafts).toEqual({
      'timestamp-1': 'panel draft note'
    });
    const panelCaptures = view.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ comment?: string }>
      | undefined;
    expect(panelCaptures?.[0]).toMatchObject({ comment: 'original note' });
    expect(view.stopEditing).not.toHaveBeenCalled();
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('queues add timestamp mutations while a draft-mode user save is in flight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
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
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'original note',
        url: 'https://video.example/watch?t=42',
        createdAt: 1
      }
    ];
    Object.defineProperty(requireVideoElement(), 'currentTime', {
      value: 52,
      configurable: true
    });
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() => deferredSave.promise);

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const submitPromise = requirePromise(
      callbacks.onSubmitCaptureEdit('timestamp-1', 'edited note')
    );
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(sessionApi.state.saving).toBe(true);

    const addPromise = sessionApi.addCurrentTimestamp('button', { beginEditing: false });
    await flushMutationWork();

    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(sessionApi.state.captures).toHaveLength(1);

    deferredSave.resolve();
    await submitPromise;
    await addPromise;

    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(2);
    expect(sessionApi.state.captures).toHaveLength(2);
    expect(sessionApi.state.captures[1]).toMatchObject({
      kind: 'timestamp',
      timeSec: 52
    });
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('queues screenshot toggles behind an in-flight capture edit and keeps saving true until both saves finish', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const firstSave = createDeferred<'ready'>();
    const secondSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
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
    vi.spyOn(
      toDraftControllerTestApi(session) as {
        flushNow: () => Promise<'ready'>;
      },
      'flushNow'
    ).mockImplementation(async () => {
      const saveIndex = saveEvents.filter((event) => event.endsWith(':start')).length;
      const gate = saveIndex === 0 ? firstSave : secondSave;
      saveEvents.push(`save-${saveIndex + 1}:start`);
      const result = await gate.promise;
      saveEvents.push(`save-${saveIndex + 1}:end`);
      return result;
    });
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-edit',
        timeSec: 10,
        comment: 'original note',
        url: 'https://video.example/watch?t=10',
        createdAt: 1
      },
      {
        kind: 'timestamp',
        id: 'ts-toggle',
        timeSec: 20,
        comment: '',
        url: 'https://video.example/watch?t=20',
        createdAt: 2
      }
    ];

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const editPromise = requirePromise(callbacks.onSubmitCaptureEdit('ts-edit', 'edited note'));
    await flushMutationWork();

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'edited note' });
    expect(saveEvents).toEqual(['save-1:start']);
    expect(sessionApi.state.saving).toBe(true);

    const togglePromise = sessionApi.toggleCaptureScreenshot('ts-toggle');
    await flushMutationWork();

    expect(sessionApi.state.captures[1]).not.toHaveProperty('screenshotRequested');
    expect(saveEvents).toEqual(['save-1:start']);
    expect(sessionApi.state.saving).toBe(true);

    firstSave.resolve('ready');
    await editPromise;
    await flushMutationWork();

    expect(sessionApi.state.captures[1]).toMatchObject({ screenshotRequested: true });
    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start']);
    expect(sessionApi.state.saving).toBe(true);

    secondSave.resolve('ready');
    await togglePromise;
    await flushMutationWork();

    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start', 'save-2:end']);
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('runs queued mutations after a failed save rolls back the active video mutation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const firstSave = createDeferred<'failure'>();
    const secondSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
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
    vi.spyOn(
      toDraftControllerTestApi(session) as {
        flushNow: () => Promise<'ready' | 'failure'>;
      },
      'flushNow'
    ).mockImplementation(async () => {
      const saveIndex = saveEvents.filter((event) => event.endsWith(':start')).length;
      const gate = saveIndex === 0 ? firstSave : secondSave;
      saveEvents.push(`save-${saveIndex + 1}:start`);
      const result = await gate.promise;
      saveEvents.push(`save-${saveIndex + 1}:end`);
      return result;
    });
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-edit',
        timeSec: 10,
        comment: 'original note',
        url: 'https://video.example/watch?t=10',
        createdAt: 1
      },
      {
        kind: 'timestamp',
        id: 'ts-toggle',
        timeSec: 20,
        comment: '',
        url: 'https://video.example/watch?t=20',
        createdAt: 2
      }
    ];
    sessionApi.state.commentDrafts = {
      'ts-edit': 'draft note'
    };

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const editPromise = requirePromise(callbacks.onSubmitCaptureEdit('ts-edit', 'edited note'));
    await flushMutationWork();
    const togglePromise = sessionApi.toggleCaptureScreenshot('ts-toggle');
    await flushMutationWork();

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'edited note' });
    expect(sessionApi.state.captures[1]).not.toHaveProperty('screenshotRequested');
    expect(saveEvents).toEqual(['save-1:start']);

    firstSave.resolve('failure');
    await editPromise;
    await flushMutationWork();

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'original note' });
    expect(sessionApi.state.commentDrafts).toEqual({
      'ts-edit': 'draft note'
    });
    expect(sessionApi.state.captures[1]).toMatchObject({ screenshotRequested: true });
    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start']);

    secondSave.resolve('ready');
    await togglePromise;
    await flushMutationWork();

    expect(sessionApi.state.captures[1]).toMatchObject({ screenshotRequested: true });
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('queues fragment adds behind the same video mutation runner', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const firstSave = createDeferred<'ready'>();
    const secondSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();
    vi.spyOn(
      toDraftControllerTestApi(session) as {
        flushNow: () => Promise<'ready'>;
      },
      'flushNow'
    ).mockImplementation(async () => {
      const saveIndex = saveEvents.filter((event) => event.endsWith(':start')).length;
      const gate = saveIndex === 0 ? firstSave : secondSave;
      saveEvents.push(`save-${saveIndex + 1}:start`);
      const result = await gate.promise;
      saveEvents.push(`save-${saveIndex + 1}:end`);
      return result;
    });
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-edit',
        timeSec: 10,
        comment: 'original note',
        url: 'https://video.example/watch?t=10',
        createdAt: 1
      }
    ];

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const editPromise = requirePromise(callbacks.onSubmitCaptureEdit('ts-edit', 'edited note'));
    await flushMutationWork();

    session.ingestTextCapture('<p>Queued fragment</p>', 'Queued fragment', 'fragment note');
    await flushMutationWork();

    expect(sessionApi.state.captures).toHaveLength(1);
    expect(trackUsageEvent).not.toHaveBeenCalled();
    expect(saveEvents).toEqual(['save-1:start']);

    firstSave.resolve('ready');
    await editPromise;
    await flushMutationWork();

    expect(sessionApi.state.captures).toHaveLength(2);
    expect(sessionApi.state.captures[1]).toMatchObject({
      kind: 'fragment',
      comment: 'fragment note',
      selectedText: 'Queued fragment'
    });
    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start']);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    secondSave.resolve('ready');
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(trackUsageEvent).toHaveBeenCalledWith('video_fragment_added', {
      capture_count_bucket: 'two_to_five'
    });
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('resolves queued delete targets at apply time when same-call-stack deletes shift capture indexes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const firstSave = createDeferred<'ready'>();
    const secondSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
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
    vi.spyOn(
      toDraftControllerTestApi(session) as {
        flushNow: () => Promise<'ready'>;
      },
      'flushNow'
    ).mockImplementation(async () => {
      const saveIndex = saveEvents.filter((event) => event.endsWith(':start')).length;
      const gate = saveIndex === 0 ? firstSave : secondSave;
      saveEvents.push(`save-${saveIndex + 1}:start`);
      const result = await gate.promise;
      saveEvents.push(`save-${saveIndex + 1}:end`);
      return result;
    });
    seedTimestampCaptures(sessionApi, 3);

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onDeleteCapture('timestamp-1');
    callbacks.onDeleteCapture('timestamp-2');
    await flushMutationWork();

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual([
      'timestamp-2',
      'timestamp-3'
    ]);
    expect(saveEvents).toEqual(['save-1:start']);

    firstSave.resolve('ready');
    for (let index = 0; index < 10 && !saveEvents.includes('save-2:start'); index += 1) {
      await flushMutationWork();
    }

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual(['timestamp-3']);
    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start']);

    secondSave.resolve('ready');
    for (let index = 0; index < 10 && !saveEvents.includes('save-2:end'); index += 1) {
      await flushMutationWork();
    }
    for (let index = 0; index < 10 && sessionApi.state.saving; index += 1) {
      await flushMutationWork();
    }

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual(['timestamp-3']);
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('skips queued edit and screenshot toggle when an earlier queued delete removes the target before apply', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const firstSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
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
    vi.spyOn(
      toDraftControllerTestApi(session) as {
        flushNow: () => Promise<'ready'>;
      },
      'flushNow'
    ).mockImplementation(async () => {
      const saveIndex = saveEvents.filter((event) => event.endsWith(':start')).length;
      saveEvents.push(`save-${saveIndex + 1}:start`);
      if (saveIndex === 0) {
        const result = await firstSave.promise;
        saveEvents.push('save-1:end');
        return result;
      }
      saveEvents.push(`save-${saveIndex + 1}:end`);
      return 'ready';
    });
    seedTimestampCaptures(sessionApi, 2);
    sessionApi.state.commentDrafts = {
      'timestamp-2': 'queued draft'
    };

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    callbacks.onDeleteCapture('timestamp-2');
    const editPromise = requirePromise(callbacks.onSubmitCaptureEdit('timestamp-2', 'edited'));
    const togglePromise = sessionApi.toggleCaptureScreenshot('timestamp-2');
    await flushMutationWork();

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual(['timestamp-1']);
    expect(saveEvents).toEqual(['save-1:start']);

    firstSave.resolve('ready');
    await editPromise;
    await togglePromise;
    await flushMutationWork();

    expect(sessionApi.state.captures).toEqual([expect.objectContaining({ id: 'timestamp-1' })]);
    expect(saveEvents).toEqual(['save-1:start', 'save-1:end']);
    expect(sessionApi.state.saving).toBe(false);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('keeps capture edits committed and retries restored-draft cleanup after the durable save succeeds', async () => {
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
    let failCleanup = true;
    vi.mocked(deps.storage.local.remove).mockImplementation(async (...args) => {
      const [value] = args;
      if (failCleanup && removalCallIncludesKey(value, restoredDraftKey)) {
        failCleanup = false;
        throw new Error('cleanup failed after durable save');
      }
      return await passthroughRemove(...args);
    });

    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    view.stopEditing.mockClear();
    view.updateHint.mockClear();

    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    await requirePromise(callbacks.onSubmitCaptureEdit('ts-1', 'committed note'));

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'committed note' });
    expect(view.stopEditing).toHaveBeenCalledWith('ts-1');
    expect(view.updateHint.mock.calls.map(([message]) => message)).not.toContain(
      DEFAULT_SESSION_MESSAGES.hintFailure
    );
    const draftIdsAfterFailedCleanup = (
      await listVideoDraftCandidates(deps, document.location.href, null)
    ).map((candidate) => candidate.draftId);
    expect(draftIdsAfterFailedCleanup).toContain('restored-draft');
    expect(draftIdsAfterFailedCleanup.length).toBeGreaterThanOrEqual(2);

    view.stopEditing.mockClear();
    await requirePromise(callbacks.onSubmitCaptureEdit('ts-1', 'committed note v2'));

    expect(sessionApi.state.captures[0]).toMatchObject({ comment: 'committed note v2' });
    expect(view.stopEditing).toHaveBeenCalledWith('ts-1');
    const draftIdsAfterRetry = (
      await listVideoDraftCandidates(deps, document.location.href, null)
    ).map((candidate) => candidate.draftId);
    expect(draftIdsAfterRetry).not.toContain('restored-draft');
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, restoredDraftKey))
    ).toHaveLength(2);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('persists screenshot intent before starting background screenshot preparation for control bar note captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,frame');
    let resolveToBlob: ((blob: Blob | null) => void) | null = null;
    const toBlob = vi.fn((callback: (blob: Blob | null) => void) => {
      resolveToBlob = callback;
    });
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          Object.defineProperty(canvas, 'getContext', {
            value: vi.fn(() => ({ drawImage })),
            configurable: true
          });
          Object.defineProperty(canvas, 'toBlob', {
            value: toBlob,
            configurable: true
          });
          Object.defineProperty(canvas, 'toDataURL', {
            value: toDataURL,
            configurable: true
          });
          return canvas;
        }
        return Document.prototype.createElement.call(document, tagName);
      });

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    const setManyMock = deps.storage.local.setMany as unknown as Mock;
    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    setManyMock.mockClear();
    view?.setCaptures.mockClear();
    view?.collapse.mockClear();

    await sessionApi.addCurrentTimestamp('note-input', {
      comment: 'captured frame',
      captureScreenshot: true,
      pauseVideo: true,
      beginEditing: false,
      resumePlayback: true,
      collapseAfterCapture: true
    });
    await waitForMockCalls(drawImage);

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toDataURL).not.toHaveBeenCalled();
    expect(setManyMock.mock.invocationCallOrder[0]).toBeLessThan(
      toBlob.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(sessionApi.state.captures[0]).toMatchObject({
      comment: 'captured frame',
      screenshotRequested: true
    });
    expect(sessionApi.state.captures[0]).not.toHaveProperty('screenshot');
    expect(view?.stopEditing).toHaveBeenCalled();
    expect(view?.collapse).toHaveBeenCalledTimes(1);
    expect(view?.collapse.mock.invocationCallOrder[0]).toBeLessThan(
      view?.setCaptures.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );

    const completeBackgroundCapture = resolveToBlob as ((blob: Blob | null) => void) | null;
    if (!completeBackgroundCapture) {
      throw new Error('expected background screenshot preparation to start');
    }
    completeBackgroundCapture(null);
    await Promise.resolve();
    await Promise.resolve();
    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('toggles timestamp screenshots without exposing screenshot content in the panel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: vi.fn(() => 'data:image/jpeg;base64,toggled-frame'),
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });

    await session.start();

    const video = requireVideoElement();
    let currentTime = 8;
    let paused = false;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
      video.dispatchEvent(new Event('seeked'));
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      get: () => paused,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'note',
        url: 'https://video.example/watch?t=42',
        createdAt: Date.now()
      }
    ];

    await sessionApi.toggleCaptureScreenshot('timestamp-1');

    expect(video.currentTime).toBe(8);
    expect(currentTimeSetSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(sessionApi.state.captures[0]).toMatchObject({
      screenshotRequested: true
    });
    expect(sessionApi.state.captures[0]?.screenshot).toBeUndefined();
    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    const panelCaptures = view?.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string; screenshot?: unknown }>
      | undefined;
    expect(panelCaptures?.[0]).toMatchObject({
      hasScreenshot: false,
      screenshotState: 'pending'
    });
    expect(panelCaptures?.[0]?.screenshot).toBeUndefined();

    await sessionApi.toggleCaptureScreenshot('timestamp-1');

    expect(sessionApi.state.captures[0]?.screenshot).toBeUndefined();
    expect(sessionApi.state.captures[0]).not.toHaveProperty('screenshotRequested');
    const toggledOffCaptures = view?.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string }>
      | undefined;
    expect(toggledOffCaptures?.[0]).toMatchObject({
      hasScreenshot: false,
      screenshotState: 'off'
    });

    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('rolls back screenshot export intent and restores the previous screenshot state when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const previousScreenshot = createBlobScreenshotFixture('cached-frame', 2_026_031_410_000, {
      fileName: 'file-20260314100000000.jpg'
    });

    await session.start();
    vi.spyOn(
      toDraftControllerTestApi(session) as { flushNow: () => Promise<'failure'> },
      'flushNow'
    ).mockImplementation(async () => {
      await deferredSave.promise;
      return 'failure';
    });

    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'note',
        url: 'https://video.example/watch?t=42',
        createdAt: 1,
        screenshotRequested: true,
        screenshot: previousScreenshot
      }
    ];

    const togglePromise = sessionApi.toggleCaptureScreenshot('timestamp-1');
    await vi.advanceTimersByTimeAsync(0);

    expect(sessionApi.state.captures[0]).not.toHaveProperty('screenshotRequested');
    expect(sessionApi.state.captures[0]?.screenshot).toBe(previousScreenshot);
    const toggledOffCaptures = view.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string }>
      | undefined;
    expect(toggledOffCaptures?.[0]).toMatchObject({
      hasScreenshot: false,
      screenshotState: 'off'
    });

    deferredSave.resolve();
    await togglePromise;

    expect(sessionApi.state.captures[0]).toMatchObject({
      screenshotRequested: true,
      screenshot: previousScreenshot
    });
    const restoredCaptures = view.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string; screenshot?: unknown }>
      | undefined;
    expect(restoredCaptures?.[0]).toMatchObject({ hasScreenshot: true, screenshotState: 'on' });
    expect(restoredCaptures?.[0]?.screenshot).toBeUndefined();
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('rolls back screenshot intent and does not start screenshot preparation when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,should-not-run');
    const toBlob = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });

    await session.start();
    vi.spyOn(
      toDraftControllerTestApi(session) as { flushNow: () => Promise<'failure'> },
      'flushNow'
    ).mockImplementation(async () => {
      await deferredSave.promise;
      return 'failure';
    });

    const video = requireVideoElement();
    let currentTime = 8;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
      video.dispatchEvent(new Event('seeked'));
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      value: false,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'note',
        url: 'https://video.example/watch?t=42',
        createdAt: Date.now()
      }
    ];

    const togglePromise = sessionApi.toggleCaptureScreenshot('timestamp-1');
    await vi.advanceTimersByTimeAsync(0);

    expect(sessionApi.state.captures[0]).toMatchObject({ screenshotRequested: true });
    const toggledOnCaptures = view.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string }>
      | undefined;
    expect(toggledOnCaptures?.[0]).toMatchObject({
      hasScreenshot: false,
      screenshotState: 'pending'
    });

    deferredSave.resolve();
    await togglePromise;
    await vi.advanceTimersByTimeAsync(200);

    expect(sessionApi.state.captures[0]).not.toHaveProperty('screenshotRequested');
    expect(sessionApi.state.captures[0]?.screenshot).toBeUndefined();
    const rolledBackCaptures = view.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string }>
      | undefined;
    expect(rolledBackCaptures?.[0]).toMatchObject({
      hasScreenshot: false,
      screenshotState: 'off'
    });
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(currentTimeSetSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
    expect(toDataURL).not.toHaveBeenCalled();

    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('reuses same-session transient screenshots when a requested screenshot is toggled back on', async () => {
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: vi.fn(() => 'data:image/jpeg;base64,unexpected-frame'),
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });

    await session.start();

    const video = requireVideoElement();
    let currentTime = 8;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
      video.dispatchEvent(new Event('seeked'));
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: 'note',
        url: 'https://video.example/watch?t=42',
        createdAt: 1,
        screenshotRequested: true,
        screenshot: createBlobScreenshotFixture('cached-frame', 2_026_031_410_000, {
          fileName: 'file-20260314100000000.jpg'
        })
      }
    ];

    await sessionApi.toggleCaptureScreenshot('timestamp-1');

    expect(sessionApi.state.captures[0]?.screenshot).toMatchObject({
      content: {
        kind: 'blob',
        byteLength: 12
      }
    });
    expect(sessionApi.state.captures[0]).not.toHaveProperty('screenshotRequested');

    await sessionApi.toggleCaptureScreenshot('timestamp-1');

    expect(video.currentTime).toBe(8);
    expect(currentTimeSetSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(sessionApi.state.captures[0]).toMatchObject({
      screenshotRequested: true,
      screenshot: {
        content: {
          kind: 'blob',
          byteLength: 12
        }
      }
    });
    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    const panelCaptures = view?.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshotState?: string; screenshot?: unknown }>
      | undefined;
    expect(panelCaptures?.[0]).toMatchObject({ hasScreenshot: true, screenshotState: 'on' });
    expect(panelCaptures?.[0]?.screenshot).toBeUndefined();

    createElementSpy.mockRestore();
    sessionApi.cleanup();
  });

  it('writes through prepared screenshots asynchronously, assigns screenshot refs after save, and schedules draft persistence', async () => {
    const deps = createDependencies();
    const repository = createSessionDraftRepository(deps.storage.local);
    const saveDeferred = createDeferred<{ status: 'saved'; ref: VideoScreenshotCacheRef }>();
    const cacheRepositoryModule =
      await import('../../../../src/content/video/videoScreenshotCacheRepository');
    const cacheTypesModule =
      await import('../../../../src/content/video/videoScreenshotCacheTypes');
    const saveSpy = vi.fn(
      async (): Promise<VideoScreenshotCacheSaveResult> => saveDeferred.promise
    );
    const createRepositorySpy = vi
      .spyOn(cacheRepositoryModule, 'createVideoScreenshotCacheRepository')
      .mockReturnValue({
        save: saveSpy,
        load: vi.fn(async () => null),
        remove: vi.fn(async () => undefined),
        removeMany: vi.fn(async () => undefined),
        pruneExpired: vi.fn(async () => undefined),
        pruneToLimits: vi.fn(async () => undefined)
      });
    const envelope = createVideoSessionDraftEnvelope({
      draftId: 'draft-write-through-1',
      pageUrl: document.location.href,
      pageTitle: 'Draft title',
      updatedAt: 2_000_000_000_200,
      status: 'restorable',
      payload: buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'Restored marker',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Draft title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    });
    await repository.save(envelope);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(['prepared-frame'], { type: 'image/jpeg' }));
    });
    const toDataURL = vi.fn();
    const hiddenVideo = createPreparationVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hiddenVideo.video;
      }
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const video = requireVideoElement();
    let currentTime = 8;
    let paused = false;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      get: () => paused,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true
    });
    Object.defineProperty(video, 'videoHeight', {
      value: 360,
      configurable: true
    });
    Object.defineProperty(video, 'currentSrc', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    Object.defineProperty(video, 'src', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    const savedRef = {
      schemaVersion: 1 as const,
      pageKey: 'video-example',
      captureId: 'ts-1',
      id: 'shot-42',
      key: cacheTypesModule.createVideoScreenshotCacheStorageKey({
        pageKey: 'video-example',
        captureId: 'ts-1',
        screenshotId: 'shot-42'
      }),
      fileName: 'video-0m42s.jpg',
      mimeType: 'image/jpeg' as const,
      byteLength: 14,
      capturedAt: 2_000_000_000_300,
      expiresAt: 2_000_000_000_300 + 60_000
    };

    try {
      await session.start();
      await waitForMockCalls(drawImage);

      expect(sessionApi.state.captures).toHaveLength(1);
      const restoredTimestamp = sessionApi.state.captures[0];
      if (!restoredTimestamp || restoredTimestamp.kind !== 'timestamp') {
        throw new Error('expected restored timestamp capture');
      }
      const screenshot = await waitForTimestampScreenshot(restoredTimestamp);

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          captureId: 'ts-1',
          pageKey: expect.any(String),
          screenshot
        })
      );
      expect(restoredTimestamp.screenshot).toBe(screenshot);
      expect(restoredTimestamp.screenshotRef).toBeUndefined();
      expect(currentTime).toBe(8);
      expect(currentTimeSetSpy).not.toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
      expect(playSpy).not.toHaveBeenCalled();

      saveDeferred.resolve({
        status: 'saved',
        ref: savedRef
      });
      await flushMutationWork();
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 200);
      });
      await flushMutationWork();

      expect(restoredTimestamp.screenshotRef).toEqual(savedRef);
      let latestCandidate = await readLatestVideoDraftCandidate(deps);
      for (let index = 0; index < 20; index += 1) {
        const latestPayload = latestCandidate?.payload as VideoSessionDraftPayloadShape | undefined;
        const latestCapture = latestPayload?.captures[0] as
          | { screenshotRef?: VideoScreenshotCacheRef }
          | undefined;
        if (latestCapture?.screenshotRef) {
          break;
        }
        await flushMutationWork();
        latestCandidate = await readLatestVideoDraftCandidate(deps);
      }
      const latestPayload = latestCandidate?.payload as VideoSessionDraftPayloadShape | undefined;
      expect(
        latestPayload?.captures[0] as
          | {
              id?: string;
              screenshotRequested?: boolean;
              screenshotRef?: VideoScreenshotCacheRef;
            }
          | undefined
      ).toMatchObject({
        id: 'ts-1',
        screenshotRequested: true,
        screenshotRef: savedRef
      });
      expect(toDataURL).not.toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
      createRepositorySpy.mockRestore();
      sessionApi.cleanup();
    }
  });

  it('keeps prepared screenshots in memory when cache write-through fails', async () => {
    const deps = createDependencies();
    const repository = createSessionDraftRepository(deps.storage.local);
    const cacheRepositoryModule =
      await import('../../../../src/content/video/videoScreenshotCacheRepository');
    const saveSpy = vi.fn(async (): Promise<VideoScreenshotCacheSaveResult> => {
      throw new Error('cache write failed');
    });
    const createRepositorySpy = vi
      .spyOn(cacheRepositoryModule, 'createVideoScreenshotCacheRepository')
      .mockReturnValue({
        save: saveSpy,
        load: vi.fn(async () => null),
        remove: vi.fn(async () => undefined),
        removeMany: vi.fn(async () => undefined),
        pruneExpired: vi.fn(async () => undefined),
        pruneToLimits: vi.fn(async () => undefined)
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const envelope = createVideoSessionDraftEnvelope({
      draftId: 'draft-write-through-failure-1',
      pageUrl: document.location.href,
      pageTitle: 'Draft title',
      updatedAt: 2_000_000_000_200,
      status: 'restorable',
      payload: buildVideoSessionDraftPayload({
        captures: [
          {
            kind: 'timestamp',
            id: 'ts-1',
            timeSec: 42,
            url: 'https://video.example/watch?t=42',
            comment: 'Restored marker',
            createdAt: 2_000_000_000_100,
            screenshotRequested: true
          }
        ],
        commentDrafts: {},
        platform: 'bilibili',
        videoId: 'BV1xx411c7mD',
        videoTitle: 'Draft title',
        videoUrl: document.location.href,
        canonicalUrl: document.location.href
      })
    });
    await repository.save(envelope);
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(['prepared-frame'], { type: 'image/jpeg' }));
    });
    const toDataURL = vi.fn();
    const hiddenVideo = createPreparationVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hiddenVideo.video;
      }
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const video = requireVideoElement();
    let currentTime = 8;
    let paused = false;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      get: () => paused,
      configurable: true
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true
    });
    Object.defineProperty(video, 'videoHeight', {
      value: 360,
      configurable: true
    });
    Object.defineProperty(video, 'currentSrc', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    Object.defineProperty(video, 'src', {
      value: 'https://cdn.example/video.mp4',
      configurable: true
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });

    try {
      await session.start();
      await waitForMockCalls(drawImage);

      const restoredTimestamp = sessionApi.state.captures[0];
      if (!restoredTimestamp || restoredTimestamp.kind !== 'timestamp') {
        throw new Error('expected restored timestamp capture');
      }
      const screenshot = await waitForTimestampScreenshot(restoredTimestamp);
      await flushMutationWork();

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(restoredTimestamp.screenshot).toBe(screenshot);
      expect(restoredTimestamp.screenshotRef).toBeUndefined();
      expect(currentTime).toBe(8);
      expect(currentTimeSetSpy).not.toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
      expect(playSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[VideoSession] Failed to persist prepared screenshot:',
        expect.any(Error)
      );
      const latestCandidate = await readLatestVideoDraftCandidate(deps);
      const latestPayload = latestCandidate?.payload as VideoSessionDraftPayloadShape | undefined;
      expect(latestPayload?.captures[0]).toMatchObject({
        id: 'ts-1',
        screenshotRequested: true
      });
      expect(latestPayload?.captures[0]).not.toHaveProperty('screenshotRef');
      expect(toDataURL).not.toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
      createRepositorySpy.mockRestore();
      warnSpy.mockRestore();
      sessionApi.cleanup();
    }
  });

  it('emits only canonical capture analytics events without privacy-sensitive params', async () => {
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
    const trackUsageEvent = getTrackUsageEventMock(deps);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(['private-frame'], { type: 'image/jpeg' }));
    });
    const toDataURL = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toBlob', {
          value: toBlob,
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: toDataURL,
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });

    await session.start();

    const video = requireVideoElement();
    let currentTime = 42;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'paused', {
      value: false,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());

    await session.addCurrentTimestamp('button');
    session.ingestTextCapture('<p>Private fragment</p>', 'Private fragment', 'Private comment');
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();
    const timestampId = sessionApi.state.captures.find(
      (capture) => capture.kind === 'timestamp'
    )?.id;
    const fragmentId = (
      sessionApi.state.captures as Array<{
        kind: 'timestamp' | 'fragment';
        id: string;
      }>
    ).find((capture) => capture.kind === 'fragment')?.id;
    if (!timestampId || !fragmentId) {
      throw new Error('expected timestamp and fragment captures');
    }

    await sessionApi.toggleCaptureScreenshot(timestampId);
    await waitForMockCalls(drawImage);
    await sessionApi.toggleCaptureScreenshot(timestampId);
    requireMountedPanelCallbacks(mountedCallbacks).onDeleteCapture(fragmentId);
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(trackUsageEvent.mock.calls.map(([eventName]) => eventName)).toEqual([
      'video_session_started',
      'video_timestamp_added',
      'video_fragment_added',
      'video_capture_removed'
    ]);
    expect(trackUsageEvent).toHaveBeenNthCalledWith(2, 'video_timestamp_added', {
      capture_count_bucket: 'one'
    });
    expect(trackUsageEvent).toHaveBeenNthCalledWith(3, 'video_fragment_added', {
      capture_count_bucket: 'two_to_five'
    });
    expect(trackUsageEvent).toHaveBeenNthCalledWith(4, 'video_capture_removed', {
      capture_count_bucket: 'one'
    });
    expect(currentTimeSetSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toDataURL).not.toHaveBeenCalled();

    const analyticsPayload = trackUsageEvent.mock.calls
      .map(([, params]) => JSON.stringify(params ?? {}))
      .join('\n');
    expect(analyticsPayload).not.toContain('Private fragment');
    expect(analyticsPayload).not.toContain('Private comment');
    expect(analyticsPayload).not.toContain('private-frame');
    expect(analyticsPayload).not.toContain('byteLength');
    expect(analyticsPayload).not.toContain('https://video.example');
    expect(
      trackUsageEvent.mock.calls.some(
        ([eventName]) => String(eventName) === 'video_screenshot_toggled'
      )
    ).toBe(false);
    expect(
      trackUsageEvent.mock.calls.some(
        ([eventName]) => String(eventName) === 'video_session_exported'
      )
    ).toBe(false);
    expect(
      trackUsageEvent.mock.calls.some(([eventName]) => String(eventName) === 'video_session_failed')
    ).toBe(false);
    trackUsageEvent.mock.calls.forEach(([, params]) => {
      expectNoForbiddenAnalyticsKeys(params as Record<string, unknown> | undefined);
    });

    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('does not emit video_timestamp_added until the timestamp save succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    const view = createView();
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();

    Object.defineProperty(requireVideoElement(), 'currentTime', {
      value: 42,
      configurable: true
    });
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() => deferredSave.promise);

    const addPromise = session.addCurrentTimestamp('button', { beginEditing: false });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(deps.storage.local.setMany).toHaveBeenCalledTimes(1);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    deferredSave.resolve();
    await addPromise;

    expect(trackUsageEvent).toHaveBeenCalledTimes(1);
    expect(trackUsageEvent).toHaveBeenCalledWith('video_timestamp_added', {
      capture_count_bucket: 'one'
    });
  });

  it('rolls back fragment removal, restores drafts and highlights, and suppresses removal analytics when saving fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();
    vi.spyOn(
      toDraftControllerTestApi(session) as { flushNow: () => Promise<'failure'> },
      'flushNow'
    ).mockImplementation(async () => {
      await deferredSave.promise;
      return 'failure';
    });

    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 10,
        comment: '',
        url: 'https://video.example/watch?t=10',
        createdAt: 1
      },
      {
        kind: 'fragment',
        id: 'frag-1',
        comment: 'fragment note',
        selectedText: 'Quoted text',
        selectedHtml: '<p>Quoted text</p>',
        fragmentUrl: 'https://video.example/watch#:~:text=Quoted%20text',
        createdAt: 2,
        wrapperId: 'frag-1-wrapper'
      },
      {
        kind: 'timestamp',
        id: 'ts-2',
        timeSec: 20,
        comment: '',
        url: 'https://video.example/watch?t=20',
        createdAt: 3
      }
    ];
    sessionApi.state.commentDrafts = {
      'frag-1': 'draft note'
    };
    const fragmentWrapper = document.createElement('mark');
    fragmentWrapper.id = 'frag-1-wrapper';
    fragmentWrapper.textContent = 'Quoted text';
    document.body.append(fragmentWrapper);

    const platformAdapter = createVideoPlatformAdapterMock.mock.results.at(-1)?.value as
      | {
          restoreHighlight: Mock<(capture: { id: string; selectedText: string }) => string>;
        }
      | undefined;
    if (!platformAdapter) {
      throw new Error('expected platform adapter to be created');
    }
    platformAdapter.restoreHighlight.mockImplementation((capture) => {
      const wrapper = document.createElement('mark');
      wrapper.id = `${capture.id}-wrapper`;
      wrapper.textContent = capture.selectedText;
      document.body.append(wrapper);
      return wrapper.id;
    });

    requireMountedPanelCallbacks(mountedCallbacks).onDeleteCapture('frag-1');
    await Promise.resolve();

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual(['ts-1', 'ts-2']);
    expect(sessionApi.state.commentDrafts).toEqual({});
    expect(document.getElementById('frag-1-wrapper')).toBeNull();
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toHaveLength(2);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    deferredSave.resolve();
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual([
      'ts-1',
      'frag-1',
      'ts-2'
    ]);
    expect(sessionApi.state.commentDrafts).toEqual({
      'frag-1': 'draft note'
    });
    expect(platformAdapter.restoreHighlight).toHaveBeenCalled();
    expect(document.getElementById('frag-1-wrapper')).not.toBeNull();
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toHaveLength(3);
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('updates the panel immediately for removals but emits removal analytics only after save succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deferredSave = createDeferred<void>();
    const deps = createDependencies();
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() => deferredSave.promise);
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    trackUsageEvent.mockClear();

    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 10,
        comment: '',
        url: 'https://video.example/watch?t=10',
        createdAt: 1
      },
      {
        kind: 'timestamp',
        id: 'ts-2',
        timeSec: 20,
        comment: '',
        url: 'https://video.example/watch?t=20',
        createdAt: 2
      }
    ];

    requireMountedPanelCallbacks(mountedCallbacks).onDeleteCapture('ts-1');
    await Promise.resolve();

    expect(sessionApi.state.captures.map((capture) => capture.id)).toEqual(['ts-2']);
    expect(view.setCaptures.mock.calls.at(-1)?.[0]).toHaveLength(1);
    expect(trackUsageEvent).not.toHaveBeenCalled();

    deferredSave.resolve();
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(trackUsageEvent).toHaveBeenCalledWith('video_capture_removed', {
      capture_count_bucket: 'one'
    });

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('stops fragment restore observation when the last fragment capture is deleted', async () => {
    vi.useFakeTimers();
    const deps = createDependencies();
    const view = createView();
    let mountedCallbacks: VideoPanelCallbacks | null = null;
    RecordingMutationObserver.reset();
    const restoreMutationObserver = setGlobal('MutationObserver', RecordingMutationObserver);
    deps.viewFactory.createView = vi.fn((callbacks: VideoPanelCallbacks) => {
      mountedCallbacks = callbacks;
      return view;
    });
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const fragmentHost = document.createElement('p');
    fragmentHost.textContent = 'Selected text for observer stop';
    document.body.append(fragmentHost);
    const textNode = fragmentHost.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('expected fragment fixture text node');
    }
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'Selected text'.length);

    session.ingestTextCapture('<p>Selected text</p>', 'Selected text', 'fragment note', range);
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    const fragmentId = sessionApi.state.captures.find((capture) => capture.kind === 'fragment')?.id;
    if (!fragmentId) {
      throw new Error('expected fragment capture to be created');
    }
    expect(RecordingMutationObserver.instances).toHaveLength(1);

    requireMountedPanelCallbacks(mountedCallbacks).onDeleteCapture(fragmentId);
    await flushMutationWork();
    await vi.advanceTimersByTimeAsync(200);
    await flushMutationWork();

    expect(sessionApi.state.captures).toEqual([]);
    expect(RecordingMutationObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);

    sessionApi.cleanup();
    restoreMutationObserver();
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
      label: '正在准备视频导出'
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 34,
      label: '正在生成视频笔记'
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 70,
      label: '正在写入 Obsidian'
    });
    expect(dependencies.showSupportProgress).toHaveBeenCalledWith({
      value: 100,
      label: '成功发送到 Obsidian',
      variant: 'success'
    });
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('exports only already-live screenshots and does not seek or recapture missing requested screenshots', async () => {
    const dependencies = createDependencies();
    const session = new VideoSession(document, dependencies);
    const sessionApi = toSessionTestApi(session);

    await session.start();

    const video = requireVideoElement();
    let currentTime = 8;
    const currentTimeSetSpy = vi.fn((value: number) => {
      currentTime = value;
    });
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 42,
        comment: '',
        url: 'https://video.example/watch?t=42',
        createdAt: 1,
        screenshotRequested: true
      }
    ];

    await sessionApi.finish();

    const lastExportCall = exportMock.mock.calls.at(-1);
    expect(lastExportCall).toBeDefined();
    if (!lastExportCall) {
      throw new Error('expected exporter to be called');
    }
    const exportArgs = (lastExportCall as unknown[])[0];
    expect(exportArgs).toEqual(
      expect.objectContaining({
        captures: [expect.objectContaining({ id: 'timestamp-1', screenshotRequested: true })]
      })
    );
    expect(
      (
        exportArgs as unknown as {
          captures?: Array<{ screenshot?: unknown }>;
        }
      )?.captures?.[0]?.screenshot
    ).toBeUndefined();
    expect(currentTimeSetSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('writes exported terminal envelopes to the current and restored exact draft keys before cleanup', async () => {
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
    expect(beforeFinish).toHaveLength(2);
    const currentDraft = beforeFinish.find((candidate) => candidate.draftId !== 'restored-draft');
    if (!currentDraft) {
      throw new Error('expected a current replacement draft');
    }
    const currentDraftKey = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: currentDraft.pageKey,
      draftId: currentDraft.draftId
    });

    vi.mocked(deps.storage.local.remove).mockClear();
    vi.mocked(deps.storage.local.remove).mockImplementation(async (...args) => {
      const [value] = args;
      if (
        removalCallIncludesKey(value, currentDraftKey) ||
        removalCallIncludesKey(value, restoredDraftKey)
      ) {
        throw new Error('terminal cleanup should be best-effort');
      }
      return await passthroughRemove(...args);
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
    expect(draftIndex.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ draftId: currentDraft.draftId, status: 'exported' }),
        expect.objectContaining({ draftId: restoredDraft.draftId, status: 'exported' })
      ])
    );
    await expect(readStoredVideoDraft(deps, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraft.draftId,
      status: 'exported'
    });
    await expect(readStoredVideoDraft(deps, restoredDraftKey)).resolves.toMatchObject({
      draftId: restoredDraft.draftId,
      status: 'exported'
    });
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, currentDraftKey))
    ).toHaveLength(1);
    expect(
      vi
        .mocked(deps.storage.local.remove)
        .mock.calls.filter(([value]) => removalCallIncludesKey(value, restoredDraftKey))
    ).toHaveLength(1);

    vi.useRealTimers();
  });

  it('emits canonical export success analytics without leaking private fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: 'private export note',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      }
    ];
    vi.setSystemTime(new Date('2026-03-14T10:00:06Z'));

    await sessionApi.finish();

    expect(trackUsageEvent).toHaveBeenLastCalledWith('video_exported', {
      platform: 'bilibili',
      destination: 'downloads',
      duration_bucket: '3s_to_9s'
    });
    expect(JSON.stringify(trackUsageEvent.mock.calls.at(-1)?.[1] ?? {})).not.toContain(
      'private export note'
    );
    expectNoForbiddenAnalyticsKeys(
      trackUsageEvent.mock.calls.at(-1)?.[1] as Record<string, unknown>
    );

    vi.useRealTimers();
  });

  it('keeps the session active and suppresses export success analytics when terminal draft persistence fails', async () => {
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
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    Object.defineProperty(requireVideoElement(), 'currentTime', {
      value: 42,
      configurable: true
    });
    await sessionApi.handleAddCapture();
    trackUsageEvent.mockClear();
    view.updateHint.mockClear();
    vi.mocked(deps.storage.local.setMany).mockImplementationOnce(() =>
      Promise.reject(new Error('export terminal save failed'))
    );

    await requirePromise(requireMountedPanelCallbacks(mountedCallbacks).onFinish());

    expect(exportMock).toHaveBeenCalledTimes(1);
    expect(view.destroy).not.toHaveBeenCalled();
    expect(isVideoSessionActive(document)).toBe(true);
    expect(view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(trackUsageEvent).not.toHaveBeenCalled();
    await expect(loadLatestVideoDraft(deps)).resolves.toMatchObject({ status: 'active' });

    sessionApi.cleanup();
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
      label: '发送失败',
      variant: 'failure'
    });
    expect(isVideoSessionActive(document)).toBe(true);

    sessionApi.cleanup();
  });

  it('emits canonical export failure analytics with an unknown failure bucket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as {
      success: boolean;
      error: string;
    });
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);
    const trackUsageEvent = getTrackUsageEventMock(deps);

    await session.start();
    sessionApi.state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: 'private export note',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      }
    ];
    vi.setSystemTime(new Date('2026-03-14T10:00:06Z'));

    await sessionApi.finish();

    expect(trackUsageEvent).toHaveBeenLastCalledWith('video_export_failed', {
      platform: 'bilibili',
      destination: 'downloads',
      failure_category: 'unknown'
    });
    expect(JSON.stringify(trackUsageEvent.mock.calls.at(-1)?.[1] ?? {})).not.toContain(
      'private export note'
    );
    expectNoForbiddenAnalyticsKeys(
      trackUsageEvent.mock.calls.at(-1)?.[1] as Record<string, unknown>
    );

    sessionApi.cleanup();
    vi.useRealTimers();
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
      label: '发送失败',
      variant: 'failure'
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[VideoSession] Export failed:',
      expect.objectContaining({ message: 'Invalid video export response' })
    );
    expect(isVideoSessionActive(document)).toBe(true);

    consoleErrorSpy.mockRestore();
    sessionApi.cleanup();
  });

  it('stops watchers and tears down the active session on cleanup', async () => {
    const stopOptionsWatcher = vi.fn();
    const stopLanguageWatcher = vi.fn();
    const deps = createDependencies();
    deps.optionsRepository.onChange = vi.fn(() => stopOptionsWatcher) as never;
    deps.storage.sync.watchKey = vi.fn(() => stopLanguageWatcher) as never;
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start();
    sessionApi.cleanup();

    expect(stopOptionsWatcher).toHaveBeenCalledTimes(1);
    expect(stopLanguageWatcher).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
  });
});
