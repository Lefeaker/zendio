import type { Messages } from '../../i18n';
import type { VideoOptions } from '../../shared/types/options';
import { detectVideoIdentity } from './utils';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import { panelStyleSheetManager } from '../shared/panels/styleSheetManager';
import { DEFAULT_OPTIONS } from '../../shared/config';
import type { VideoPromptDependencies, VideoPromptSessionLike } from './videoPromptDependencies';
import {
  findVideoControlTarget,
  findVideoControlObserverRoot,
  observeVideoControlTarget,
  matchesSupportedVideoHost,
  hasPlayableVideo,
  isValidVideoPlayPage
} from './videoPromptObserver';
import {
  ensureVideoControlBarButton,
  removeVideoControlBarButton,
  type VideoControlBarPreferences
} from './videoControlBarButton';
import {
  clamp,
  computeTentativePosition,
  computeDockedPlacement,
  computeSnapSide,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  DRAG_ACTIVATE_DISTANCE,
  type PromptSide
} from './videoPromptPosition';
import { createPromptElement, attachDragHandlers, updatePromptLabels } from './videoPromptRenderer';
import { watchVideoNavigation, type VideoNavigationWatcher } from './videoNavigationWatcher';
import {
  createPromptLayoutState,
  setLayoutState,
  getLayoutStateSnapshot,
  applySideClass,
  setPromptSide,
  applyStoredPosition,
  adjustLayoutForResize,
  deriveSideFromPosition,
  type PromptLayoutState
} from './videoPromptLayout';
import {
  clearVideoSession,
  getVideoSession,
  isVideoSessionActive
} from '../runtime/contentSessionRegistry';

declare const __DEV__: boolean;

const PROMPT_ID = 'aiob-video-floating-prompt';
const VIDEO_PROMPT_DEFAULT_LABEL = DEFAULT_OPTIONS.video?.promptButtonLabel ?? 'Clip video';
const VIDEO_PROMPT_DEFAULT_SHORTCUT = DEFAULT_OPTIONS.video?.promptShortcut ?? '';
const VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES: VideoControlBarPreferences = {
  autoPauseEnabled: DEFAULT_OPTIONS.video?.controlBarAutoPause ?? true,
  captureScreenshotEnabled: DEFAULT_OPTIONS.video?.controlBarScreenshot ?? true
};
const CONTROL_TARGET_RETRY_DELAYS_MS = [100, 250, 500, 1000] as const;

let videoPromptDependencies: VideoPromptDependencies | null = null;

function getVideoPromptDependencies(): VideoPromptDependencies {
  if (!videoPromptDependencies) {
    throw new Error('VideoPrompt dependencies have not been configured');
  }
  return videoPromptDependencies;
}

export function __setVideoPromptDependenciesForTests(deps: VideoPromptDependencies): void {
  videoPromptDependencies = deps;
}

export function __resetVideoPromptDependenciesForTests(): void {
  videoPromptDependencies = null;
}

function getVideoRepository() {
  return getVideoPromptDependencies().videoRepo;
}

function getRuntimeService() {
  return getVideoPromptDependencies().runtime;
}

function getStorageService() {
  return getVideoPromptDependencies().storage;
}

let promptEnabled = true;
let promptSuppressed = false;
let promptHost: HTMLDivElement | null = null;
let promptElement: HTMLElement | null = null;
let lastEvaluatedUrl = '';
let messagesCache: Messages | null = null;
let sessionStarting = false;
let promptMountTask: Promise<void> | null = null;
let stopLanguageWatcher: (() => void) | null = null;
const layoutState = createPromptLayoutState();
let resizeListenerRegistered = false;
let stopSettingsWatcher: (() => void) | null = null;
let stopControlTargetObserver: (() => void) | null = null;
let controlTargetRetryHandle: number | null = null;
let controlTargetRetryIndex = 0;
let navigationWatcher: VideoNavigationWatcher | null = null;
let lifecycleListenersRegistered = false;
let promptButtonLabel = VIDEO_PROMPT_DEFAULT_LABEL;
let promptShortcut = VIDEO_PROMPT_DEFAULT_SHORTCUT;
let controlBarPreferences = { ...VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES };
type VideoPromptDebugState = {
  shouldShow: boolean;
  promptEnabled: boolean;
  promptSuppressed: boolean;
  isTopWindow: boolean;
  identityPlatform: string;
  hostSupported: boolean;
  videoDetected: boolean;
  isValidVideoPage: boolean;
  hasPromptElement: boolean;
  url: string;
  side: PromptSide;
  hasCustomPosition: boolean;
  storedTop: number;
  storedLeft: number;
  elementTop: number | null;
  elementLeft: number | null;
};

