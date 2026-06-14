/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoScreenshotPreparationQueue } from '@content/video/videoScreenshotPreparationQueue';
import { VideoScreenshotPreparationRequestStore } from '@content/video/videoScreenshotPreparationRequestStore';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';

function createTimestampCapture(
  id: string,
  timeSec: number
): VideoTimestampCapture & { screenshotRequested: true } {
  return {
    kind: 'timestamp',
    id,
    timeSec,
    url: `https://video.example/watch?t=${timeSec}`,
    comment: '',
    createdAt: timeSec,
    screenshotRequested: true
  };
}

function createScreenshot(timeSec: number): VideoCaptureScreenshot {
  const blob = new Blob([`frame-${timeSec}`], { type: 'image/jpeg' });
  return {
    id: `shot-${timeSec}`,
    fileName: `file-${timeSec}.jpg`,
    mimeType: 'image/jpeg',
    capturedAt: timeSec,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  } as unknown as VideoCaptureScreenshot;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

type QueueStateSnapshot = {
  trackedCaptureIds: string[];
  visibleAttemptedIds: string[];
  inFlightVisibleIds: string[];
  hiddenDuplicateAttemptIds: string[];
};

function createQueueStateRecorder(stateSnapshots: QueueStateSnapshot[]): Record<string, unknown> {
  return {
    __testHooks: {
      onStateChange: (snapshot: QueueStateSnapshot) => {
        stateSnapshots.push(snapshot);
      }
    }
  };
}

function expectQueueStateToBeEmpty(snapshot: QueueStateSnapshot | undefined): void {
  expect(snapshot).toEqual({
    trackedCaptureIds: [],
    visibleAttemptedIds: [],
    inFlightVisibleIds: [],
    hiddenDuplicateAttemptIds: []
  });
}

function expectQueueStateToKeepTrackedOnly(
  snapshot: QueueStateSnapshot | undefined,
  captureIds: string[]
): void {
  expect(snapshot).toEqual({
    trackedCaptureIds: captureIds,
    visibleAttemptedIds: [],
    inFlightVisibleIds: [],
    hiddenDuplicateAttemptIds: []
  });
}

function trackEventListeners(target: EventTarget) {
  const activeListenerCounts = new Map<string, number>();
  const addEventListener = target.addEventListener.bind(target);
  const removeEventListener = target.removeEventListener.bind(target);
  const addSpy = vi.spyOn(target, 'addEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ) => {
    activeListenerCounts.set(type, (activeListenerCounts.get(type) ?? 0) + 1);
    addEventListener(type, listener, options);
  }) as EventTarget['addEventListener']);
  const removeSpy = vi.spyOn(target, 'removeEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ) => {
    activeListenerCounts.set(type, Math.max(0, (activeListenerCounts.get(type) ?? 0) - 1));
    removeEventListener(type, listener, options);
  }) as EventTarget['removeEventListener']);
  return {
    addSpy,
    removeSpy,
    getActiveCount: (eventName: string) => activeListenerCounts.get(eventName) ?? 0,
    getTotalActiveCount: () =>
      Array.from(activeListenerCounts.values()).reduce((total, count) => total + count, 0),
    restore: () => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  };
}

