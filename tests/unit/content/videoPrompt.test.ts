/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VideoPromptDependencies } from '@content/video/videoPromptDependencies';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type TestPromptElementOptions = {
  id: string;
  label: string;
  shortcut: string;
  onPrimaryAction: () => void;
};

type TestPromptElementResult = {
  container: HTMLDivElement;
  bubble: HTMLButtonElement;
};

type TestDragHandlers = {
  onPositionCommitted: (placement: { side: string; left: number; top: number }) => void;
  savePromptPosition: () => void;
};

type PromptPosition = {
  x: number;
  y: number;
};

type VideoOptionsStub = {
  floatingPromptEnabled: boolean;
  promptButtonLabel: string;
  promptShortcut: string;
  promptPosition: PromptPosition;
  controlBarAutoPause: boolean;
  controlBarScreenshot: boolean;
};

type StorageChangeSnapshot = {
  oldValue?: unknown;
  newValue?: unknown;
};

type StorageAreaStub = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  getMany: (keys: string[]) => Promise<Record<string, unknown>>;
  setMany: (entries: Record<string, unknown>) => Promise<void>;
  remove: (key: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
  watchKey: (
    key: string,
    callback: (value: unknown, change: StorageChangeSnapshot) => void
  ) => () => void;
  watchAll: (callback: (changes: Record<string, StorageChangeSnapshot>) => void) => () => void;
};

type StorageServiceStub = {
  sync: StorageAreaStub;
  local: StorageAreaStub;
  session: StorageAreaStub;
};

type RuntimeStub = {
  getURL: (path: string) => string;
  openOptionsPage: () => Promise<void>;
  onInstalled: () => () => void;
  onStartup: () => () => void;
  getManifest: () => { version: string };
};

type VideoRepositoryStub = {
  getVideoConfig: () => Promise<VideoOptionsStub>;
  savePromptPosition: (position: PromptPosition) => Promise<void>;
  saveControlBarPreferences: (preferences: {
    autoPauseEnabled: boolean;
    captureScreenshotEnabled: boolean;
  }) => Promise<void>;
  getPromptPosition: () => Promise<PromptPosition | null>;
  sendVideoClip: ReturnType<typeof vi.fn>;
  onConfigChange: (callback: (config: VideoOptionsStub) => void) => () => void;
};

const loadExtensionStyleMock = vi.hoisted(() =>
  vi.fn((path: string) => Promise.resolve(`/* ${path} */ .stitch-runtime{display:block;}`))
);
vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

const ensureContentI18nMock = vi.hoisted(() => vi.fn<[], Promise<void>>(() => Promise.resolve()));
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => ({ messages: null })));
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn<[], Promise<{ videoPromptTitle: string }>>(() =>
    Promise.resolve({
      videoPromptTitle: 'Clip video'
    })
  )
);
vi.mock('../../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const detectVideoIdentityMock = vi.hoisted(() =>
  vi.fn(() => ({
    platform: 'youtube',
    id: 'abc123'
  }))
);
vi.mock('../../../src/content/video/utils', () => ({
  detectVideoIdentity: detectVideoIdentityMock
}));

const observerCallbacks = vi.hoisted(() => [] as Array<() => void>);
const controlTargetState = vi.hoisted(() => ({ current: null as Element | null }));
const controlObserverRootState = vi.hoisted(() => ({ current: null as Element | null }));
const controlTargetObservers = vi.hoisted(
  () => [] as Array<{ onTarget(target: Element): void; stop: ReturnType<typeof vi.fn> }>
);
const matchesSupportedVideoHostMock = vi.hoisted(() => vi.fn(() => true));
const hasPlayableVideoMock = vi.hoisted(() => vi.fn(() => true));
const isValidVideoPlayPageMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../../src/content/video/videoPromptObserver', () => ({
  findVideoControlTarget: vi.fn(() => controlTargetState.current),
  findVideoControlObserverRoot: vi.fn(() => controlObserverRootState.current),
  isIgnoredVideoMutationNode: vi.fn(() => false),
  observeVideoControlTarget: vi.fn((options: { onTarget(target: Element): void }) => {
    const stop = vi.fn();
    controlTargetObservers.push({ onTarget: options.onTarget, stop });
    return stop;
  }),
  matchesSupportedVideoHost: matchesSupportedVideoHostMock,
  hasPlayableVideo: hasPlayableVideoMock,
  isValidVideoPlayPage: isValidVideoPlayPageMock
}));