type VideoPromptDebugCounters = {
  evaluateCount: number;
  controlButtonSyncCount: number;
  floatingPromptMountCount: number;
};

let promptDebugState: VideoPromptDebugState | null = null;
const promptDebugCounters: VideoPromptDebugCounters = {
  evaluateCount: 0,
  controlButtonSyncCount: 0,
  floatingPromptMountCount: 0
};

function getPromptDebugCountersSnapshot(): VideoPromptDebugCounters {
  return { ...promptDebugCounters };
}

function resetPromptDebugCounters(): void {
  promptDebugCounters.evaluateCount = 0;
  promptDebugCounters.controlButtonSyncCount = 0;
  promptDebugCounters.floatingPromptMountCount = 0;
}

function setPromptStateForTests(
  state: Partial<{ left: number; top: number; side: PromptSide; hasCustomPosition: boolean }>
): void {
  setLayoutState(layoutState, state as Partial<PromptLayoutState>);
  if (promptElement) {
    applyStoredPosition(layoutState, promptElement);
    updateDebugPosition();
  }
}

function getPromptStateSnapshot(): {
  left: number;
  top: number;
  side: PromptSide;
  hasCustomPosition: boolean;
} {
  return getLayoutStateSnapshot(layoutState);
}

async function getPromptMessages(): Promise<Messages> {
  if (!messagesCache) {
    await ensureContentI18n(document);
    const resource = getContentI18nResource();
    messagesCache = resource?.messages ?? (await getContentMessages());
  }
  return messagesCache;
}

function invalidatePromptMessages(): void {
  messagesCache = null;
}

function handleWindowResize(): void {
  if (!promptElement) {
    return;
  }
  adjustLayoutForResize(layoutState, promptElement);
  updateDebugPosition();
}

function updateDebugPosition(): void {
  if (!promptDebugState) {
    return;
  }
  promptDebugState.hasPromptElement = Boolean(promptElement);
  promptDebugState.side = layoutState.side;
  promptDebugState.hasCustomPosition = layoutState.hasCustomPosition;
  promptDebugState.storedTop = layoutState.top;
  promptDebugState.storedLeft = layoutState.left;
  promptDebugState.elementTop = promptElement ? promptElement.getBoundingClientRect().top : null;
  promptDebugState.elementLeft = promptElement ? promptElement.getBoundingClientRect().left : null;
}

async function savePromptPosition(): Promise<void> {
  try {
    await getVideoRepository().savePromptPosition({
      x: layoutState.left,
      y: layoutState.top
    });
  } catch (error) {
    console.warn('[VideoPrompt] Failed to save prompt position:', error);
  }
}

function applyPromptPositionFromConfig(
  position: { x: number; y: number } | null | undefined
): void {
  if (!position) {
    setLayoutState(layoutState, { hasCustomPosition: false });
    return;
  }

  setLayoutState(layoutState, {
    hasCustomPosition: true,
    left: position.x,
    top: position.y,
    side: deriveSideFromPosition(position.x)
  });

  if (promptElement) {
    applyStoredPosition(layoutState, promptElement);
    updateDebugPosition();
  }
}

