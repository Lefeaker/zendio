import type { Messages } from '../../i18n';
import type { VideoOptions } from '../../shared/types/options';
import { detectVideoIdentity } from './utils';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import { panelStyleSheetManager } from '../shared/panels/styleSheetManager';
import { DEFAULT_OPTIONS } from '../../shared/config';
import type { VideoPromptDependencies } from './videoPromptDependencies';
import {
  observeVideoElements,
  disconnectVideoObserver,
  matchesSupportedVideoHost,
  hasPlayableVideo,
  isValidVideoPlayPage
} from './videoPromptObserver';
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

const PROMPT_ID = 'aiob-video-floating-prompt';
const VIDEO_PROMPT_DEFAULT_LABEL = DEFAULT_OPTIONS.video?.promptButtonLabel ?? 'Clip video';
const VIDEO_PROMPT_DEFAULT_SHORTCUT = DEFAULT_OPTIONS.video?.promptShortcut ?? '';

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
let promptElement: HTMLDivElement | null = null;
let lastEvaluatedUrl = '';
let messagesCache: Messages | null = null;
let sessionStarting = false;
let promptMountTask: Promise<void> | null = null;
let stopLanguageWatcher: (() => void) | null = null;
const layoutState = createPromptLayoutState();
let resizeListenerRegistered = false;
let stopSettingsWatcher: (() => void) | null = null;
let urlPollTimer: number | null = null;
let lifecycleListenersRegistered = false;
let promptButtonLabel = VIDEO_PROMPT_DEFAULT_LABEL;
let promptShortcut = VIDEO_PROMPT_DEFAULT_SHORTCUT;
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

let promptDebugState: VideoPromptDebugState | null = null;

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

function ensureUrlPollTimer(): void {
  if (urlPollTimer !== null) {
    return;
  }
  urlPollTimer = window.setInterval(() => {
    evaluatePrompt();
  }, 1200);
}

function clearUrlPollTimer(): void {
  if (urlPollTimer === null) {
    return;
  }
  window.clearInterval(urlPollTimer);
  urlPollTimer = null;
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

async function refreshSettings(): Promise<void> {
  try {
    const config = await getVideoRepository().getVideoConfig();
    applyVideoSettings(config);
  } catch {
    promptEnabled = true;
    promptButtonLabel = VIDEO_PROMPT_DEFAULT_LABEL;
    promptShortcut = VIDEO_PROMPT_DEFAULT_SHORTCUT;
    updatePromptDomLabels();
  }
}

function evaluatePrompt(force = false): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

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
    panelStyleSheetManager.applyVideoStyles(shadow);

    const { container, bubble } = createPromptElement({
      id: PROMPT_ID,
      label: promptButtonLabel,
      shortcut: promptShortcut,
      messages,
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

function handleVisibilityChange(): void {
  evaluatePrompt();
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
  observeVideoElements(() => evaluatePrompt());
  void refreshSettings();
  void loadPromptPosition();
  ensureUrlPollTimer();
  evaluatePrompt(true);
}

function ensureLifecycleListeners(): void {
  if (lifecycleListenersRegistered) {
    return;
  }

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
  window.addEventListener('pagehide', handlePageHide, { passive: true });
  window.addEventListener('pageshow', handlePageShow, { passive: true });
  lifecycleListenersRegistered = true;
}

function teardownPromptWatchers(): void {
  stopSettingsWatcher?.();
  stopSettingsWatcher = null;
  stopLanguageWatcher?.();
  stopLanguageWatcher = null;
  clearUrlPollTimer();
  disconnectVideoObserver();
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
  observeVideoElements(() => evaluatePrompt());
  ensureUrlPollTimer();
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
  setPromptSide: (side: PromptSide, element?: HTMLDivElement | null) =>
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
  resetDebugStateForTests: () => {
    promptDebugState = null;
  },
  savePromptPositionForTests: savePromptPosition,
  loadPromptPositionForTests: loadPromptPosition,
  setupVideoConfigListenerForTests,
  cleanupPromptForTests: () => {
    teardownPromptWatchers();
    removePrompt();
  }
};

export { isValidVideoPlayPage };
