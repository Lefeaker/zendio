import { getMessages } from '../../i18n';
import { VideoSession } from './session';
import { detectVideoIdentity } from './utils';

const PROMPT_ID = 'aiob-video-floating-prompt';
const PROMPT_STYLE_ID = 'aiob-video-floating-prompt-style';
const SUPPORTED_VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'bilibili.com'];

let promptEnabled = true;
let promptSuppressed = false;
let promptElement: HTMLDivElement | null = null;
let lastEvaluatedUrl = '';
let styleMounted = false;
let messagesCache: Awaited<ReturnType<typeof getMessages>> | null = null;
let sessionStarting = false;
let videoObserver: MutationObserver | null = null;
type PromptSide = 'left' | 'right';

const EDGE_MARGIN = 24;
const DRAG_BOUNDARY_PADDING = 12;
const DRAG_ACTIVATE_DISTANCE = 3;

let promptCurrentSide: PromptSide = 'right';
let promptCurrentTop = EDGE_MARGIN;
let promptHasCustomPosition = false;
let resizeListenerRegistered = false;

declare global {
  interface Window {
    __aiobVideoPromptDebug?: {
      shouldShow: boolean;
      promptEnabled: boolean;
      promptSuppressed: boolean;
      isTopWindow: boolean;
      identityPlatform: string;
      hostSupported: boolean;
      videoDetected: boolean;
      hasPromptElement: boolean;
      url: string;
      side: PromptSide;
      hasCustomPosition: boolean;
      storedTop: number;
      elementTop: number | null;
    };
  }
}

function observeVideoElements(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  if (videoObserver) {
    return;
  }
  videoObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
      evaluatePrompt();
    }
  });
  try {
    videoObserver.observe(document.documentElement ?? document, { childList: true, subtree: true });
  } catch {
    videoObserver = null;
  }
}

function matchesSupportedVideoHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SUPPORTED_VIDEO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function hasPlayableVideo(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const video = document.querySelector('video');
  return Boolean(video && video.readyState >= 0);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function computeSnapSide(left: number, width: number, viewportWidth: number): PromptSide {
  const centerX = left + width / 2;
  return centerX < viewportWidth / 2 ? 'left' : 'right';
}

interface TentativePositionInput {
  originLeft: number;
  originTop: number;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  width: number;
  height: number;
}

function computeTentativePosition({
  originLeft,
  originTop,
  deltaX,
  deltaY,
  viewportWidth,
  viewportHeight,
  width,
  height
}: TentativePositionInput): { left: number; top: number } {
  const maxLeft = Math.max(
    DRAG_BOUNDARY_PADDING,
    viewportWidth - width - DRAG_BOUNDARY_PADDING
  );
  const maxTop = Math.max(
    DRAG_BOUNDARY_PADDING,
    viewportHeight - height - DRAG_BOUNDARY_PADDING
  );

  const nextLeft = clamp(originLeft + deltaX, DRAG_BOUNDARY_PADDING, maxLeft);
  const nextTop = clamp(originTop + deltaY, DRAG_BOUNDARY_PADDING, maxTop);

  return { left: nextLeft, top: nextTop };
}

function applySideClass(element: HTMLDivElement, side: PromptSide): void {
  element.classList.toggle('aiob-video-prompt--left', side === 'left');
  element.classList.toggle('aiob-video-prompt--right', side === 'right');
}

function setPromptSide(side: PromptSide, element: HTMLDivElement | null = promptElement): void {
  promptCurrentSide = side;
  if (element) {
    applySideClass(element, side);
  }
}

function applyStoredPosition(element: HTMLDivElement): void {
  setPromptSide(promptCurrentSide, element);
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
  const maxTop = Math.max(EDGE_MARGIN, viewportHeight - rect.height - EDGE_MARGIN);

  if (promptHasCustomPosition) {
    promptCurrentTop = clamp(promptCurrentTop, EDGE_MARGIN, maxTop);
    element.style.top = `${promptCurrentTop}px`;
    element.style.bottom = 'auto';
  } else {
    element.style.top = 'auto';
    element.style.bottom = `${EDGE_MARGIN}px`;
  }

  if (promptCurrentSide === 'left') {
    element.style.left = `${EDGE_MARGIN}px`;
    element.style.right = 'auto';
  } else {
    element.style.right = `${EDGE_MARGIN}px`;
    element.style.left = 'auto';
  }
}

function handleWindowResize(): void {
  if (!promptElement) {
    return;
  }

  const rect = promptElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
  const maxTop = Math.max(EDGE_MARGIN, viewportHeight - rect.height - EDGE_MARGIN);
  if (promptHasCustomPosition) {
    promptCurrentTop = clamp(promptCurrentTop, EDGE_MARGIN, maxTop);
  }
  applyStoredPosition(promptElement);
  updateDebugPosition();
}

function updateDebugPosition(): void {
  if (!window.__aiobVideoPromptDebug) {
    return;
  }
  window.__aiobVideoPromptDebug.hasPromptElement = Boolean(promptElement);
  window.__aiobVideoPromptDebug.side = promptCurrentSide;
  window.__aiobVideoPromptDebug.hasCustomPosition = promptHasCustomPosition;
  window.__aiobVideoPromptDebug.storedTop = promptCurrentTop;
  window.__aiobVideoPromptDebug.elementTop = promptElement ? promptElement.getBoundingClientRect().top : null;
}

const PROMPT_STYLES = `
#${PROMPT_ID} {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483645;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #f5f6ff;
  overflow: visible;
}

#${PROMPT_ID}::before {
  content: '';
  position: absolute;
  inset: -12px;
}

#${PROMPT_ID}[hidden] {
  display: none !important;
}

#${PROMPT_ID} .aiob-video-prompt__bubble {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background-color: rgba(30, 33, 64, 0.9);
  background-image: var(--aiob-video-prompt-icon, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: 70%;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.45), 0 0 16px rgba(87, 205, 255, 0.45);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  isolation: isolate;
}

#${PROMPT_ID} .aiob-video-prompt__bubble::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  background: radial-gradient(circle at 50% 50%, rgba(124, 92, 255, 0.45) 0%, rgba(87, 205, 255, 0.15) 55%, rgba(47, 51, 92, 0) 80%);
  opacity: 0.75;
  transition: opacity 0.25s ease;
  z-index: -1;
}

#${PROMPT_ID} .aiob-video-prompt__bubble:hover,
#${PROMPT_ID} .aiob-video-prompt__bubble:focus-visible {
  transform: translateY(-1px) scale(1.05);
  box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.6), 0 0 22px rgba(87, 205, 255, 0.6);
}

#${PROMPT_ID} .aiob-video-prompt__bubble:hover::before,
#${PROMPT_ID} .aiob-video-prompt__bubble:focus-visible::before {
  opacity: 1;
}

#${PROMPT_ID} .aiob-video-prompt__bubble:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.9);
  outline-offset: 3px;
}

#${PROMPT_ID}.aiob-video-prompt--dragging .aiob-video-prompt__bubble {
  cursor: grabbing;
}

#${PROMPT_ID} .aiob-video-prompt__hint {
  position: absolute;
  top: 50%;
  right: 100%;
  left: auto;
  transform: translate(-12px, -50%);
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 999px;
  background: rgba(24, 28, 52, 0.95);
  border: 1px solid rgba(116, 141, 231, 0.45);
  box-shadow: 0 12px 32px rgba(17, 22, 45, 0.35);
  opacity: 0;
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
  white-space: nowrap;
}

#${PROMPT_ID}.aiob-video-prompt--left .aiob-video-prompt__hint {
  right: auto;
  left: 100%;
  transform: translate(12px, -50%);
}

#${PROMPT_ID}:hover .aiob-video-prompt__hint,
#${PROMPT_ID} .aiob-video-prompt__bubble:focus-visible + .aiob-video-prompt__hint {
  opacity: 1;
  transform: translate(0, -50%);
}

#${PROMPT_ID} .aiob-video-prompt__close {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  padding: 0;
  background: rgba(24, 28, 52, 0.95);
  color: #f5f6ff;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(17, 22, 45, 0.35);
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

#${PROMPT_ID}:hover .aiob-video-prompt__close,
#${PROMPT_ID}:focus-within .aiob-video-prompt__close {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

#${PROMPT_ID} .aiob-video-prompt__close:hover,
#${PROMPT_ID} .aiob-video-prompt__close:focus-visible {
  background: rgba(45, 52, 88, 0.95);
}

@media (prefers-reduced-motion: reduce) {
  #${PROMPT_ID} .aiob-video-prompt__bubble,
  #${PROMPT_ID} .aiob-video-prompt__bubble::before,
  #${PROMPT_ID} .aiob-video-prompt__hint,
  #${PROMPT_ID} .aiob-video-prompt__close {
    transition: none;
  }
}
`;

function ensureStylesMounted(): void {
  if (styleMounted || typeof document === 'undefined') {
    return;
  }
  const target = document.head ?? document.documentElement ?? document;
  if (!target) {
    document.addEventListener('DOMContentLoaded', () => ensureStylesMounted(), { once: true });
    return;
  }
  const style = document.createElement('style');
  style.id = PROMPT_STYLE_ID;
  style.textContent = PROMPT_STYLES;
  target.appendChild(style);
  styleMounted = true;
}

function removePrompt(): void {
  promptElement?.remove();
  promptElement = null;
  if (window.__aiobVideoPromptDebug) {
    window.__aiobVideoPromptDebug.hasPromptElement = false;
    window.__aiobVideoPromptDebug.elementTop = null;
  }
}

async function refreshSettings(): Promise<void> {
  try {
    const { options } = await chrome.storage.sync.get('options');
    const enabled = options?.video?.floatingPromptEnabled;
    promptEnabled = enabled !== false;
  } catch {
    promptEnabled = true;
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
  const shouldShow =
    promptEnabled &&
    !promptSuppressed &&
    window === window.top &&
    !window.__aiobVideoActive &&
    (identity.platform !== 'unknown' || (hostSupported && videoDetected));

  window.__aiobVideoPromptDebug = {
    shouldShow,
    promptEnabled,
    promptSuppressed,
    isTopWindow: window === window.top,
    identityPlatform: identity.platform,
    hostSupported,
    videoDetected,
    hasPromptElement: Boolean(promptElement),
    url: currentUrl,
    side: promptCurrentSide,
    hasCustomPosition: promptHasCustomPosition,
    storedTop: promptCurrentTop,
    elementTop: promptElement ? promptElement.getBoundingClientRect().top : null
  };
  updateDebugPosition();

  if (!shouldShow) {
    removePrompt();
    return;
  }

  if (!promptElement) {
    ensureStylesMounted();
    void mountPrompt();
  }
}

async function mountPrompt(): Promise<void> {
  if (promptElement) {
    return;
  }
  if (!messagesCache) {
    messagesCache = await getMessages();
  }

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => mountPrompt(), { once: true });
    return;
  }

  const container = document.createElement('div');
  container.id = PROMPT_ID;

  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'aiob-video-prompt__bubble';
  bubble.dataset.ignoreClick = 'false';
  bubble.setAttribute('aria-label', messagesCache.videoPromptAction);
  bubble.addEventListener('click', () => {
    if (bubble.dataset.ignoreClick === 'true') {
      bubble.dataset.ignoreClick = 'false';
      return;
    }
    promptSuppressed = true;
    removePrompt();
    void startVideoSession();
  });

  bubble.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    promptSuppressed = true;
    removePrompt();
  });

  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const iconUrl = chrome.runtime.getURL('assets/icons/bannerlogo-48.png');
    bubble.style.setProperty('--aiob-video-prompt-icon', `url("${iconUrl}")`);
  }

  const hint = document.createElement('span');
  hint.className = 'aiob-video-prompt__hint';
  hint.textContent = messagesCache.videoPromptTitle;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'aiob-video-prompt__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Dismiss video prompt');
  closeBtn.addEventListener('click', () => {
    promptSuppressed = true;
    removePrompt();
  });

  container.append(bubble, hint, closeBtn);

  document.body.appendChild(container);
  promptElement = container;
  applyStoredPosition(container);
  updateDebugPosition();

  type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
    moved: boolean;
  };

  let dragState: DragState | null = null;

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const rect = container.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    try {
      bubble.setPointerCapture(event.pointerId);
    } catch {
      // ignore environments that do not support pointer capture
    }
    container.classList.add('aiob-video-prompt--dragging');
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.moved) {
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_ACTIVATE_DISTANCE) {
        return;
      }
      dragState.moved = true;
    }

    event.preventDefault();

    const viewportWidth = window.innerWidth || dragState.width + EDGE_MARGIN * 2;
    const viewportHeight = window.innerHeight || dragState.height + EDGE_MARGIN * 2;
    const { left: tentativeLeft, top: tentativeTop } = computeTentativePosition({
      originLeft: dragState.originLeft,
      originTop: dragState.originTop,
      deltaX: dx,
      deltaY: dy,
      viewportWidth,
      viewportHeight,
      width: dragState.width,
      height: dragState.height
    });

    container.style.left = `${tentativeLeft}px`;
    container.style.top = `${tentativeTop}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';

    const tentativeSide = computeSnapSide(tentativeLeft, dragState.width, viewportWidth);
    applySideClass(container, tentativeSide);
    if (window.__aiobVideoPromptDebug) {
      window.__aiobVideoPromptDebug.elementTop = tentativeTop;
      window.__aiobVideoPromptDebug.side = tentativeSide;
    }
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    if (typeof bubble.hasPointerCapture === 'function' && bubble.hasPointerCapture(event.pointerId)) {
      try {
        bubble.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
    container.classList.remove('aiob-video-prompt--dragging');

    if (dragState.moved) {
      const rect = container.getBoundingClientRect();
      const viewportWidth = window.innerWidth || rect.width + EDGE_MARGIN * 2;
      const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
      const side = computeSnapSide(rect.left, rect.width, viewportWidth);

      promptHasCustomPosition = true;
      promptCurrentTop = clamp(
        rect.top,
        EDGE_MARGIN,
        Math.max(EDGE_MARGIN, viewportHeight - rect.height - EDGE_MARGIN)
      );

      setPromptSide(side, container);
      if (side === 'left') {
        container.style.left = `${EDGE_MARGIN}px`;
        container.style.right = 'auto';
      } else {
        container.style.right = `${EDGE_MARGIN}px`;
        container.style.left = 'auto';
      }
      container.style.top = `${promptCurrentTop}px`;
      container.style.bottom = 'auto';

      bubble.dataset.ignoreClick = 'true';
      window.setTimeout(() => {
        if (bubble.dataset.ignoreClick === 'true') {
          bubble.dataset.ignoreClick = 'false';
        }
      }, 0);
      updateDebugPosition();
    } else {
      applyStoredPosition(container);
      updateDebugPosition();
    }

    dragState = null;
  };

  bubble.addEventListener('pointerdown', handlePointerDown);
  bubble.addEventListener('pointermove', handlePointerMove);
  bubble.addEventListener('pointerup', handlePointerUp);
  bubble.addEventListener('pointercancel', handlePointerUp);
}

async function startVideoSession(): Promise<void> {
  if (sessionStarting || window.__aiobVideoController) {
    return;
  }

  sessionStarting = true;
  try {
    const session = new VideoSession(document);
    await session.start();
    evaluatePrompt(true);
  } catch (error) {
    console.warn('[VideoPrompt] Failed to start video session:', error);
    window.__aiobVideoActive = false;
    window.__aiobVideoController = undefined;
    promptSuppressed = false;
    evaluatePrompt(true);
  } finally {
    sessionStarting = false;
  }
}

function setupStorageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
      return;
    }
    if (changes.options) {
      const newValue = changes.options.newValue;
      const enabled = newValue?.video?.floatingPromptEnabled;
      promptEnabled = enabled !== false;
      evaluatePrompt(true);
    }
  });
}

export async function initVideoPrompt(): Promise<void> {
  if (typeof window === 'undefined' || window !== window.top) {
    return;
  }

  messagesCache = await getMessages();
  await refreshSettings();
  setupStorageListener();
  observeVideoElements();
  if (!resizeListenerRegistered) {
    window.addEventListener('resize', handleWindowResize, { passive: true });
    resizeListenerRegistered = true;
  }
  window.addEventListener('visibilitychange', () => evaluatePrompt(), { passive: true });

  // Poll for URL changes (SPA navigation)
  window.setInterval(() => {
    evaluatePrompt();
  }, 1200);

  evaluatePrompt(true);
}

export const __videoPromptTestUtils = {
  clamp,
  computeTentativePosition,
  computeSnapSide,
  applySideClass,
  setPromptSide,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  DRAG_ACTIVATE_DISTANCE
};
