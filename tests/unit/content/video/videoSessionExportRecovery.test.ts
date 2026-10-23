/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import {
  canContinueVideoExport,
  prepareVideoRecoveryCaptures,
  videoExportSnapshotId
} from '@content/video/videoSessionExportRecovery';
import { VideoSessionState } from '@content/video/sessionState';
import { DEFAULT_HIGHLIGHT_THEME } from '@content/video/fragmentHighlighter';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';
import type { VideoScreenshotCacheRef } from '@content/video/videoScreenshotCacheTypes';
import type { VideoScreenshotCacheRepository } from '@content/video/videoScreenshotCacheRepository';

function recoveryContext() {
  const state = new VideoSessionState(DEFAULT_HIGHLIGHT_THEME);
  const ref: VideoScreenshotCacheRef = {
    schemaVersion: 1,
    key: 'aiob.videoScreenshotCache.v1.page.capture.shot',
    pageKey: 'page',
    captureId: 'capture',
    id: 'shot',
    fileName: 'shot.jpg',
    mimeType: 'image/jpeg',
    byteLength: 3,
    capturedAt: 1,
    expiresAt: Date.now() + 60_000
  };
  const capture: VideoTimestampCapture = {
    kind: 'timestamp',
    id: 'capture',
    timeSec: 42,
    url: 'https://example.com/video?t=42',
    comment: 'Retained note',
    createdAt: 1,
    screenshotRequested: true,
    screenshotRef: ref
  };
  state.captures = [capture];
  const screenshot: VideoCaptureScreenshot = {
    id: 'shot',
    fileName: 'shot.jpg',
    mimeType: 'image/jpeg',
    capturedAt: 1,
    content: { kind: 'blob', blob: new Blob(['aaa'], { type: 'image/jpeg' }), byteLength: 3 }
  };
  const cache: VideoScreenshotCacheRepository = {
    save: vi.fn(),
    load: vi.fn(async () => screenshot),
    remove: vi.fn(),
    removeMany: vi.fn(),
    pruneExpired: vi.fn(),
    pruneToLimits: vi.fn()
  };
  const context = { state, dependencies: { screenshotCacheRepository: cache } };
  state.exportAttempt = {
    operationId: 'op_rebuild1',
    snapshotId: videoExportSnapshotId(context),
    outcome: 'unknown',
    startedAt: 1,
    rebuild: 'video-v1',
    attachmentProgress: {
      operationId: 'op_rebuild1',
      planId: 'a'.repeat(64),
      total: 1,
      storageTarget: 'downloads',
      phase: 'attachments',
      confirmed: []
    }
  };
  return { context, cache, screenshot, ref, capture };
}

describe('Video reopened export preparation', () => {
  it('loads original cache bytes on a copy while initial screenshot hydration is still pending', async () => {
    const { context, cache, screenshot, ref } = recoveryContext();
    let resolve!: (value: VideoCaptureScreenshot) => void;
    vi.mocked(cache.load).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const preparing = prepareVideoRecoveryCaptures(context);
    expect(cache.load).toHaveBeenCalledWith(ref);
    expect(canContinueVideoExport(context)).toBe(true);
    resolve(screenshot);
    const captures = await preparing;
    expect(captures[0]).toMatchObject({ screenshot });
    expect(context.state.captures[0]).not.toHaveProperty('screenshot');
    expect(context.state.exportAttempt?.attachmentProgress?.blocked).toBeUndefined();
  });

  it('retains the original refs and confirmations after a cache miss and allows a later explicit retry', async () => {
    const { context, cache, screenshot, ref } = recoveryContext();
    vi.mocked(cache.load).mockResolvedValueOnce(null);
    await expect(prepareVideoRecoveryCaptures(context)).rejects.toThrow(
      'CLIP_EXPORT_SNAPSHOT_UNAVAILABLE'
    );
    expect(context.state.captures[0]).toMatchObject({ screenshotRef: ref });
    expect(context.state.exportAttempt?.attachmentProgress?.blocked).toBeUndefined();
    await expect(prepareVideoRecoveryCaptures(context)).resolves.toMatchObject([{ screenshot }]);
  });

  it.each(['legacy', 'edit', 'destination', 'retention'] as const)(
    'does not offer reconstruction for %s content',
    (change) => {
      const { context, capture } = recoveryContext();
      if (!context.state.exportAttempt) throw new Error('Attempt missing');
      if (change === 'legacy') delete context.state.exportAttempt.rebuild;
      if (change === 'edit') capture.comment = 'Newer note';
      if (change === 'retention') context.state.captures = [];
      const targetContext =
        change === 'destination'
          ? { ...context, getExportDestinationMetadata: () => ({ kind: 'downloads' as const }) }
          : context;
      expect(canContinueVideoExport(targetContext)).toBe(false);
    }
  );

  it('rejects a live edit arriving while the original cache read is pending', async () => {
    const { context, cache, screenshot, capture } = recoveryContext();
    vi.mocked(cache.load).mockImplementation(async () => {
      capture.comment = 'New edit during recovery';
      return screenshot;
    });
    await expect(prepareVideoRecoveryCaptures(context)).rejects.toThrow(
      'CLIP_EXPORT_SNAPSHOT_UNAVAILABLE'
    );
    expect(context.state.captures[0]?.comment).toBe('New edit during recovery');
  });
});
