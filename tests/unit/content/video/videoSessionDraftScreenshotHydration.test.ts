/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { scheduleRestoredVideoDraftScreenshotHydration } from '@content/video/videoSessionDraftScreenshotHydration';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';
import {
  createVideoScreenshotCacheStorageKey,
  type VideoScreenshotCacheRef
} from '@content/video/videoScreenshotCacheTypes';

function createScreenshot(timeSec: number): VideoCaptureScreenshot {
  const blob = new Blob([`frame-${timeSec}`], { type: 'image/jpeg' });
  return {
    id: `shot-${timeSec}`,
    fileName: `shot-${timeSec}.jpg`,
    mimeType: 'image/jpeg',
    capturedAt: timeSec,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  } as unknown as VideoCaptureScreenshot;
}

function createScreenshotRef(): VideoScreenshotCacheRef {
  return {
    schemaVersion: 1,
    pageKey: 'video-page',
    captureId: 'ts-1',
    id: 'shot-42',
    key: createVideoScreenshotCacheStorageKey({
      pageKey: 'video-page',
      captureId: 'ts-1',
      screenshotId: 'shot-42'
    }),
    fileName: 'shot-42.jpg',
    mimeType: 'image/jpeg',
    byteLength: 8,
    capturedAt: 42,
    expiresAt: 1042
  };
}

function createRestoredCapture(): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id: 'ts-1',
    timeSec: 42,
    url: 'https://video.example/watch?t=42',
    comment: '',
    createdAt: 42,
    screenshotRequested: true,
    screenshotRef: createScreenshotRef()
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork(turns = 8): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

describe('videoSessionDraftScreenshotHydration', () => {
  it('still reports settled for stale hydration runs so callers can release suspension', async () => {
    const capture = createRestoredCapture();
    const deferred = createDeferred<VideoCaptureScreenshot | null>();
    const onStart = vi.fn();
    const onChange = vi.fn();
    const onSettled = vi.fn();
    const scheduleSave = vi.fn().mockResolvedValue(undefined);

    scheduleRestoredVideoDraftScreenshotHydration({
      captures: [capture],
      screenshotCache: {
        load: vi.fn(() => deferred.promise),
        removeMany: vi.fn()
      },
      isCurrent: () => false,
      onScreenshotHydrationStart: onStart,
      onScreenshotHydrationChange: onChange,
      onScreenshotHydrationSettled: onSettled,
      scheduleSave
    });

    deferred.resolve(createScreenshot(42));
    await flushAsyncWork();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith({ isCurrent: false });
  });

  it('reports settled after load failures so pending requests do not stay suspended', async () => {
    const capture = createRestoredCapture();
    const onStart = vi.fn();
    const onChange = vi.fn();
    const onSettled = vi.fn();
    const scheduleSave = vi.fn().mockResolvedValue(undefined);

    scheduleRestoredVideoDraftScreenshotHydration({
      captures: [capture],
      screenshotCache: {
        load: vi.fn().mockRejectedValue(new Error('cache load failed')),
        removeMany: vi.fn()
      },
      isCurrent: () => true,
      onScreenshotHydrationStart: onStart,
      onScreenshotHydrationChange: onChange,
      onScreenshotHydrationSettled: onSettled,
      scheduleSave
    });

    await flushAsyncWork();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith({ isCurrent: true });
    expect(capture.screenshot).toBeUndefined();
  });
});
