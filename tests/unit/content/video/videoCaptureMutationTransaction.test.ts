import { describe, expect, it, vi } from 'vitest';

import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';
import {
  restoreTimestampScreenshotState,
  runVideoCaptureMutationTransaction,
  snapshotTimestampScreenshotState
} from '@content/video/videoCaptureMutationTransaction';

function createTimestampCapture(): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id: 'timestamp-1',
    timeSec: 42,
    url: 'https://video.example/watch?t=42',
    comment: 'note',
    createdAt: 1
  };
}

function createScreenshot(): VideoCaptureScreenshot {
  return {
    id: 'screenshot-1',
    fileName: 'frame-42.jpg',
    mimeType: 'image/jpeg',
    dataUrl: 'data:image/jpeg;base64,frame',
    capturedAt: 123
  };
}

function hasOwnProperty(target: object, key: 'screenshotRequested' | 'screenshot'): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

describe('videoCaptureMutationTransaction', () => {
  it('rolls back when save returns a failure hint', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const save = vi.fn(async () => 'failure' as const);
    const rollback = vi.fn();
    const commit = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
      rollback,
      commit
    });

    expect(result).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(afterApply).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith({ id: 'capture-1' }, { reason: 'failure' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('rolls back when save throws', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const saveError = new Error('boom');
    const save = vi.fn(async () => {
      throw saveError;
    });
    const rollback = vi.fn();
    const commit = vi.fn();
    const onSaveError = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
      rollback,
      commit,
      onSaveError
    });

    expect(result).toBe(false);
    expect(onSaveError).toHaveBeenCalledWith(saveError);
    expect(rollback).toHaveBeenCalledWith(
      { id: 'capture-1' },
      {
        reason: 'error',
        error: saveError
      }
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits after a successful save', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const save = vi.fn(async () => 'ready' as const);
    const rollback = vi.fn();
    const commit = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
      rollback,
      commit
    });

    expect(result).toBe(true);
    expect(commit).toHaveBeenCalledWith({ id: 'capture-1' }, 'ready');
    expect(rollback).not.toHaveBeenCalled();
  });

  it('deletes screenshot own properties that were absent in the snapshot', () => {
    const capture = createTimestampCapture();
    const snapshot = snapshotTimestampScreenshotState(capture);

    capture.screenshotRequested = true;
    capture.screenshot = createScreenshot();

    expect(hasOwnProperty(capture, 'screenshotRequested')).toBe(true);
    expect(hasOwnProperty(capture, 'screenshot')).toBe(true);

    restoreTimestampScreenshotState(capture, snapshot);

    expect(hasOwnProperty(capture, 'screenshotRequested')).toBe(false);
    expect(hasOwnProperty(capture, 'screenshot')).toBe(false);
    expect(capture.screenshotRequested).toBeUndefined();
    expect(capture.screenshot).toBeUndefined();
  });

  it('restores undefined screenshot own properties without dropping property presence', () => {
    const capture = createTimestampCapture();
    Object.defineProperty(capture, 'screenshotRequested', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });
    Object.defineProperty(capture, 'screenshot', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });
    const snapshot = snapshotTimestampScreenshotState(capture);

    capture.screenshotRequested = true;
    capture.screenshot = createScreenshot();

    restoreTimestampScreenshotState(capture, snapshot);

    expect(hasOwnProperty(capture, 'screenshotRequested')).toBe(true);
    expect(hasOwnProperty(capture, 'screenshot')).toBe(true);
    expect(capture.screenshotRequested).toBeUndefined();
    expect(capture.screenshot).toBeUndefined();
  });

  it('restores defined screenshot values from the snapshot', () => {
    const capture = createTimestampCapture();
    const screenshot = createScreenshot();
    capture.screenshotRequested = false;
    capture.screenshot = screenshot;
    const snapshot = snapshotTimestampScreenshotState(capture);

    delete capture.screenshotRequested;
    delete capture.screenshot;

    restoreTimestampScreenshotState(capture, snapshot);

    expect(hasOwnProperty(capture, 'screenshotRequested')).toBe(true);
    expect(hasOwnProperty(capture, 'screenshot')).toBe(true);
    expect(capture.screenshotRequested).toBe(false);
    expect(capture.screenshot).toEqual(screenshot);
  });
});