const ensureVideoControlBarButtonMock = vi.hoisted(() =>
  vi.fn(
    (options: {
      doc: Document;
      preferences: { autoPauseEnabled: boolean; captureScreenshotEnabled: boolean };
      onPreferencesChange(preferences: {
        autoPauseEnabled: boolean;
        captureScreenshotEnabled: boolean;
      }): void;
      onPopoverOpen?(preferences: {
        autoPauseEnabled: boolean;
        captureScreenshotEnabled: boolean;
      }): void;
      onPopoverDismiss?(preferences: {
        autoPauseEnabled: boolean;
        captureScreenshotEnabled: boolean;
      }): void;
      onPrimaryAction(
        preferences: {
          autoPauseEnabled: boolean;
          captureScreenshotEnabled: boolean;
        },
        payload?: { comment?: string; source?: string }
      ): void;
    }) => {
      const button = options.doc.createElement('button');
      button.className = 'aiob-video-control-bar-button';
      button.dataset.aiobVideoControlBarButton = 'true';
      button.addEventListener('click', () => options.onPrimaryAction(options.preferences));
      options.doc.body.appendChild(button);
      return true;
    }
  )
);
const removeVideoControlBarButtonMock = vi.hoisted(() =>
  vi.fn((doc: Document) => {
    doc.querySelectorAll('.aiob-video-control-bar-button').forEach((button) => button.remove());
  })
);
vi.mock('../../../src/content/video/videoControlBarButton', () => ({
  ensureVideoControlBarButton: ensureVideoControlBarButtonMock,
  removeVideoControlBarButton: removeVideoControlBarButtonMock
}));

const dragHandlersRef = vi.hoisted(() => ({ current: null as TestDragHandlers | null }));
const updatePromptLabelsMock = vi.hoisted(() =>
  vi.fn<[HTMLDivElement, string, string], void>((element, label, shortcut) => {
    element.dataset.label = label;
    element.dataset.shortcut = shortcut;
  })
);
const lastRendererConfig = vi.hoisted(() => ({ current: null as TestPromptElementOptions | null }));
const createPromptElementMock = vi.hoisted(() =>
  vi.fn<[config: TestPromptElementOptions], TestPromptElementResult>((config) => {
    lastRendererConfig.current = config;
    const container = document.createElement('div');
    container.id = config.id;
    container.dataset.stitchSurface = 'video-floating-prompt';
    const bubble = document.createElement('button');
    bubble.className = 'video-floating-prompt__bubble';
    container.appendChild(bubble);
    return { container, bubble };
  })
);
const attachDragHandlersMock = vi.hoisted(() =>
  vi.fn<[handlers: TestDragHandlers], void>((handlers) => {
    dragHandlersRef.current = handlers;
  })
);
vi.mock('../../../src/content/video/videoPromptRenderer', () => ({
  createPromptElement: createPromptElementMock,
  attachDragHandlers: attachDragHandlersMock,
  updatePromptLabels: updatePromptLabelsMock
}));

const startVideoSessionMock = vi.hoisted(() =>
  vi.fn<[{ initialCollapsed?: boolean }?], Promise<void>>(() => Promise.resolve())
);
const addCurrentTimestampMock = vi.hoisted(() =>
  vi.fn<
    [
      'button' | 'note-input' | undefined,
      {
        captureScreenshot?: boolean;
        pauseVideo?: boolean;
        beginEditing?: boolean;
        collapseAfterCapture?: boolean;
      }
    ],
    Promise<void>
  >(() => Promise.resolve())
);
const videoSessionFactoryMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: startVideoSessionMock,
    addCurrentTimestamp: addCurrentTimestampMock
  }))
);
vi.mock('../../../src/content/video/session', () => ({
  VideoSession: videoSessionFactoryMock
}));

const setIntervalSpy = vi.hoisted(() => vi.fn());

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

