import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import type { VideoOptions } from '../../shared/types/options';
import { detectVideoIdentity } from './utils';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import type { VideoPromptDependencies, VideoPromptSessionLike } from './videoPromptDependencies';
import {
  matchesSupportedVideoHost,
  hasPlayableVideo,
  isValidVideoPlayPage
} from './videoPromptObserver';
import type {
  VideoControlBarButtonTexts,
  VideoControlBarNotePayload,
  VideoControlBarPreferences
} from './videoControlBarButton';
import { toControlBarCaptureOptions } from './videoPromptControlBarAdapter';
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
import { watchVideoNavigation, type VideoNavigationWatcher } from './videoNavigationWatcher';
import { applySideClass, deriveSideFromPosition } from './videoPromptLayout';
import {
  clearVideoSession,
  getVideoSession,
  isVideoSessionActive
} from '../runtime/contentSessionRegistry';
import {
  VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES,
  VIDEO_PROMPT_DEFAULT_LABEL,
  VIDEO_PROMPT_DEFAULT_SHORTCUT
} from './videoPromptState';
import {
  resolveControlBarPreferences,
  resolvePromptLabel,
  resolvePromptShortcut,
  startLanguageWatcher,
  startVideoConfigWatcher
} from './videoPromptSettingsWatcher';
import { createVideoPromptControlTargetLifecycle } from './videoPromptControlTargetLifecycle';
import { createVideoPromptMountLifecycle } from './videoPromptMountLifecycle';

declare const __DEV__: boolean;

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
let lastEvaluatedUrl = '';
let messagesCache: Messages | null = null;
let sessionStarting = false;
let stopLanguageWatcher: (() => void) | null = null;
let resizeListenerRegistered = false;
let stopSettingsWatcher: (() => void) | null = null;
let navigationWatcher: VideoNavigationWatcher | null = null;
let lifecycleListenersRegistered = false;
let promptButtonLabel = VIDEO_PROMPT_DEFAULT_LABEL;
let promptShortcut = VIDEO_PROMPT_DEFAULT_SHORTCUT;
let controlBarPreferences = { ...VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES };
let controlBarTexts = toControlBarTexts(DEFAULT_RUNTIME_MESSAGES);

const promptMountLifecycle = createVideoPromptMountLifecycle({
  getDocument: () => document,
  getWindow: () => window,
  getMessages: () => getPromptMessages(),
  getLabel: () => promptButtonLabel,
  getShortcut: () => promptShortcut,
  getIconUrl: () => {
    try {
      return getRuntimeService().getURL('icons/bannerlogo-48.png');
    } catch {
      return null;
    }
  },
  getRuntimeTheme: () => getVideoPromptDependencies().getRuntimeTheme(),
  isPromptEnabled: () => promptEnabled,
  isPromptSuppressed: () => promptSuppressed,
  isVideoSessionActive: () => isVideoSessionActive(document),
  setPromptSuppressed: (value) => {
    promptSuppressed = value;
  },
  startVideoSession: () => {
    void startVideoSession();
  },
  getStoredPromptPosition: () => getVideoRepository().getPromptPosition(),
  saveStoredPromptPosition: (position) => getVideoRepository().savePromptPosition(position)
});

const controlTargetLifecycle = createVideoPromptControlTargetLifecycle({
  getDocument: () => document,
  getWindow: () => window,
  getUrl: () => window.location.href,
  getLabel: () => promptButtonLabel,
  getShortcut: () => promptShortcut,
  getTexts: () => controlBarTexts,
  getPreferences: () => controlBarPreferences,
  setPreferences: (preferences) => {
    controlBarPreferences = preferences;
    void getVideoRepository().saveControlBarPreferences(preferences);
  },
  getIconUrl: () => {
    try {
      return getRuntimeService().getURL('icons/bannerlogo-48.png');
    } catch {
      return null;
    }
  },
  onPrimaryAction: (preferences, payload) => {
    promptSuppressed = true;
    promptMountLifecycle.removePrompt();
    return captureFromControlBar(preferences, payload);
  },
  onTargetObserved: () => evaluatePrompt(true),
  incrementSyncCount: () => {
    promptMountLifecycle.incrementControlButtonSyncCount();
  }
});

function toControlBarTexts(
  messages: Pick<
    Messages,
    | 'videoControlBarNotePlaceholder'
    | 'videoControlBarNoteAriaLabel'
    | 'videoControlBarAutoPauseLabel'
    | 'videoControlBarScreenshotLabel'
  >
): VideoControlBarButtonTexts {
  return {
    notePlaceholder: messages.videoControlBarNotePlaceholder,
    noteAriaLabel: messages.videoControlBarNoteAriaLabel,
    autoPauseLabel: messages.videoControlBarAutoPauseLabel,
    screenshotLabel: messages.videoControlBarScreenshotLabel
  };
}

function cachePromptMessages(messages: Messages): Messages {
  messagesCache = messages;
  controlBarTexts = toControlBarTexts(messages);
  return messages;
}

async function getPromptMessages(): Promise<Messages> {
  if (!messagesCache) {
    await ensureContentI18n(document);
    const resource = getContentI18nResource();
    return cachePromptMessages(resource?.messages ?? (await getContentMessages()));
  }
  return messagesCache;
}

function invalidatePromptMessages(): void {
  messagesCache = null;
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
    promptMountLifecycle.updatePromptDomLabels();
  }
}