async function loadPromptPosition(): Promise<void> {
  try {
    const position = await getVideoRepository().getPromptPosition();
    applyPromptPositionFromConfig(position);
  } catch (error) {
    console.warn('[VideoPrompt] Failed to load prompt position:', error);
  }
}

function removePrompt(): void {
  promptHost?.remove();
  promptHost = null;
  promptElement = null;
  if (promptDebugState) {
    promptDebugState.hasPromptElement = false;
    promptDebugState.elementTop = null;
    promptDebugState.elementLeft = null;
  }
}

function clearControlTargetObserver(): void {
  stopControlTargetObserver?.();
  stopControlTargetObserver = null;
}

function clearControlTargetRetry(): void {
  if (controlTargetRetryHandle !== null) {
    window.clearTimeout(controlTargetRetryHandle);
    controlTargetRetryHandle = null;
  }
  controlTargetRetryIndex = 0;
}

function scheduleControlTargetRetry(): void {
  if (controlTargetRetryHandle !== null) {
    return;
  }

  const delay = CONTROL_TARGET_RETRY_DELAYS_MS[controlTargetRetryIndex];
  if (delay === undefined) {
    return;
  }

  controlTargetRetryIndex += 1;
  controlTargetRetryHandle = window.setTimeout(() => {
    controlTargetRetryHandle = null;
    ensureControlTargetObserver();
  }, delay);
}

function syncVideoControlBarButton(): void {
  promptDebugCounters.controlButtonSyncCount += 1;
  ensureVideoControlBarButton({
    doc: document,
    url: window.location.href,
    label: promptButtonLabel,
    shortcut: promptShortcut,
    getIconUrl: () => {
      try {
        return getRuntimeService().getURL('icons/bannerlogo-48.png');
      } catch {
        return null;
      }
    },
    preferences: controlBarPreferences,
    onPreferencesChange: (preferences) => {
      controlBarPreferences = preferences;
      void getVideoRepository().saveControlBarPreferences(preferences);
    },
    onPrimaryAction: (preferences) => {
      promptSuppressed = true;
      removePrompt();
      void captureFromControlBar(preferences);
    }
  });
}

function ensureControlTargetObserver(): void {
  if (findVideoControlTarget(document, window.location.href)) {
    clearControlTargetObserver();
    clearControlTargetRetry();
    syncVideoControlBarButton();
    return;
  }
  if (stopControlTargetObserver) {
    return;
  }

  if (!findVideoControlObserverRoot(document, window.location.href)) {
    scheduleControlTargetRetry();
    return;
  }

  clearControlTargetRetry();
  stopControlTargetObserver = observeVideoControlTarget({
    doc: document,
    url: window.location.href,
    onTarget: (target) => {
      const currentTarget = findVideoControlTarget(document, window.location.href);
      if (!currentTarget || currentTarget !== target) {
        return;
      }
      stopControlTargetObserver = null;
      clearControlTargetRetry();
      syncVideoControlBarButton();
      evaluatePrompt(true);
    }
  });
}

function refreshForNavigationChange(): void {
  promptSuppressed = false;
  evaluatePrompt(true);
}

function setupNavigationWatcher(): void {
  navigationWatcher?.stop();
  navigationWatcher = watchVideoNavigation(document, refreshForNavigationChange);
}

async function refreshSettings(): Promise<void> {
  try {
    const config = await getVideoRepository().getVideoConfig();
    applyVideoSettings(config);
  } catch {
    promptEnabled = true;
    promptButtonLabel = VIDEO_PROMPT_DEFAULT_LABEL;
    promptShortcut = VIDEO_PROMPT_DEFAULT_SHORTCUT;
    controlBarPreferences = { ...VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES };
    updatePromptDomLabels();
  }
}