function getPromptFromShadowDom(): HTMLElement | null {
  return (
    Array.from(document.body.children)
      .map(
        (element) =>
          element.shadowRoot?.querySelector<HTMLElement>('#aiob-video-floating-prompt') ?? null
      )
      .find((element): element is HTMLElement => element !== null) ?? null
  );
}

type PromptStateSnapshot = {
  hasCustomPosition: boolean;
  left: number | null;
  top: number | null;
};

type VideoPromptDebugCounters = {
  evaluateCount: number;
  controlButtonSyncCount: number;
  floatingPromptMountCount: number;
};

type VideoPromptTestUtils = {
  setDependenciesForTests(deps: VideoPromptDependencies): void;
  resetDependenciesForTests(): void;
  getPromptStateForTests(): PromptStateSnapshot;
  getDebugCountersForTests(): VideoPromptDebugCounters;
  resetDebugCountersForTests(): void;
  cleanupPromptForTests(): void;
};

type VideoPromptTestModule = {
  initVideoPrompt(dependencies?: VideoPromptDependencies): Promise<void>;
};

type LoadedVideoPromptTestModule = VideoPromptTestModule & {
  __videoPromptTestUtils: VideoPromptTestUtils;
};

async function loadPromptModule(): Promise<LoadedVideoPromptTestModule> {
  const [module, harness] = await Promise.all([
    vi.importActual<VideoPromptTestModule>('../../../src/content/video/prompt'),
    vi.importActual<{ __videoPromptTestUtils: VideoPromptTestUtils }>(
      '../../../src/content/video/videoPromptTestHarness'
    )
  ]);
  return { ...module, __videoPromptTestUtils: harness.__videoPromptTestUtils };
}

type TestDeps = {
  storage: StorageServiceStub;
  runtime: RuntimeStub;
  videoRepo: VideoRepositoryStub;
  createVideoSession: typeof videoSessionFactoryMock;
  getRuntimeTheme: ReturnType<typeof vi.fn<[], Promise<null>>>;
  emitConfigChange: (config: VideoOptionsStub) => void;
  triggerLanguageChange: () => void;
};

const createStorageAreaStub = (): StorageAreaStub => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
  getMany: vi.fn(() => Promise.resolve({})),
  setMany: vi.fn(() => Promise.resolve(undefined)),
  remove: vi.fn(() => Promise.resolve(undefined)),
  clear: vi.fn(() => Promise.resolve(undefined)),
  watchKey: vi.fn(
    (key: string, callback: (value: unknown, change: StorageChangeSnapshot) => void) => {
      return vi.fn(() => callback(undefined, {}));
    }
  ),
  watchAll: vi.fn(() => vi.fn())
});

function createTestDependencies(): TestDeps {
  let configListener: ((config: VideoOptionsStub) => void) | null = null;
  let languageWatcher: (() => void) | null = null;

  const storage: StorageServiceStub = {
    sync: createStorageAreaStub(),
    local: createStorageAreaStub(),
    session: createStorageAreaStub()
  };
  storage.sync.watchKey = vi.fn(
    (key: string, callback: (value: unknown, change: StorageChangeSnapshot) => void) => {
      if (key === 'language') {
        languageWatcher = () => callback(undefined, { oldValue: undefined, newValue: undefined });
      }
      return vi.fn();
    }
  );

  const runtime: RuntimeStub = {
    getURL: vi.fn<[string], string>((path) => `chrome-extension://mock/${path}`),
    openOptionsPage: vi.fn<[], Promise<void>>(() => Promise.resolve()),
    onInstalled: vi.fn<[], () => void>(() => vi.fn()),
    onStartup: vi.fn<[], () => void>(() => vi.fn()),
    getManifest: vi.fn<[], { version: string }>(() => ({ version: 'test' }))
  };

  const videoRepo: VideoRepositoryStub = {
    getVideoConfig: vi.fn<[], Promise<VideoOptionsStub>>().mockResolvedValue({
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip video',
      promptShortcut: 'Ctrl+Shift+V',
      promptPosition: { x: 90, y: 150 },
      controlBarAutoPause: true,
      controlBarScreenshot: false
    }),
    savePromptPosition: vi.fn<[PromptPosition], Promise<void>>(() => Promise.resolve()),
    saveControlBarPreferences: vi.fn<
      [
        {
          autoPauseEnabled: boolean;
          captureScreenshotEnabled: boolean;
        }
      ],
      Promise<void>
    >(() => Promise.resolve()),
    getPromptPosition: vi
      .fn<[], Promise<PromptPosition | null>>()
      .mockResolvedValue({ x: 120, y: 200 }),
    sendVideoClip: vi.fn(),
    onConfigChange: vi.fn<[(config: VideoOptionsStub) => void], () => void>((callback) => {
      configListener = callback;
      return vi.fn();
    })
  };

  return {
    storage,
    runtime,
    videoRepo,
    createVideoSession: videoSessionFactoryMock,
    getRuntimeTheme: vi.fn<[], Promise<null>>(() => Promise.resolve(null)),
    emitConfigChange: (config) => configListener?.(config),
    triggerLanguageChange: () => languageWatcher?.()
  } as TestDeps & { createVideoSession: typeof videoSessionFactoryMock };
}

