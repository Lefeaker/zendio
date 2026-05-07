/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSession } from '@content/video/session';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import type { VideoSessionDependencies } from '@content/video/sessionTypes';
import type { VideoSessionView } from '@content/video/application/videoSessionView';
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
    VideoSessionExporter: vi.fn().mockImplementation(() => ({
      export: exportMock
    }))
  };
});

type TestView = VideoSessionView & {
  updateCount: ReturnType<typeof vi.fn>;
  setCaptures: ReturnType<typeof vi.fn>;
  updateHint: ReturnType<typeof vi.fn>;
  updateTexts: ReturnType<typeof vi.fn>;
  beginEditingCapture: ReturnType<typeof vi.fn>;
  stopEditing: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

type SessionTestApi = {
  applyHint: (state: string) => void;
  cleanup: () => void;
  handleAddCapture: () => Promise<void>;
  finish: () => Promise<void>;
  state: {
    captures: Array<{
      kind: 'timestamp';
      id: string;
      timeSec: number;
      comment: string;
      url: string;
      createdAt: number;
    }>;
  };
};

function createView(): TestView {
  return {
    updateCount: vi.fn(),
    setCaptures: vi.fn(),
    updateHint: vi.fn(),
    updateTexts: vi.fn(),
    beginEditingCapture: vi.fn(),
    stopEditing: vi.fn(),
    destroy: vi.fn()
  };
}

function createDependencies(): VideoSessionDependencies {
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
      getVideoConfig: vi.fn(() => Promise.resolve(null)),
      savePromptPosition: vi.fn(() => Promise.resolve(undefined)),
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
    }
  } as unknown as VideoSessionDependencies;
}

describe('VideoSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '<h1>Video Title</h1><video></video>';
    document.title = 'Video Title___哔哩哔哩_bilibili';
    __resetContentSessionRegistryForTests(document);
    vi.clearAllMocks();
  });

  it('requires explicit dependencies', () => {
    const deps = createDependencies();
    expect(() => new VideoSession(document, deps)).not.toThrow();
  });

  it('returns early when a session is already active', async () => {
    const session = new VideoSession(document, createDependencies());
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

  it('does not start interval polling when the session starts', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const session = new VideoSession(document, createDependencies());
    const sessionApi = session as unknown as SessionTestApi;

    await session.start();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    sessionApi.cleanup();
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

    await sessionApi.handleAddCapture();

    const view = (deps.viewFactory.createView as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as TestView | undefined;
    expect(saveCaptureDataMock).toHaveBeenCalledTimes(1);
    expect(view?.beginEditingCapture).toHaveBeenCalledWith(
      expect.stringContaining('aiob-video-'),
      ''
    );

    sessionApi.cleanup();
    vi.useRealTimers();
  });

  it('exports through the exporter and cleans up on success', async () => {
    const session = new VideoSession(document, createDependencies());
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
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('keeps the session alive when export fails', async () => {
    exportMock.mockResolvedValueOnce({ success: false, error: 'boom' } as {
      success: boolean;
      error: string;
    });
    const session = new VideoSession(document, createDependencies());
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
    expect(isVideoSessionActive(document)).toBe(true);

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