function evaluatePrompt(force = false): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  promptDebugCounters.evaluateCount += 1;

  const currentUrl = window.location.href;
  if (force || currentUrl !== lastEvaluatedUrl) {
    promptSuppressed = false;
    lastEvaluatedUrl = currentUrl;
  }

  const identity = detectVideoIdentity(currentUrl);
  const hostSupported = matchesSupportedVideoHost(currentUrl);
  const videoDetected = hasPlayableVideo();

  // 更严格的视频页面检测：只在特定的视频播放页面显示
  const isValidVideoPage = isValidVideoPlayPage(currentUrl, identity);
  const controlTarget = isValidVideoPage ? findVideoControlTarget(document, currentUrl) : null;

  const shouldShow =
    promptEnabled &&
    !promptSuppressed &&
    window === window.top &&
    !isVideoSessionActive(document) &&
    isValidVideoPage &&
    videoDetected;

  promptDebugState = {
    shouldShow,
    promptEnabled,
    promptSuppressed,
    isTopWindow: window === window.top,
    identityPlatform: identity.platform,
    hostSupported,
    videoDetected,
    isValidVideoPage,
    hasPromptElement: Boolean(promptElement),
    url: currentUrl,
    side: layoutState.side,
    hasCustomPosition: layoutState.hasCustomPosition,
    storedTop: layoutState.top,
    storedLeft: layoutState.left,
    elementTop: promptElement ? promptElement.getBoundingClientRect().top : null,
    elementLeft: promptElement ? promptElement.getBoundingClientRect().left : null
  };
  updateDebugPosition();

  if (!isValidVideoPage) {
    clearControlTargetObserver();
    clearControlTargetRetry();
    removeVideoControlBarButton(document);
  } else if (controlTarget) {
    clearControlTargetObserver();
    clearControlTargetRetry();
    syncVideoControlBarButton();
    removePrompt();
    return;
  } else if (promptEnabled && !promptSuppressed) {
    removeVideoControlBarButton(document);
    ensureControlTargetObserver();
  } else {
    clearControlTargetObserver();
    clearControlTargetRetry();
  }

  if (!shouldShow) {
    removePrompt();
    return;
  }

  if (!promptElement) {
    void mountPrompt();
  }
}

async function mountPrompt(): Promise<void> {
  if (promptElement) {
    return;
  }
  if (promptMountTask !== null) {
    await promptMountTask;
    return;
  }

  const shouldAbortMount = (): boolean =>
    Boolean(
      promptElement ||
        promptSuppressed ||
        !promptEnabled ||
        isVideoSessionActive(document) ||
        window !== window.top
    );

  promptMountTask = (async () => {
    const messages = await getPromptMessages();

    if (shouldAbortMount()) {
      return;
    }

    if (!document.body) {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
      if (shouldAbortMount()) {
        return;
      }
    }

    if (promptElement) {
      return;
    }

    await panelStyleSheetManager.initialize();

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    const previewTheme = await getVideoPromptDependencies().getRuntimeTheme();

    const { container, bubble } = createPromptElement({
      id: PROMPT_ID,
      label: promptButtonLabel,
      shortcut: promptShortcut,
      messages,
      ...(previewTheme ? { previewTheme } : {}),
      getIconUrl: () => {
        try {
          return getRuntimeService().getURL('icons/bannerlogo-48.png');
        } catch {
          return null;
        }
      },
      onPrimaryAction: () => {
        promptSuppressed = true;
        removePrompt();
        void startVideoSession();
      },
      onDismiss: () => {
        promptSuppressed = true;
        removePrompt();
      }
    });

    shadow.appendChild(container);
    document.body.appendChild(host);
    promptHost = host;
    promptElement = container;
    promptDebugCounters.floatingPromptMountCount += 1;
    applyStoredPosition(layoutState, container);
    updateDebugPosition();

    attachDragHandlers({
      container,
      bubble,
      applySideClass,
      setPromptSide: (side, element) => setPromptSide(layoutState, side, element ?? null),
      applyStoredPosition: (element) => applyStoredPosition(layoutState, element),
      updateDebugValues: (values) => {
        if (!promptDebugState) {
          return;
        }
        if (typeof values.elementTop === 'number') {
          promptDebugState.elementTop = values.elementTop;
        }
        if (typeof values.elementLeft === 'number') {
          promptDebugState.elementLeft = values.elementLeft;
        }
        if (values.side) {
          promptDebugState.side = values.side;
        }
      },
      updateDebugPosition: () => updateDebugPosition(),
      onPositionCommitted: (placement) => {
        setLayoutState(layoutState, {
          hasCustomPosition: true,
          side: placement.side,
          left: placement.left,
          top: placement.top
        });
      },
      savePromptPosition: () => {
        void savePromptPosition();
      }
    });
  })();

  try {
    await promptMountTask;
  } finally {
    promptMountTask = null;
  }
}