describe('video prompt', () => {
  let currentTestUtils: VideoPromptTestUtils | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.resetModules();
    observerCallbacks.length = 0;
    controlTargetState.current = null;
    controlObserverRootState.current = document.createElement('div');
    controlTargetObservers.length = 0;
    dragHandlersRef.current = null;
    lastRendererConfig.current = null;
    ensureVideoControlBarButtonMock.mockClear();
    removeVideoControlBarButtonMock.mockClear();
    matchesSupportedVideoHostMock.mockClear();
    hasPlayableVideoMock.mockClear();
    isValidVideoPlayPageMock.mockClear();
    updatePromptLabelsMock.mockClear();
    loadExtensionStyleMock.mockClear();
    loadExtensionStyleMock.mockImplementation((path: string) =>
      Promise.resolve(`/* ${path} */ .stitch-runtime{display:block;}`)
    );
    ensureContentI18nMock.mockClear();
    getContentI18nResourceMock.mockClear();
    getContentMessagesMock.mockClear();
    detectVideoIdentityMock.mockClear();
    startVideoSessionMock.mockClear();
    addCurrentTimestampMock.mockClear();
    videoSessionFactoryMock.mockClear();
    setIntervalSpy.mockImplementation((callback: () => void) => {
      callback();
      return 0 as unknown as number;
    });
    vi.spyOn(window, 'setInterval').mockImplementation(setIntervalSpy);
  });

  afterEach(async () => {
    await flushMicrotasks();
    currentTestUtils?.cleanupPromptForTests();
    await flushMicrotasks();
    vi.restoreAllMocks();
    currentTestUtils?.resetDependenciesForTests();
    currentTestUtils = null;
    dragHandlersRef.current = null;
    lastRendererConfig.current = null;
  });

  it('mounts prompt when evaluation passes and persists drag position', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    expect(deps.videoRepo.getVideoConfig).toHaveBeenCalled();
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();

    const prompt = getPromptFromShadowDom();
    expect(prompt).not.toBeNull();
    expect(lastRendererConfig.current?.label).toBe('Clip video');
    expect(lastRendererConfig.current?.shortcut).toBe('CTRL+SHIFT+V');

    const state = currentTestUtils.getPromptStateForTests();
    expect(state.hasCustomPosition).toBe(true);
    expect(typeof state.left).toBe('number');
    expect(typeof state.top).toBe('number');

    dragHandlersRef.current?.onPositionCommitted({ side: 'right', left: 360, top: 210 });
    dragHandlersRef.current?.savePromptPosition();
    await flushMicrotasks();
    expect(deps.videoRepo.savePromptPosition).toHaveBeenCalledWith({ x: 360, y: 210 });

    expect(videoSessionFactoryMock).not.toHaveBeenCalled();
    lastRendererConfig.current?.onPrimaryAction();
    await flushMicrotasks();
    expect(videoSessionFactoryMock).toHaveBeenCalledTimes(1);
    expect(startVideoSessionMock).toHaveBeenCalledTimes(1);
  });

  it('does not start interval polling during prompt initialization', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('injects the control-bar button without mounting the floating prompt when controls exist', async () => {
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    document.body.appendChild(controls);
    controlTargetState.current = controls;
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();

    expect(document.querySelector('.aiob-video-control-bar-button')).toBeTruthy();
    expect(getPromptFromShadowDom()).toBeNull();
    expect(ensureVideoControlBarButtonMock).toHaveBeenCalled();
  });

  it('opens a control-bar capture with persisted preferences', async () => {
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    document.body.appendChild(controls);
    controlTargetState.current = controls;
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);
    const video = document.createElement('video');
    document.body.appendChild(video);
    const pauseSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);

    await module.initVideoPrompt();
    await flushMicrotasks();

    const controlOptions = ensureVideoControlBarButtonMock.mock.calls.at(-1)?.[0];
    expect(controlOptions?.preferences).toEqual({
      autoPauseEnabled: true,
      captureScreenshotEnabled: false
    });

    controlOptions?.onPreferencesChange({
      autoPauseEnabled: false,
      captureScreenshotEnabled: true
    });
    await flushMicrotasks();
    expect(deps.videoRepo.saveControlBarPreferences).toHaveBeenCalledWith({
      autoPauseEnabled: false,
      captureScreenshotEnabled: true
    });

    controlOptions?.onPopoverOpen?.({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    controlOptions?.onPrimaryAction(
      {
        autoPauseEnabled: false,
        captureScreenshotEnabled: true
      },
      {
        comment: 'watch this',
        source: 'note-input'
      }
    );
    await flushMicrotasks();

    expect(videoSessionFactoryMock).toHaveBeenCalledTimes(1);
    expect(startVideoSessionMock).toHaveBeenCalledWith({ initialCollapsed: true });
    expect(addCurrentTimestampMock).toHaveBeenCalledWith('note-input', {
      comment: 'watch this',
      pauseVideo: false,
      captureScreenshot: true,
      beginEditing: false,
      resumePlayback: false,
      collapseAfterCapture: true
    });
  });

  it('resumes playback after submitting a control-bar note when auto-pause is enabled', async () => {
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    document.body.appendChild(controls);
    controlTargetState.current = controls;
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();

    const controlOptions = ensureVideoControlBarButtonMock.mock.calls.at(-1)?.[0];
    controlOptions?.onPrimaryAction(
      {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      {
        comment: 'resume after save',
        source: 'note-input'
      }
    );
    await flushMicrotasks();

    expect(addCurrentTimestampMock).toHaveBeenCalledWith('note-input', {
      comment: 'resume after save',
      pauseVideo: false,
      captureScreenshot: true,
      beginEditing: false,
      resumePlayback: true,
      collapseAfterCapture: true
    });
  });

  it('resumes playback when an auto-paused control-bar popover is dismissed outside', async () => {
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    document.body.appendChild(controls);
    controlTargetState.current = controls;
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);
    const video = document.createElement('video');
    document.body.appendChild(video);
    const playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());

    await module.initVideoPrompt();
    await flushMicrotasks();

    const controlOptions = ensureVideoControlBarButtonMock.mock.calls.at(-1)?.[0];
    controlOptions?.onPopoverDismiss?.({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('opens a legacy control-bar capture without a typed note when called directly', async () => {
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    document.body.appendChild(controls);
    controlTargetState.current = controls;
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();

    const controlOptions = ensureVideoControlBarButtonMock.mock.calls.at(-1)?.[0];
    controlOptions?.onPrimaryAction({
      autoPauseEnabled: false,
      captureScreenshotEnabled: true
    });
    await flushMicrotasks();

    expect(videoSessionFactoryMock).toHaveBeenCalledTimes(1);
    expect(startVideoSessionMock).toHaveBeenCalledWith({ initialCollapsed: true });
    expect(addCurrentTimestampMock).toHaveBeenCalledWith('button', {
      pauseVideo: false,
      captureScreenshot: true,
      beginEditing: true,
      collapseAfterCapture: true
    });
  });

  it('ignores danmaku-only observer callbacks without remounting the prompt', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();
    const initialMounts = createPromptElementMock.mock.calls.length;

    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();

    expect(createPromptElementMock).toHaveBeenCalledTimes(initialMounts);
  });

  it('does not resync control entry from unrelated page churn before the control target exists', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();

    const initialControlSyncs = ensureVideoControlBarButtonMock.mock.calls.length;
    const initialPromptMounts = createPromptElementMock.mock.calls.length;
    controlTargetObservers.forEach(({ onTarget }) => {
      const unrelated = document.createElement('aside');
      unrelated.className = 'recommendations';
      document.body.appendChild(unrelated);
      onTarget(unrelated);
    });
    await flushMicrotasks();

    expect(ensureVideoControlBarButtonMock.mock.calls.length).toBe(initialControlSyncs);
    expect(createPromptElementMock.mock.calls.length).toBe(initialPromptMounts);
  });

  it('applies config updates and removes prompt when disabled', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();

    const updatedConfig: VideoOptionsStub = {
      floatingPromptEnabled: true,
      promptButtonLabel: 'Quick clip',
      promptShortcut: 'Alt+Q',
      promptPosition: { x: 40, y: 80 },
      controlBarAutoPause: true,
      controlBarScreenshot: false
    };
    deps.emitConfigChange(updatedConfig);
    await flushMicrotasks();
    const lastLabelCall = updatePromptLabelsMock.mock.calls.at(-1);
    expect(lastLabelCall?.[1]).toBe('Quick clip');
    expect(lastLabelCall?.[2]).toBe('ALT+Q');

    const disabledConfig: VideoOptionsStub = {
      floatingPromptEnabled: false,
      promptButtonLabel: 'Hidden',
      promptShortcut: 'None',
      promptPosition: { x: 0, y: 0 },
      controlBarAutoPause: true,
      controlBarScreenshot: false
    };
    deps.emitConfigChange(disabledConfig);
    await flushMicrotasks();
    expect(getPromptFromShadowDom()).toBeNull();
  });

  it('re-evaluates when language setting changes', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();
    const initialCalls = matchesSupportedVideoHostMock.mock.calls.length;

    deps.triggerLanguageChange();
    await flushMicrotasks();
    expect(matchesSupportedVideoHostMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('re-evaluates on YouTube navigation finish events', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    await flushMicrotasks();
    const initialCalls = isValidVideoPlayPageMock.mock.calls.length;

    document.dispatchEvent(new Event('yt-navigate-finish'));
    await flushMicrotasks();

    expect(isValidVideoPlayPageMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('replays Stitch runtime styles after async load on first prompt mount', async () => {
    const stitchDeferred = createDeferred<string>();
    const stitchSecondaryDeferred = createDeferred<string>();
    loadExtensionStyleMock.mockImplementation((path: string) => {
      if (path === 'options/stitch/styles/stitch.css') {
        return stitchDeferred.promise;
      }
      if (path === 'options/stitch/styles/variants/stitch-secondary.css') {
        return stitchSecondaryDeferred.promise;
      }
      return Promise.resolve('');
    });

    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    const initPromise = module.initVideoPrompt();
    stitchDeferred.resolve('.stitch-ready{opacity:1;}');
    stitchSecondaryDeferred.resolve('.stitch-secondary-ready{opacity:1;}');
    await initPromise;
    await flushMicrotasks();
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();

    const host = Array.from(document.body.children).find((element) =>
      element.shadowRoot?.querySelector('#aiob-video-floating-prompt')
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).toBeTruthy();
    expect(
      shadow?.querySelector('style[data-aiob-style-bridge="panel-stitch-runtime"]')?.textContent
    ).toContain('.stitch-ready');
    expect(
      shadow?.querySelector('style[data-aiob-style-bridge="panel-stitch-secondary-runtime"]')
        ?.textContent
    ).toContain('.stitch-secondary-ready');
  });

  it('tears down prompt DOM on pagehide and restores it on pageshow', async () => {
    const module = await loadPromptModule();
    currentTestUtils = module.__videoPromptTestUtils;
    const deps = createTestDependencies();
    currentTestUtils.setDependenciesForTests(deps as unknown as VideoPromptDependencies);

    await module.initVideoPrompt();
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();
    expect(getPromptFromShadowDom()).not.toBeNull();

    window.dispatchEvent(new Event('pagehide'));
    await flushMicrotasks();
    expect(getPromptFromShadowDom()).toBeNull();

    window.dispatchEvent(new Event('pageshow'));
    observerCallbacks.forEach((callback) => callback());
    await flushMicrotasks();
    expect(getPromptFromShadowDom()).not.toBeNull();
  });
});
