/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createVideoScreenshotPreparationQueue } from '@content/video/videoScreenshotPreparationQueue';
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
  return {
    id: `shot-${timeSec}`,
    fileName: `file-${timeSec}.jpg`,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,frame-${timeSec}`,
    capturedAt: timeSec
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

async function flushAsyncWork(turns = 4): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

describe('videoScreenshotPreparationQueue', () => {
  it('captures immediately when the visible video is already near the requested time without writing currentTime', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({ currentTime: 42.1 });
    const captureFrame = vi.fn((video: HTMLVideoElement, timeSec: number) => {
      expect(video).toBe(visible.video);
      return createScreenshot(timeSec);
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
    expect(captures[0]).toMatchObject({
      screenshotRequested: true,
      screenshot: expect.objectContaining({ id: 'shot-42' })
    });
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('uses a hidden duplicate video for safe URL sources and removes it after capture', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' });
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
    expect(captures[0]?.screenshot).toMatchObject({ id: 'shot-42' });
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

  it('captures from natural playback when the visible video later reaches the requested time', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'blob:https://video.example/runtime'
    });
    const captureFrame = vi.fn((_video: HTMLVideoElement, timeSec: number) =>
      createScreenshot(timeSec)
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
    expect(captures[0]?.screenshot).toMatchObject({ id: 'shot-42' });
    expect(syncPanel).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('keeps screenshot intent when preparation fails and still removes hidden duplicates', async () => {
    const captures = [createTimestampCapture('ts-1', 42)];
    const visible = createVideoHarness({
      currentTime: 8,
      sourceUrl: 'https://cdn.example/video.mp4'
    });
    const hidden = createVideoHarness({ currentTime: 0, sourceUrl: 'https://cdn.example/video.mp4' });
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
});