async function startVideoSession(): Promise<void> {
  if (sessionStarting || getVideoSession()) {
    return;
  }

  sessionStarting = true;
  try {
    console.info('[VideoPrompt] Starting video session…');
    const session = getVideoPromptDependencies().createVideoSession(document);
    await session.start();
    console.info('[VideoPrompt] Video session started.');
    evaluatePrompt(true);
  } catch (error) {
    console.warn('[VideoPrompt] Failed to start video session:', error);
    clearVideoSession(undefined, document);
    promptSuppressed = false;
    evaluatePrompt(true);
  } finally {
    sessionStarting = false;
  }
}

async function captureFromControlBar(preferences: VideoControlBarPreferences): Promise<void> {
  if (sessionStarting) {
    return;
  }

  const existingSession = getVideoSession<VideoPromptSessionLike>();
  if (existingSession) {
    await existingSession.addCurrentTimestamp?.('button', {
      pauseVideo: preferences.autoPauseEnabled,
      captureScreenshot: preferences.captureScreenshotEnabled,
      beginEditing: true,
      collapseAfterCapture: true
    });
    return;
  }

  sessionStarting = true;
  try {
    console.info('[VideoPrompt] Starting video session from control bar…');
    const session = getVideoPromptDependencies().createVideoSession(document);
    await session.start();
    await session.addCurrentTimestamp?.('button', {
      pauseVideo: preferences.autoPauseEnabled,
      captureScreenshot: preferences.captureScreenshotEnabled,
      beginEditing: true,
      collapseAfterCapture: true
    });
    console.info('[VideoPrompt] Video session started from control bar.');
    evaluatePrompt(true);
  } catch (error) {
    console.warn('[VideoPrompt] Failed to start video session from control bar:', error);
    clearVideoSession(undefined, document);
    promptSuppressed = false;
    evaluatePrompt(true);
  } finally {
    sessionStarting = false;
  }
}

function setupVideoConfigListener(): void {
  stopSettingsWatcher?.();

  const applyConfig = (config?: VideoOptions) => {
    applyVideoSettings(config);
    evaluatePrompt(true);
  };

  void getVideoRepository()
    .getVideoConfig()
    .then((config) => applyConfig(config))
    .catch(() => applyConfig(undefined));

  stopSettingsWatcher = getVideoRepository().onConfigChange((config) => {
    applyConfig(config);
  });
}

function setupVideoConfigListenerForTests(): () => void {
  setupVideoConfigListener();
  return () => {
    stopSettingsWatcher?.();
    stopSettingsWatcher = null;
  };
}

function setupLanguageListener(): void {
  stopLanguageWatcher?.();
  stopLanguageWatcher = getStorageService().sync.watchKey<string>('language', () => {
    invalidatePromptMessages();
    evaluatePrompt(true);
  });
}

function handlePageHide(): void {
  teardownPromptWatchers();
  removePrompt();
}

function handlePageShow(): void {
  if (!videoPromptDependencies || !matchesSupportedVideoHost(window.location.href)) {
    return;
  }
  setupVideoConfigListener();
  setupLanguageListener();
  setupNavigationWatcher();
  void refreshSettings();
  void loadPromptPosition();
  evaluatePrompt(true);
}

function ensureLifecycleListeners(): void {
  if (lifecycleListenersRegistered) {
    return;
  }

  window.addEventListener('pagehide', handlePageHide, { passive: true });
  window.addEventListener('pageshow', handlePageShow, { passive: true });
  lifecycleListenersRegistered = true;
}

