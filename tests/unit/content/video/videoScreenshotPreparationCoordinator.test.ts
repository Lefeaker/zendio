/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { VideoScreenshotPreparationCoordinator } from '@content/video/videoScreenshotPreparationCoordinator';
import {
  VideoScreenshotPreparationQueueOwner,
  type VideoScreenshotPreparationQueuePort
} from '@content/video/videoScreenshotPreparationQueueOwner';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';

function createTimestampCapture(
  id: string,
  timeSec: number,
  screenshot: VideoCaptureScreenshot
): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id,
    timeSec,
    url: `https://video.example/watch?t=${timeSec}`,
    comment: '',
    createdAt: timeSec,
    screenshotRequested: true,
    screenshot
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

function createPendingTimestampCapture(id: string, timeSec: number): VideoTimestampCapture {
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

function createVisibleVideo(currentTime = 42): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: () => undefined,
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
  return video;
}

async function flushAsyncWork(turns = 8): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function createDeferred<T>() {
  let resolveValue: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolveValue) throw new Error('Deferred promise resolver is unavailable.');
      resolveValue(value);
    }
  };
}

function createQueueHarness() {
  const request = vi.fn();
  const requestAll = vi.fn();
  const handleVideoElementChange = vi.fn();
  const dispose = vi.fn();
  const queue: VideoScreenshotPreparationQueuePort = {
    request,
    requestAll,
    handleVideoElementChange,
    dispose
  };
  return { queue, request, requestAll, handleVideoElementChange, dispose };
}

function createQueueOwnerArgs(
  loadQueueModule: NonNullable<
    ConstructorParameters<typeof VideoScreenshotPreparationQueueOwner>[0]['loadQueueModule']
  >
) {
  return {
    doc: document,
    getCaptures: () => [],
    getVisibleVideo: () => null,
    syncPanel: vi.fn(),
    loadQueueModule
  };
}