function evaluatePrompt(force = false): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  promptMountLifecycle.incrementEvaluateCount();

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
  const controlTarget = isValidVideoPage ? controlTargetLifecycle.hasTarget() : false;

  const shouldShow =
    promptEnabled &&
    !promptSuppressed &&
    window === window.top &&
    !isVideoSessionActive(document) &&
    isValidVideoPage &&
    videoDetected;

  promptMountLifecycle.setDebugState({
    shouldShow,
    promptEnabled,
    promptSuppressed,
    isTopWindow: window === window.top,
    identityPlatform: identity.platform,
    hostSupported,
    videoDetected,
    isValidVideoPage,
    url: currentUrl,
    ...promptMountLifecycle.getDebugPositionFields()
  });

  if (!isValidVideoPage) {
    controlTargetLifecycle.clearObserver();
    controlTargetLifecycle.clearRetry();
    controlTargetLifecycle.removeButton();
  } else if (controlTarget) {
    controlTargetLifecycle.clearObserver();
    controlTargetLifecycle.clearRetry();
    controlTargetLifecycle.syncButton();
    promptMountLifecycle.removePrompt();
    return;
  } else if (promptEnabled && !promptSuppressed) {
    controlTargetLifecycle.removeButton();
    controlTargetLifecycle.ensureObserver();
  } else {
    controlTargetLifecycle.clearObserver();
    controlTargetLifecycle.clearRetry();
  }

  if (!shouldShow) {
    promptMountLifecycle.removePrompt();
    return;
  }

  if (!promptMountLifecycle.getDebugPositionFields().hasPromptElement) {
    void promptMountLifecycle.mountPrompt();
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

async function captureFromControlBar(
  preferences: VideoControlBarPreferences,
  payload?: VideoControlBarNotePayload
): Promise<void> {
  if (sessionStarting) {
    return;
  }

  const existingSession = getVideoSession<VideoPromptSessionLike>();
  if (existingSession) {
    await existingSession.addCurrentTimestamp?.(
      payload?.source ?? 'button',
      toControlBarCaptureOptions(preferences, payload)
    );
    return;
  }

  sessionStarting = true;
  try {
    console.info('[VideoPrompt] Starting video session from control bar…');
    const session = getVideoPromptDependencies().createVideoSession(document);
    await session.start({ initialCollapsed: true });
    await session.addCurrentTimestamp?.(
      payload?.source ?? 'button',
      toControlBarCaptureOptions(preferences, payload)
    );
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

  stopSettingsWatcher = startVideoConfigWatcher(getVideoRepository(), applyConfig);
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
  stopLanguageWatcher = startLanguageWatcher(getStorageService(), () => {
    void (async () => {
      invalidatePromptMessages();
      try {
        await getPromptMessages();
      } finally {
        evaluatePrompt(true);
      }
    })();
  });
}

function handlePageHide(): void {
  teardownPromptWatchers();
  promptMountLifecycle.removePrompt();
}

function handlePageShow(): void {
  if (!videoPromptDependencies || !matchesSupportedVideoHost(window.location.href)) {
    return;
  }
  setupVideoConfigListener();
  setupLanguageListener();
  setupNavigationWatcher();
  void refreshSettings();
  void promptMountLifecycle.loadPromptPosition();
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
  controlTargetLifecycle.clearObserver();
  controlTargetLifecycle.clearRetry();
  controlTargetLifecycle.removeButton();
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
  await promptMountLifecycle.loadPromptPosition();
  setupVideoConfigListener();
  setupLanguageListener();
  setupNavigationWatcher();
  ensureLifecycleListeners();
  if (!resizeListenerRegistered) {
    window.addEventListener('resize', promptMountLifecycle.handleWindowResize, { passive: true });
    resizeListenerRegistered = true;
  }

  evaluatePrompt(true);
}

function applyVideoSettings(video?: VideoOptions): void {
  promptEnabled = video?.floatingPromptEnabled !== false;
  promptButtonLabel = resolvePromptLabel(video?.promptButtonLabel);
  promptShortcut = resolvePromptShortcut(video?.promptShortcut);
  controlBarPreferences = resolveControlBarPreferences(video);
  promptMountLifecycle.applyPromptPositionFromConfig(video?.promptPosition ?? null);
  promptMountLifecycle.updatePromptDomLabels();
}

export const videoPromptLifecycleTestUtils = {
  clamp,
  computeTentativePosition,
  computeSnapSide,
  applySideClass,
  setPromptSide: (side: PromptSide, element?: HTMLElement | null) =>
    promptMountLifecycle.setPromptSide(side, element ?? null),
  computeDockedPlacement,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  DRAG_ACTIVATE_DISTANCE,
  applyPromptPositionFromConfig: promptMountLifecycle.applyPromptPositionFromConfig,
  deriveSideFromPosition,
  setPromptStateForTests: promptMountLifecycle.setPromptState,
  getPromptStateForTests: promptMountLifecycle.getStateSnapshot,
  setDependenciesForTests: __setVideoPromptDependenciesForTests,
  resetDependenciesForTests: __resetVideoPromptDependenciesForTests,
  getDebugStateForTests: promptMountLifecycle.getDebugState,
  getDebugCountersForTests: promptMountLifecycle.getDebugCountersSnapshot,
  resetDebugStateForTests: promptMountLifecycle.resetDebugState,
  resetDebugCountersForTests: promptMountLifecycle.resetDebugCounters,
  savePromptPositionForTests: promptMountLifecycle.savePromptPosition,
  loadPromptPositionForTests: promptMountLifecycle.loadPromptPosition,
  setupVideoConfigListenerForTests,
  cleanupPromptForTests: () => {
    teardownPromptWatchers();
    promptMountLifecycle.removePrompt();
    promptMountLifecycle.resetDebugCounters();
  }
};

if (typeof __DEV__ === 'boolean' && __DEV__) {
  (
    globalThis as typeof globalThis & {
      __aiobVideoPromptTestUtils?: typeof videoPromptLifecycleTestUtils;
    }
  ).__aiobVideoPromptTestUtils = videoPromptLifecycleTestUtils;
}

export { isValidVideoPlayPage };
