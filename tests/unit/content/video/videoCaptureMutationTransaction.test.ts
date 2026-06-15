import { describe, expect, it, vi } from 'vitest';
import { restErrors } from '@shared/errors';

vi.mock('@content/sessionDrafts', async () => {
  const actual =
    await vi.importActual<typeof import('@content/sessionDrafts')>('@content/sessionDrafts');
  return {
    ...actual,
    runSessionMutationTransaction: vi.fn(actual.runSessionMutationTransaction)
  };
});

import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';
import { runSessionMutationTransaction } from '@content/sessionDrafts';
import {
  createVideoExportFailure,
  resolveVideoFailureCategory,
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
  it('delegates failure-hint handling to the shared session mutation runner', async () => {
    const sharedRun = vi.mocked(runSessionMutationTransaction);
    sharedRun.mockClear();

    const result = await runVideoCaptureMutationTransaction({
      apply: () => ({ id: 'capture-1' }),
      save: async () => 'failure' as const,
      rollback: vi.fn(),
      commit: vi.fn()
    });

    expect(result).toBe(false);
    expect(sharedRun).toHaveBeenCalledTimes(1);
    const delegatedTransaction = sharedRun.mock.calls[0]?.[0];
    expect(delegatedTransaction?.isSaveFailure?.('failure')).toBe(true);
    expect(delegatedTransaction?.isSaveFailure?.('ready')).toBe(false);
  });

  it('rolls back when save returns a failure hint', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const save = vi.fn(() => Promise.resolve('failure' as const));
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
    const save = vi.fn(() => Promise.reject(saveError));
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
    const save = vi.fn(() => Promise.resolve('ready' as const));
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

  it('prefers validated propagated export failure categories', () => {
    const error = createVideoExportFailure('background write failed', 'write');

    expect(resolveVideoFailureCategory(error)).toBe('write');
    expect(Object.keys(error)).not.toContain('failureCategory');
  });

  it('ignores invalid propagated export failure categories', () => {
    const error = new Error('background failed') as Error & { failureCategory: string };
    error.failureCategory = 'private-url-leak';

    expect(resolveVideoFailureCategory(error)).toBe('unknown');
  });

  it('classifies narrow local validation, timeout, and connection failures', () => {
    expect(resolveVideoFailureCategory(new Error('Invalid video export response'))).toBe(
      'validation'
    );
    expect(resolveVideoFailureCategory(new DOMException('timed out', 'AbortError'))).toBe(
      'timeout'
    );
    expect(resolveVideoFailureCategory(new Error('Could not establish connection.'))).toBe(
      'connection'
    );
  });

  it('keeps shared rest export failures classifiable without legacy userMessage text', () => {
    const error = restErrors.requestFailed('Failed to fetch', { endpoint: 'https://api.example' });

    expect(error.userMessage).toBeUndefined();
    expect(error.userMessageDescriptor).toEqual({ key: 'errorRestRequestFailed' });
    expect(resolveVideoFailureCategory(error)).toBe('connection');
  });
});