function teardownPromptWatchers(): void {
  stopSettingsWatcher?.();
  stopSettingsWatcher = null;
  stopLanguageWatcher?.();
  stopLanguageWatcher = null;
  navigationWatcher?.stop();
  navigationWatcher = null;
  clearControlTargetObserver();
  clearControlTargetRetry();
  removeVideoControlBarButton(document);
}

export async function initVideoPrompt(dependencies?: VideoPromptDependencies): Promise<void> {
  if (dependencies) {
    videoPromptDependencies = dependencies;
  }

  if (
    typeof window === 'undefined' ||
    window !== window.top ||
    !matchesSupportedVideoHost(window.location.href)
  ) {
    return;
  }

  await getPromptMessages();
  await refreshSettings();
  await loadPromptPosition();
  setupVideoConfigListener();
  setupLanguageListener();
  setupNavigationWatcher();
  ensureLifecycleListeners();
  if (!resizeListenerRegistered) {
    window.addEventListener('resize', handleWindowResize, { passive: true });
    resizeListenerRegistered = true;
  }

  evaluatePrompt(true);
}

function resolvePromptLabel(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : VIDEO_PROMPT_DEFAULT_LABEL;
}

function resolvePromptShortcut(value?: string): string {
  const trimmed = value?.trim();
  const normalized = trimmed ? trimmed.toUpperCase() : '';
  return normalized.length > 0 ? normalized : VIDEO_PROMPT_DEFAULT_SHORTCUT;
}

function applyVideoSettings(video?: VideoOptions): void {
  promptEnabled = video?.floatingPromptEnabled !== false;
  promptButtonLabel = resolvePromptLabel(video?.promptButtonLabel);
  promptShortcut = resolvePromptShortcut(video?.promptShortcut);
  controlBarPreferences = {
    autoPauseEnabled:
      video?.controlBarAutoPause ?? VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES.autoPauseEnabled,
    captureScreenshotEnabled:
      video?.controlBarScreenshot ?? VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES.captureScreenshotEnabled
  };
  applyPromptPositionFromConfig(video?.promptPosition ?? null);
  updatePromptDomLabels();
}

function updatePromptDomLabels(): void {
  if (!promptElement) {
    return;
  }
  updatePromptLabels(promptElement, promptButtonLabel, promptShortcut);
}

export const __videoPromptTestUtils = {
  clamp,
  computeTentativePosition,
  computeSnapSide,
  applySideClass,
  setPromptSide: (side: PromptSide, element?: HTMLElement | null) =>
    setPromptSide(layoutState, side, element ?? null),
  computeDockedPlacement,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  DRAG_ACTIVATE_DISTANCE,
  applyPromptPositionFromConfig,
  deriveSideFromPosition,
  setPromptStateForTests,
  getPromptStateForTests: getPromptStateSnapshot,
  setDependenciesForTests: __setVideoPromptDependenciesForTests,
  resetDependenciesForTests: __resetVideoPromptDependenciesForTests,
  getDebugStateForTests: () => promptDebugState,
  getDebugCountersForTests: getPromptDebugCountersSnapshot,
  resetDebugStateForTests: () => {
    promptDebugState = null;
  },
  resetDebugCountersForTests: resetPromptDebugCounters,
  savePromptPositionForTests: savePromptPosition,
  loadPromptPositionForTests: loadPromptPosition,
  setupVideoConfigListenerForTests,
  cleanupPromptForTests: () => {
    teardownPromptWatchers();
    removePrompt();
    resetPromptDebugCounters();
  }
};

if (typeof __DEV__ === 'boolean' && __DEV__) {
  (
    globalThis as typeof globalThis & {
      __aiobVideoPromptTestUtils?: typeof __videoPromptTestUtils;
    }
  ).__aiobVideoPromptTestUtils = __videoPromptTestUtils;
}

export { isValidVideoPlayPage };