function createVideoHarness(
  options: {
    currentTime?: number;
    paused?: boolean;
    readyState?: number;
    videoWidth?: number;
    videoHeight?: number;
    sourceUrl?: string;
  } = {}
) {
  const video = document.createElement('video');
  let currentTime = options.currentTime ?? 0;
  let paused = options.paused ?? true;
  let readyState = options.readyState ?? 4;
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
  Object.defineProperty(video, 'paused', {
    get: () => paused,
    configurable: true
  });
  Object.defineProperty(video, 'readyState', {
    get: () => readyState,
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
    setNaturalTime: (value: number, eventName: 'timeupdate' | 'seeked' = 'timeupdate') => {
      currentTime = value;
      video.dispatchEvent(new Event(eventName));
    },
    setReadyState: (value: number) => {
      readyState = value;
    },
    setDimensions: (width: number, height: number) => {
      videoWidth = width;
      videoHeight = height;
    },
    setPaused: (value: boolean) => {
      paused = value;
    }
  };
}

async function flushAsyncWork(turns = 12): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

describe('videoScreenshotPreparationQueue', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('returns false for missing ids when checking hidden duplicate attempts', () => {
    const store = new VideoScreenshotPreparationRequestStore();

    expect(store.hasHiddenAttempt('missing-id')).toBe(false);
  });

  it('captures immediately when the visible video is already near the requested time without writing currentTime', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({ currentTime: 42.1 });
    const captureFrame = vi.fn((video: HTMLVideoElement, timeSec: number) => {
      expect(video).toBe(visible.video);
      return Promise.resolve(createScreenshot(timeSec));
    });
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      syncPanel,
      toleranceSec: 0.25
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captures[0]?.screenshotRequested).toBe(true);
    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(captures[0]?.screenshot?.content?.byteLength).toEqual(expect.any(Number));
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('prepares an unrequested timestamp screenshot without enabling export intent', async () => {
    const captures: VideoTimestampCapture[] = [
      {
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 42,
        url: 'https://video.example/watch?t=42',
        comment: '',
        createdAt: 1
      }
    ];
    const visible = createVideoHarness({
      currentTime: 42,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const captureFrame = vi.fn((_video: HTMLVideoElement, timeSec: number) =>
      Promise.resolve(createScreenshot(timeSec))
    );
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      syncPanel
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledWith(visible.video, 42);
    expect(captures[0]?.screenshot).toMatchObject({ id: 'shot-42' });
    expect(captures[0]).not.toHaveProperty('screenshotRequested');
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('uses a hidden duplicate video for safe URL sources and removes it after capture', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const captureFrame = vi.fn((video: HTMLVideoElement, timeSec: number) => {
      expect(video).toBe(hidden.video);
      return createScreenshot(timeSec);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      syncPanel: vi.fn()
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(hidden.currentTimeSetSpy).toHaveBeenCalledWith(42);
    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(captures[0]?.screenshot?.content?.byteLength).toEqual(expect.any(Number));
    expect(document.body.contains(hidden.video)).toBe(false);

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('skips duplicate-video preparation for blob sources without touching visible currentTime', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const createElementSpy = vi.spyOn(document, 'createElement');
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn(() => createScreenshot(42)),
      syncPanel: vi.fn()
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(
      createElementSpy.mock.calls.filter(([tagName]) => String(tagName).toLowerCase() === 'video')
    ).toHaveLength(0);
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captures[0]).toMatchObject({ screenshotRequested: true });
    expect(captures[0]?.screenshot).toBeUndefined();

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('uses a visible-tab frame fallback for blob sources when visible canvas capture fails', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 42,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const captureFrame = vi.fn(() => Promise.resolve(null));
    const captureVisibleFrame = vi.fn((_video: HTMLVideoElement, timeSec: number) =>
      Promise.resolve(createScreenshot(timeSec))
    );
    const createElementSpy = vi.spyOn(document, 'createElement');
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      captureVisibleFrame,
      syncPanel
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledWith(visible.video, 42);
    expect(captureVisibleFrame).toHaveBeenCalledWith(visible.video, 42);
    expect(
      createElementSpy.mock.calls.filter(([tagName]) => String(tagName).toLowerCase() === 'video')
    ).toHaveLength(0);
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('uses a visible frame for an explicit blob-source request after slight playback drift', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 43.2,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const captureFrame = vi.fn((_video: HTMLVideoElement, timeSec: number) =>
      Promise.resolve(createScreenshot(timeSec))
    );
    const captureVisibleFrame = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      captureVisibleFrame,
      syncPanel,
      toleranceSec: 0.25
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledWith(visible.video, 42);
    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(
      createElementSpy.mock.calls.filter(([tagName]) => String(tagName).toLowerCase() === 'video')
    ).toHaveLength(0);
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('captures from natural playback when the visible video later reaches the requested time', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const captureFrame = vi.fn((_video: HTMLVideoElement, timeSec: number) =>
      Promise.resolve(createScreenshot(timeSec))
    );
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      syncPanel
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();
    expect(captures[0]?.screenshot).toBeUndefined();

    visible.setNaturalTime(42, 'timeupdate');
    await flushAsyncWork();

    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(captures[0]?.screenshot?.content?.byteLength).toEqual(expect.any(Number));
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('keeps screenshot intent when preparation fails and still removes hidden duplicates', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn(() => null),
      syncPanel: vi.fn()
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(hidden.currentTimeSetSpy).toHaveBeenCalledWith(42);
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(captures[0]).toMatchObject({ screenshotRequested: true });
    expect(captures[0]?.screenshot).toBeUndefined();
    expect(document.body.contains(hidden.video)).toBe(false);

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('cleans hidden duplicate wait listeners and timers after a successful readiness event', async () => {
    vi.useFakeTimers();
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const listenerTracker = trackEventListeners(hidden.video);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((_video: HTMLVideoElement, timeSec: number) => createScreenshot(timeSec)),
      syncPanel: vi.fn(),
      timeoutMs: 1_000
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(listenerTracker.getTotalActiveCount()).toBe(HIDDEN_WAIT_EVENT_COUNT);

    hidden.setDimensions(640, 360);
    hidden.video.dispatchEvent(new Event('loadeddata'));
    await flushAsyncWork();

    expect(captures[0]?.screenshot?.id).toBe('shot-42');
    expect(captures[0]?.screenshot?.content?.kind).toBe('blob');
    expect(captures[0]?.screenshot?.content?.byteLength).toEqual(expect.any(Number));
    expect(listenerTracker.getTotalActiveCount()).toBe(0);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    queue.dispose();
    listenerTracker.restore();
    clearTimeoutSpy.mockRestore();
    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cleans hidden duplicate wait listeners and timers after timeout', async () => {
    vi.useFakeTimers();
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const listenerTracker = trackEventListeners(hidden.video);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const stateSnapshots: QueueStateSnapshot[] = [];
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((_video: HTMLVideoElement, timeSec: number) => createScreenshot(timeSec)),
      syncPanel: vi.fn(),
      timeoutMs: 100,
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(listenerTracker.getTotalActiveCount()).toBe(HIDDEN_WAIT_EVENT_COUNT);
    expect(
      stateSnapshots.some((snapshot) => snapshot.hiddenDuplicateAttemptIds.includes('ts-1'))
    ).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    await flushAsyncWork();

    expect(captures[0]?.screenshot).toBeUndefined();
    expect(document.body.contains(hidden.video)).toBe(false);
    expect(listenerTracker.getTotalActiveCount()).toBe(0);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expectQueueStateToKeepTrackedOnly(stateSnapshots.at(-1), ['ts-1']);

    queue.dispose();
    listenerTracker.restore();
    clearTimeoutSpy.mockRestore();
    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cleans hidden duplicate state when hidden seek setup fails', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const stateSnapshots: QueueStateSnapshot[] = [];
    Object.defineProperty(hidden.video, 'currentTime', {
      get: () => 0,
      set: () => {
        throw new DOMException('seek failed');
      },
      configurable: true
    });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((_video: HTMLVideoElement, timeSec: number) => createScreenshot(timeSec)),
      syncPanel: vi.fn(),
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(
      stateSnapshots.some((snapshot) => snapshot.hiddenDuplicateAttemptIds.includes('ts-1'))
    ).toBe(true);
    expect(document.body.contains(hidden.video)).toBe(false);
    expect(captures[0]?.screenshot).toBeUndefined();
    expectQueueStateToKeepTrackedOnly(stateSnapshots.at(-1), ['ts-1']);

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('retries a pending visible screenshot against the replacement visible video without extra playback events', async () => {
    const capture = createTimestampCapture('ts-1', 42);
    const captures = [capture];
    const visible = createVideoHarness({ currentTime: 42 });
    const replacement = createVideoHarness({ currentTime: 42 });
    const deferred = createDeferred<VideoCaptureScreenshot | null>();
    const syncPanel = vi.fn();
    let currentVisible: HTMLVideoElement | null = visible.video;
    const replacementScreenshot = {
      ...createScreenshot(42),
      id: 'shot-replacement'
    };
    const captureFrame = vi.fn((video: HTMLVideoElement) => {
      if (video === visible.video) {
        return deferred.promise;
      }
      if (video === replacement.video) {
        return Promise.resolve(replacementScreenshot);
      }
      throw new Error('unexpected video for visible capture retry');
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => currentVisible,
      captureFrame,
      syncPanel
    });

    document.body.append(visible.video);
    document.body.append(replacement.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();
    expect(captureFrame).toHaveBeenCalledTimes(1);

    currentVisible = replacement.video;
    queue.handleVideoElementChange(replacement.video);
    await flushAsyncWork();
    expect(captureFrame).toHaveBeenCalledTimes(1);
    deferred.resolve(createScreenshot(42));
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledTimes(2);
    expect(captureFrame).toHaveBeenNthCalledWith(2, replacement.video, 42);
    expect(capture.screenshotRequested).toBe(true);
    expect(capture.screenshot?.id).toBe('shot-replacement');
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(replacement.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('does not apply an async hidden-duplicate screenshot after the capture is removed and the queue is disposed', async () => {
    const capture = createTimestampCapture('ts-1', 42);
    const captures = [capture];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const deferred = createDeferred<VideoCaptureScreenshot | null>();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const syncPanel = vi.fn();
    const captureFrame = vi.fn(() => deferred.promise);
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame,
      syncPanel
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(captureFrame).toHaveBeenCalledWith(hidden.video, 42);

    captures.splice(0, 1);
    queue.dispose();
    deferred.resolve(createScreenshot(42));
    await flushAsyncWork();

    expect(capture).toMatchObject({ screenshotRequested: true });
    expect(capture.screenshot).toBeUndefined();
    expect(syncPanel).not.toHaveBeenCalled();
    expect(document.body.contains(hidden.video)).toBe(false);

    createElementSpy.mockRestore();
  });

  it('clears tracked, hidden, and visible in-flight state when stale captures are pruned', async () => {
    const visibleCapture = createTimestampCapture('visible-1', 42);
    const hiddenCapture = createTimestampCapture('hidden-1', 99);
    const captures = [visibleCapture, hiddenCapture];
    const visible = createVideoHarness({
      currentTime: 42,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const visibleDeferred = createDeferred<VideoCaptureScreenshot | null>();
    const hiddenDeferred = createDeferred<VideoCaptureScreenshot | null>();
    const stateSnapshots: QueueStateSnapshot[] = [];
    const syncPanel = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((video: HTMLVideoElement, timeSec: number) => {
        if (video === visible.video) {
          return visibleDeferred.promise;
        }
        if (video === hidden.video) {
          return hiddenDeferred.promise;
        }
        throw new Error(`unexpected capture target at ${timeSec}`);
      }),
      syncPanel,
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.requestAll();
    await flushAsyncWork();

    expect(
      stateSnapshots.some((snapshot) => snapshot.inFlightVisibleIds.includes('visible-1'))
    ).toBe(true);
    expect(
      stateSnapshots.some((snapshot) => snapshot.hiddenDuplicateAttemptIds.includes('hidden-1'))
    ).toBe(true);
    expect(document.body.contains(hidden.video)).toBe(true);

    captures.splice(0, captures.length);
    queue.requestAll();
    await flushAsyncWork();

    expect(document.body.contains(hidden.video)).toBe(false);
    expectQueueStateToBeEmpty(stateSnapshots.at(-1));

    visibleDeferred.resolve(createScreenshot(42));
    hiddenDeferred.resolve(createScreenshot(99));
    await flushAsyncWork();

    expect(syncPanel).not.toHaveBeenCalled();

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('does not sync the panel when a visible capture resolves after dispose', async () => {
    const capture = createTimestampCapture('ts-1', 42);
    const captures = [capture];
    const visible = createVideoHarness({ currentTime: 42 });
    const deferred = createDeferred<VideoCaptureScreenshot | null>();
    const syncPanel = vi.fn();
    const stateSnapshots: QueueStateSnapshot[] = [];
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn(() => deferred.promise),
      syncPanel,
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(stateSnapshots.some((snapshot) => snapshot.inFlightVisibleIds.includes('ts-1'))).toBe(
      true
    );

    queue.dispose();
    deferred.resolve(createScreenshot(42));
    await flushAsyncWork();

    expect(syncPanel).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();
    expectQueueStateToBeEmpty(stateSnapshots.at(-1));
  });

  it('aborts a pending hidden duplicate immediately on dispose and cleans wait listeners before timeout', async () => {
    vi.useFakeTimers();
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const listenerTracker = trackEventListeners(hidden.video);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((_video: HTMLVideoElement, timeSec: number) => createScreenshot(timeSec)),
      syncPanel: vi.fn(),
      timeoutMs: 1_000
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(document.body.contains(hidden.video)).toBe(true);
    expect(listenerTracker.getTotalActiveCount()).toBe(HIDDEN_WAIT_EVENT_COUNT);

    queue.dispose();
    await flushAsyncWork();

    expect(document.body.contains(hidden.video)).toBe(false);
    expect(listenerTracker.getTotalActiveCount()).toBe(0);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    await flushAsyncWork();

    expect(captures[0]?.screenshot).toBeUndefined();

    listenerTracker.restore();
    clearTimeoutSpy.mockRestore();
    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('aborts hidden duplicate work from the old visible video before it can write a screenshot', async () => {
    const capture = createTimestampCapture('ts-1', 42);
    const captures = [capture];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const replacement = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const deferred = createDeferred<VideoCaptureScreenshot | null>();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    let currentVisible: HTMLVideoElement | null = visible.video;
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => currentVisible,
      captureFrame: vi.fn((video: HTMLVideoElement) => {
        if (video === hidden.video) {
          return deferred.promise;
        }
        throw new Error('unexpected capture target');
      }),
      syncPanel
    });

    document.body.append(visible.video);
    document.body.append(replacement.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(document.body.contains(hidden.video)).toBe(true);

    currentVisible = replacement.video;
    queue.handleVideoElementChange(replacement.video);
    await flushAsyncWork();

    expect(document.body.contains(hidden.video)).toBe(false);

    deferred.resolve(createScreenshot(42));
    await flushAsyncWork();

    expect(capture).toMatchObject({ screenshotRequested: true });
    expect(capture.screenshot).toBeUndefined();
    expect(syncPanel).not.toHaveBeenCalled();
    expect(visible.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(replacement.currentTimeSetSpy).not.toHaveBeenCalled();

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('does not let a late hidden duplicate overwrite a visible screenshot that already succeeded', async () => {
    const capture = createTimestampCapture('ts-1', 42);
    const captures = [capture];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({
      currentTime: 0,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hiddenDeferred = createDeferred<VideoCaptureScreenshot | null>();
    const visibleScreenshot = {
      ...createScreenshot(42),
      id: 'visible-shot'
    };
    const hiddenScreenshot = {
      ...createScreenshot(42),
      id: 'hidden-shot'
    };
    const stateSnapshots: QueueStateSnapshot[] = [];
    const syncPanel = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        return hidden.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((video: HTMLVideoElement) => {
        if (video === hidden.video) {
          return hiddenDeferred.promise;
        }
        if (video === visible.video) {
          return Promise.resolve(visibleScreenshot);
        }
        throw new Error('unexpected capture target');
      }),
      syncPanel,
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.request('ts-1');
    await flushAsyncWork();

    expect(
      stateSnapshots.some((snapshot) => snapshot.hiddenDuplicateAttemptIds.includes('ts-1'))
    ).toBe(true);
    visible.setNaturalTime(42, 'timeupdate');
    await flushAsyncWork();

    expect(capture.screenshot?.id).toBe('visible-shot');

    hiddenDeferred.resolve(hiddenScreenshot);
    await flushAsyncWork();

    expect(capture.screenshot?.id).toBe('visible-shot');
    expect(syncPanel).toHaveBeenCalledTimes(1);
    expectQueueStateToBeEmpty(stateSnapshots.at(-1));

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('caps hidden duplicate preparation at two concurrent attempts and starts the next capture after one finishes', async () => {
    const captures = [
      createTimestampCapture('ts-1', 41),
      createTimestampCapture('ts-2', 42),
      createTimestampCapture('ts-3', 43)
    ];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hiddenVideos = [
      createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' }),
      createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' }),
      createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' })
    ];
    const hiddenDeferreds = [
      createDeferred<VideoCaptureScreenshot | null>(),
      createDeferred<VideoCaptureScreenshot | null>(),
      createDeferred<VideoCaptureScreenshot | null>()
    ];
    const stateSnapshots: QueueStateSnapshot[] = [];
    const onScreenshotPrepared = vi.fn();
    let hiddenIndex = 0;
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        const harness = hiddenVideos.at(hiddenIndex);
        hiddenIndex += 1;
        if (!harness) {
          throw new Error('unexpected extra hidden duplicate video');
        }
        return harness.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((video: HTMLVideoElement) => {
        const index = hiddenVideos.findIndex((harness) => harness.video === video);
        if (index === -1) {
          throw new Error('unexpected capture target');
        }
        return hiddenDeferreds[index]!.promise;
      }),
      syncPanel: vi.fn(),
      maxHiddenDuplicateConcurrency: 2,
      onScreenshotPrepared,
      ...createQueueStateRecorder(stateSnapshots)
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.requestAll();
    await flushAsyncWork();

    expect(hiddenVideos[0]?.currentTimeSetSpy).toHaveBeenCalledWith(41);
    expect(hiddenVideos[1]?.currentTimeSetSpy).toHaveBeenCalledWith(42);
    expect(hiddenVideos[2]?.currentTimeSetSpy).not.toHaveBeenCalled();
    expect(stateSnapshots.at(-1)?.hiddenDuplicateAttemptIds).toEqual(['ts-1', 'ts-2']);
    expect(stateSnapshots.every((snapshot) => snapshot.hiddenDuplicateAttemptIds.length <= 2)).toBe(
      true
    );

    hiddenDeferreds[0]?.resolve(createScreenshot(41));
    await flushAsyncWork();

    expect(onScreenshotPrepared).toHaveBeenCalledWith(
      captures[0],
      captures[0]?.screenshot,
      'hidden-duplicate'
    );
    expect(hiddenVideos[2]?.currentTimeSetSpy).toHaveBeenCalledWith(43);
    expect(captures[0]?.screenshot?.id).toBe('shot-41');
    expect(stateSnapshots.at(-1)?.hiddenDuplicateAttemptIds).toEqual(['ts-2', 'ts-3']);

    hiddenDeferreds[1]?.resolve(createScreenshot(42));
    hiddenDeferreds[2]?.resolve(createScreenshot(43));
    await flushAsyncWork();

    expect(captures.map((capture) => capture.screenshot?.id)).toEqual([
      'shot-41',
      'shot-42',
      'shot-43'
    ]);
    expectQueueStateToBeEmpty(stateSnapshots.at(-1));

    queue.dispose();
    createElementSpy.mockRestore();
  });

  it('keeps visible opportunistic capture running while hidden duplicate slots are full', async () => {
    const visibleCapture = createTimestampCapture('visible-1', 42);
    const hiddenCaptureA = createTimestampCapture('hidden-1', 99);
    const hiddenCaptureB = createTimestampCapture('hidden-2', 120);
    const captures = [visibleCapture, hiddenCaptureA, hiddenCaptureB];
    const visible = createVideoHarness({
      currentTime: 42,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hiddenVideos = [
      createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' }),
      createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' })
    ];
    const visibleDeferred = createDeferred<VideoCaptureScreenshot | null>();
    const hiddenDeferreds = [
      createDeferred<VideoCaptureScreenshot | null>(),
      createDeferred<VideoCaptureScreenshot | null>()
    ];
    const onScreenshotPrepared = vi.fn();
    let hiddenIndex = 0;
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'video') {
        const harness = hiddenVideos.at(hiddenIndex);
        hiddenIndex += 1;
        if (!harness) {
          throw new Error('unexpected extra hidden duplicate video');
        }
        return harness.video;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    const syncPanel = vi.fn();
    const queue = createVideoScreenshotPreparationQueue({
      doc: document,
      getCaptures: () => captures,
      getVisibleVideo: () => visible.video,
      captureFrame: vi.fn((video: HTMLVideoElement) => {
        if (video === visible.video) {
          return visibleDeferred.promise;
        }
        const index = hiddenVideos.findIndex((harness) => harness.video === video);
        if (index === -1) {
          throw new Error('unexpected capture target');
        }
        return hiddenDeferreds[index]!.promise;
      }),
      syncPanel,
      maxHiddenDuplicateConcurrency: 2,
      onScreenshotPrepared
    });

    document.body.append(visible.video);
    queue.handleVideoElementChange(visible.video);
    queue.requestAll();
    await flushAsyncWork();

    expect(hiddenVideos[0]?.currentTimeSetSpy).toHaveBeenCalledWith(99);
    expect(hiddenVideos[1]?.currentTimeSetSpy).toHaveBeenCalledWith(120);
    expect(visibleCapture.screenshot).toBeUndefined();
    expect(hiddenCaptureA.screenshot).toBeUndefined();
    expect(hiddenCaptureB.screenshot).toBeUndefined();

    const visibleScreenshot = {
      ...createScreenshot(42),
      id: 'visible-shot'
    };
    visibleDeferred.resolve(visibleScreenshot);
    await flushAsyncWork();

    expect(visibleCapture.screenshot?.id).toBe('visible-shot');
    expect(onScreenshotPrepared).toHaveBeenCalledWith(visibleCapture, visibleScreenshot, 'visible');
    expect(hiddenCaptureA.screenshot).toBeUndefined();
    expect(hiddenCaptureB.screenshot).toBeUndefined();
    expect(syncPanel).toHaveBeenCalledTimes(1);

    hiddenDeferreds[0]?.resolve(createScreenshot(99));
    hiddenDeferreds[1]?.resolve(createScreenshot(120));
    await flushAsyncWork();

    expect(hiddenCaptureA.screenshot?.id).toBe('shot-99');
    expect(hiddenCaptureB.screenshot?.id).toBe('shot-120');

    queue.dispose();
    createElementSpy.mockRestore();
  });
});

const HIDDEN_WAIT_EVENT_COUNT = 3;
