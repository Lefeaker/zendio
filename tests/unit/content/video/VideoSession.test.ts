/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { VideoSession } from '@content/video/session';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import type { VideoPanelCallbacks } from '@content/video/application/videoPanelModel';
import type { VideoSessionDependencies } from '@content/video/sessionTypes';
import type { VideoSessionView } from '@content/video/application/videoSessionView';
import type { UsageEventName, UsageEventParamMap } from '@shared/types/analytics';
import {
  __resetContentSessionRegistryForTests,
  isVideoSessionActive,
  registerVideoSession
} from '@content/runtime/contentSessionRegistry';

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
  state: {
    captures: Array<{
      kind: 'timestamp';
      id: string;
      timeSec: number;
      comment: string;
      url: string;
      createdAt: number;
      screenshot?: {
        fileName: string;
        mimeType: 'image/jpeg';
        dataUrl: string;
      };
    }>;
  };
};

function createView(): TestView {
  return {
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
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve(undefined)),
        remove: vi.fn(() => Promise.resolve(undefined)),
        clear: vi.fn(() => Promise.resolve(undefined)),
        getBytesInUse: vi.fn(() => Promise.resolve(0)),
        watch: vi.fn(() => () => {}),
        watchKey: vi.fn(() => () => {})
      },
      sync: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve(undefined)),
        remove: vi.fn(() => Promise.resolve(undefined)),
        clear: vi.fn(() => Promise.resolve(undefined)),
        getBytesInUse: vi.fn(() => Promise.resolve(0)),
        watch: vi.fn(() => () => {}),
        watchKey: vi.fn(() => () => {})
      }
    },
    showSupportProgress,
    trackUsageEvent
  } as unknown as VideoSessionDependencies;
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
    __resetContentSessionRegistryForTests(document);
    vi.clearAllMocks();
    saveCaptureDataMock.mockResolvedValue(undefined);
  });

  it('requires explicit dependencies', () => {
    const deps = createDependencies();
    expect(() => new VideoSession(document, deps)).not.toThrow();
  });

  it('returns early when a session is already active', async () => {
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
    const applyHintSpy = vi.spyOn(sessionApi, 'applyHint');
    registerVideoSession({ id: 'active' }, document);

    await session.start();

    expect(applyHintSpy).toHaveBeenCalledWith('ready');
    expect(ensureContentI18nMock).not.toHaveBeenCalled();
  });

  it('starts, mounts the panel, and registers the session', async () => {
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;

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
    expect(
      JSON.stringify(trackUsageEvent.mock.calls.at(0)?.[1] ?? {})
    ).not.toContain('Video Title');

    vi.setSystemTime(new Date('2026-03-14T10:00:05Z'));
    requireMountedPanelCallbacks(mountedCallbacks).onCancel();

    expect(trackUsageEvent).toHaveBeenNthCalledWith(2, 'video_session_cancelled', {
      platform: 'bilibili',
      duration_bucket: '3s_to_9s'
    });
    expectNoForbiddenAnalyticsKeys(trackUsageEvent.mock.calls.at(0)?.[1] as Record<string, unknown>);
    expectNoForbiddenAnalyticsKeys(trackUsageEvent.mock.calls.at(1)?.[1] as Record<string, unknown>);
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
    const sessionApi = session as unknown as SessionTestApi;

    await session.start();

    const video = document.querySelector('video');
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    const pauseSpy = vi
      .spyOn(video as HTMLVideoElement, 'pause')
      .mockImplementation(() => undefined);

    await sessionApi.handleAddCapture();

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(saveCaptureDataMock).toHaveBeenCalledTimes(1);
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
    const sessionApi = session as unknown as SessionTestApi;

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
    saveCaptureDataMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          saveGate.resolve = () => resolve(undefined);
        })
    );
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;

    await session.start();

    const video = requireVideoElement();
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const addPromise = sessionApi.handleAddCapture('note-input');

    await Promise.resolve();
    await Promise.resolve();

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(saveCaptureDataMock).toHaveBeenCalledTimes(1);
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
    saveCaptureDataMock.mockRejectedValueOnce(new Error('save failed'));
    const deps = createDependencies();
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

    expect(saveCaptureDataMock).toHaveBeenCalledTimes(1);
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

  it('keeps playback paused while a note editor remains active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;

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
    saveCaptureDataMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          submitGate.resolve = () => resolve(undefined);
        })
    );
    const callbacks = requireMountedPanelCallbacks(mountedCallbacks);
    const submitPromise = requirePromise(callbacks.onSubmitCaptureEdit(captureId, 'panel note'));

    paused = false;
    video.dispatchEvent(new Event('play'));
    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).not.toHaveBeenCalled();

    expect(submitGate.resolve).toBeTruthy();
    submitGate.resolve?.();
    await submitPromise;

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(view.stopEditing).toHaveBeenCalled();

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

  it('captures a current-frame screenshot for control bar note captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          Object.defineProperty(canvas, 'getContext', {
            value: vi.fn(() => ({ drawImage })),
            configurable: true
          });
          Object.defineProperty(canvas, 'toDataURL', {
            value: vi.fn(() => 'data:image/jpeg;base64,frame'),
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
    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
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

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(sessionApi.state.captures[0]?.screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/);
    expect(sessionApi.state.captures[0]).toMatchObject({
      comment: 'captured frame',
      screenshot: {
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,frame'
      }
    });
    expect(view?.stopEditing).toHaveBeenCalled();
    expect(view?.collapse).toHaveBeenCalledTimes(1);
    expect(view?.collapse.mock.invocationCallOrder[0]).toBeLessThan(
      view?.setCaptures.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );

    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('toggles timestamp screenshots without exposing screenshot content in the panel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
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
    const currentTimeSetSpy = vi.fn();
    Object.defineProperty(video, 'currentTime', {
      get: () => 8,
      set: currentTimeSetSpy,
      configurable: true
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
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
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(sessionApi.state.captures[0]?.screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/);
    expect(sessionApi.state.captures[0]).toMatchObject({
      screenshot: {
        dataUrl: 'data:image/jpeg;base64,toggled-frame'
      }
    });
    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    const panelCaptures = view?.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean; screenshot?: unknown }>
      | undefined;
    expect(panelCaptures?.[0]).toMatchObject({ hasScreenshot: true });
    expect(panelCaptures?.[0]?.screenshot).toBeUndefined();

    await sessionApi.toggleCaptureScreenshot('timestamp-1');

    expect(sessionApi.state.captures[0]?.screenshot).toBeUndefined();
    const toggledOffCaptures = view?.setCaptures.mock.calls.at(-1)?.[0] as
      | Array<{ hasScreenshot?: boolean }>
      | undefined;
    expect(toggledOffCaptures?.[0]).toMatchObject({ hasScreenshot: false });

    createElementSpy.mockRestore();
    sessionApi.cleanup();
    vi.useRealTimers();
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
    const sessionApi = session as unknown as SessionTestApi;
    const trackUsageEvent = getTrackUsageEventMock(deps);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: vi.fn(() => 'data:image/jpeg;base64,private-frame'),
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

    await session.addCurrentTimestamp('button');
    session.ingestTextCapture('<p>Private fragment</p>', 'Private fragment', 'Private comment');
    const timestampId = sessionApi.state.captures.find((capture) => capture.kind === 'timestamp')?.id;
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
    await sessionApi.toggleCaptureScreenshot(timestampId);
    requireMountedPanelCallbacks(mountedCallbacks).onDeleteCapture(fragmentId);

    expect(trackUsageEvent.mock.calls.map(([eventName]) => eventName)).toEqual([
      'video_session_started',
      'video_timestamp_added',
      'video_fragment_added',
      'video_screenshot_captured',
      'video_capture_removed'
    ]);
    expect(trackUsageEvent).toHaveBeenNthCalledWith(2, 'video_timestamp_added', {
      capture_count_bucket: 'one'
    });
    expect(trackUsageEvent).toHaveBeenNthCalledWith(3, 'video_fragment_added', {
      capture_count_bucket: 'two_to_five'
    });
    expect(trackUsageEvent).toHaveBeenNthCalledWith(4, 'video_screenshot_captured', {
      screenshot_count_bucket: 'one'
    });
    expect(trackUsageEvent).toHaveBeenNthCalledWith(5, 'video_capture_removed', {
      capture_count_bucket: 'one'
    });

    const analyticsPayload = trackUsageEvent.mock.calls
      .map(([, params]) => JSON.stringify(params ?? {}))
      .join('\n');
    expect(analyticsPayload).not.toContain('Private fragment');
    expect(analyticsPayload).not.toContain('Private comment');
    expect(analyticsPayload).not.toContain('data:image/jpeg;base64,private-frame');
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

  it('exports through the exporter and cleans up on success', async () => {
    const dependencies = createDependencies();
    const session = new VideoSession(document, dependencies);
    const sessionApi = session as unknown as SessionTestApi;
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

  it('emits canonical export success analytics without leaking private fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
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
    expectNoForbiddenAnalyticsKeys(trackUsageEvent.mock.calls.at(-1)?.[1] as Record<string, unknown>);

    vi.useRealTimers();
  });

  it('keeps the session alive when export fails', async () => {
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as {
      success: boolean;
      error: string;
    });
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
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
    const sessionApi = session as unknown as SessionTestApi;
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
    expectNoForbiddenAnalyticsKeys(trackUsageEvent.mock.calls.at(-1)?.[1] as Record<string, unknown>);

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('keeps the session alive when the exporter returns an invalid empty response', async () => {
    exportMock.mockResolvedValueOnce(null as never);
    const deps = createDependencies();
    const session = new VideoSession(document, deps);
    const sessionApi = session as unknown as SessionTestApi;
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
    const sessionApi = session as unknown as SessionTestApi;

    await session.start();
    sessionApi.cleanup();

    expect(stopOptionsWatcher).toHaveBeenCalledTimes(1);
    expect(stopLanguageWatcher).toHaveBeenCalledTimes(1);
    expect(isVideoSessionActive(document)).toBe(false);
  });
});
