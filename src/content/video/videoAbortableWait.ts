export interface AbortableVideoScope {
  readonly signal: AbortSignal;
  addCleanup(cleanup: () => void): void;
  dispose(): void;
}

const HIDDEN_VIDEO_READY_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay'] as const;

interface WaitForAbortableVideoConditionArgs {
  eventNames: readonly string[];
  isReady: () => boolean;
  signal: AbortSignal;
  start?: () => boolean;
  timeoutMs: number;
}

class DisposableAbortableVideoScope implements AbortableVideoScope {
  private readonly controller = new AbortController();
  private readonly cleanups = new Set<() => void>();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  addCleanup(cleanup: () => void): void {
    if (this.signal.aborted) {
      cleanup();
      return;
    }

    const disposeCleanup = () => {
      if (!this.cleanups.delete(disposeCleanup)) {
        return;
      }
      cleanup();
    };

    this.cleanups.add(disposeCleanup);
  }

  dispose(): void {
    if (this.signal.aborted) {
      return;
    }

    this.controller.abort();
    for (const cleanup of Array.from(this.cleanups)) {
      cleanup();
    }
  }
}

export function createAbortableVideoScope(): AbortableVideoScope {
  return new DisposableAbortableVideoScope();
}

export function waitForAbortableVideoCondition(
  video: HTMLVideoElement,
  { eventNames, isReady, signal, start, timeoutMs }: WaitForAbortableVideoConditionArgs
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }
  if (isReady()) {
    return Promise.resolve(true);
  }

  const view = video.ownerDocument.defaultView ?? window;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timerId: number | null = null;

    const cleanup = () => {
      if (timerId !== null) {
        view.clearTimeout(timerId);
        timerId = null;
      }
      signal.removeEventListener('abort', handleAbort);
      for (const eventName of eventNames) {
        video.removeEventListener(eventName, handleEvent, true);
      }
    };

    const done = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleAbort = () => done(false);
    const handleEvent = () => {
      if (isReady()) {
        done(true);
      }
    };

    timerId = view.setTimeout(() => done(false), timeoutMs);
    signal.addEventListener('abort', handleAbort, { once: true });

    for (const eventName of eventNames) {
      video.addEventListener(eventName, handleEvent, true);
    }

    if (start?.() === false) {
      done(false);
      return;
    }

    handleEvent();
  });
}

export function configureHiddenDuplicateVideo(
  duplicateVideo: HTMLVideoElement,
  sourceVideo: HTMLVideoElement,
  sourceUrl: string
): void {
  Object.assign(duplicateVideo, {
    preload: 'auto',
    muted: true,
    defaultMuted: true,
    playsInline: true,
    tabIndex: -1
  });
  duplicateVideo.setAttribute('playsinline', 'true');
  duplicateVideo.setAttribute('aria-hidden', 'true');
  Object.assign(duplicateVideo.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none'
  });
  if (sourceVideo.crossOrigin) {
    duplicateVideo.crossOrigin = sourceVideo.crossOrigin;
  }
  duplicateVideo.src = sourceUrl;
}

export function resolveDuplicableVideoSource(
  video: HTMLVideoElement,
  baseUrl: string
): string | null {
  const candidate = (video.currentSrc || video.getAttribute('src') || video.src || '').trim();
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function waitForUsableVideoFrame(
  video: HTMLVideoElement,
  timeoutMs: number,
  signal: AbortSignal
): Promise<boolean> {
  return waitForAbortableVideoCondition(video, {
    eventNames: HIDDEN_VIDEO_READY_EVENTS,
    isReady: () => hasUsableVideoFrame(video),
    signal,
    timeoutMs
  });
}

export function seekHiddenVideo(
  video: HTMLVideoElement,
  timeSec: number,
  timeoutMs: number,
  signal: AbortSignal
): Promise<boolean> {
  const targetTime = normalizeVideoTime(timeSec);
  if (!Number.isFinite(targetTime) || targetTime < 0) {
    return Promise.resolve(false);
  }
  if (approximatelyEqual(video.currentTime, targetTime, 0.001)) {
    return Promise.resolve(true);
  }

  return waitForAbortableVideoCondition(video, {
    eventNames: ['seeked'],
    isReady: () => approximatelyEqual(video.currentTime, targetTime, 0.001),
    signal,
    start: () => {
      try {
        video.currentTime = targetTime;
        return true;
      } catch {
        return false;
      }
    },
    timeoutMs
  });
}

function hasUsableVideoFrame(video: HTMLVideoElement): boolean {
  return (
    Math.floor(video.videoWidth || video.clientWidth || 0) > 0 &&
    Math.floor(video.videoHeight || video.clientHeight || 0) > 0
  );
}

function normalizeVideoTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function approximatelyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(normalizeVideoTime(left) - normalizeVideoTime(right)) <= tolerance;
}