describe('VideoScreenshotPreparationCoordinator', () => {
  it('coalesces concurrent lazy queue creation and disposes the installed queue once', async () => {
    const deferred = createDeferred<{
      createVideoScreenshotPreparationQueue: () => VideoScreenshotPreparationQueuePort;
    }>();
    const queueHarness = createQueueHarness();
    const { queue } = queueHarness;
    const createQueue = vi.fn(() => queue);
    const loadQueueModule = vi.fn(() => deferred.promise);
    const owner = new VideoScreenshotPreparationQueueOwner(createQueueOwnerArgs(loadQueueModule));

    const first = owner.ensureQueue();
    const second = owner.ensureQueue();
    expect(first).toBe(second);
    expect(loadQueueModule).toHaveBeenCalledTimes(1);

    deferred.resolve({ createVideoScreenshotPreparationQueue: createQueue });
    await expect(Promise.all([first, second])).resolves.toEqual([queue, queue]);
    expect(createQueue).toHaveBeenCalledTimes(1);
    expect(queueHarness.handleVideoElementChange).toHaveBeenCalledTimes(1);

    owner.dispose();
    owner.dispose();
    expect(queueHarness.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not create a queue when disposal wins before the lazy module resolves', async () => {
    const deferred = createDeferred<{
      createVideoScreenshotPreparationQueue: () => VideoScreenshotPreparationQueuePort;
    }>();
    const createQueue = vi.fn(() => createQueueHarness().queue);
    const owner = new VideoScreenshotPreparationQueueOwner(
      createQueueOwnerArgs(() => deferred.promise)
    );

    const pending = owner.ensureQueue();
    owner.dispose();
    deferred.resolve({ createVideoScreenshotPreparationQueue: createQueue });

    await expect(pending).resolves.toBeNull();
    expect(createQueue).not.toHaveBeenCalled();
  });

  it('disposes a queue exactly once when factory creation reentrantly invalidates its generation', async () => {
    const queueHarness = createQueueHarness();
    const { queue } = queueHarness;
    let owner: VideoScreenshotPreparationQueueOwner | null = null;
    const createQueue = vi.fn(() => {
      owner?.dispose();
      return queue;
    });
    owner = new VideoScreenshotPreparationQueueOwner(
      createQueueOwnerArgs(() =>
        Promise.resolve({ createVideoScreenshotPreparationQueue: createQueue })
      )
    );

    await expect(owner.ensureQueue()).resolves.toBeNull();
    expect(queueHarness.dispose).toHaveBeenCalledTimes(1);
    expect(queueHarness.handleVideoElementChange).not.toHaveBeenCalled();
    owner.dispose();
    expect(queueHarness.dispose).toHaveBeenCalledTimes(1);
  });

  it('restores same-session cached screenshots without repeating durable write-through', async () => {
    const screenshot = createScreenshot(42);
    const capture = createTimestampCapture('ts-1', 42, screenshot);
    const onScreenshotPrepared = vi.fn();
    const syncPanel = vi.fn();
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => null,
      onScreenshotPrepared,
      syncPanel
    });

    coordinator.cacheRequestedScreenshot(capture.id);
    delete capture.screenshot;
    await coordinator.prepareRequestedScreenshot(capture.id);

    expect(capture.screenshot).toBe(screenshot);
    expect(syncPanel).toHaveBeenCalledTimes(1);
    expect(onScreenshotPrepared).not.toHaveBeenCalled();
  });

  it('requires matching resume calls before suspended pending screenshots can prepare', async () => {
    const capture = createPendingTimestampCapture('ts-1', 42);
    const visibleVideo = createVisibleVideo(42);
    document.body.append(visibleVideo);
    const captureVisibleFrame = vi.fn(() => Promise.resolve(createScreenshot(42)));
    const syncPanel = vi.fn();
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => visibleVideo,
      captureVisibleFrame,
      syncPanel
    });

    coordinator.suspendPendingRequests();
    coordinator.suspendPendingRequests();
    coordinator.handleVideoElementChange(visibleVideo);
    coordinator.requestPendingScreenshots();
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests();
    coordinator.requestPendingScreenshots();
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests();
    coordinator.requestPendingScreenshots();
    await vi.waitFor(() => {
      expect(captureVisibleFrame).toHaveBeenCalledTimes(1);
    });

    expect(capture.screenshot).toMatchObject({ id: 'shot-42' });
    expect(syncPanel).toHaveBeenCalledTimes(1);
  });

  it('runs a deferred pending request after out-of-order restored screenshot hydration settles', async () => {
    const capture = createPendingTimestampCapture('ts-1', 42);
    const visibleVideo = createVisibleVideo(42);
    document.body.append(visibleVideo);
    const captureVisibleFrame = vi.fn(() => Promise.resolve(createScreenshot(42)));
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => visibleVideo,
      captureVisibleFrame,
      syncPanel: vi.fn()
    });

    coordinator.suspendPendingRequests(); // hydration A
    coordinator.suspendPendingRequests(); // hydration B

    coordinator.resumePendingRequests(); // hydration B settles first and is current
    coordinator.requestPendingScreenshots();
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests(); // hydration A settles later and is stale
    await vi.waitFor(() => {
      expect(captureVisibleFrame).toHaveBeenCalledTimes(1);
    });

    expect(capture.screenshot).toMatchObject({ id: 'shot-42' });
  });

  it('runs a deferred video element change request after suspended hydration resumes', async () => {
    const capture = createPendingTimestampCapture('ts-1', 42);
    const visibleVideo = createVisibleVideo(42);
    document.body.append(visibleVideo);
    const captureVisibleFrame = vi.fn(() => Promise.resolve(createScreenshot(42)));
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => visibleVideo,
      captureVisibleFrame,
      syncPanel: vi.fn()
    });

    coordinator.suspendPendingRequests();
    coordinator.handleVideoElementChange(visibleVideo);
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests();
    await vi.waitFor(() => {
      expect(captureVisibleFrame).toHaveBeenCalledTimes(1);
    });

    expect(capture.screenshot).toMatchObject({ id: 'shot-42' });
  });
});
