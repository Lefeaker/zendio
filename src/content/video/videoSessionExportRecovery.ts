import { snapshotVideoExportCaptures } from './videoSessionExporter';
import { sessionExportSnapshotId } from '../../shared/sessionDrafts/exportAttempt';
import { buildVideoSessionDraftPayload } from './sessionDrafts';
import { restoreVideoDraftCachedScreenshots } from './videoSessionDraftScreenshotCache';
import type { VideoCapture, VideoTimestampCapture } from './types';
import type { VideoSessionOperationContext } from './videoSessionOperationContext';

type SnapshotContext = Pick<VideoSessionOperationContext, 'state' | 'getExportDestinationMetadata'>;

export function videoExportSnapshotId(context: SnapshotContext): string {
  const destination = context.getExportDestinationMetadata?.();
  return sessionExportSnapshotId(
    buildVideoSessionDraftPayload({
      retentionPolicy: { maxItemsPerPage: null },
      captures: context.state.captures,
      commentDrafts: context.state.commentDrafts,
      platform: context.state.platform,
      videoId: context.state.videoId,
      videoUrl: context.state.videoUrl,
      canonicalUrl: context.state.canonicalUrl,
      videoTitle: context.state.videoTitle,
      ...(destination ? { destination } : {})
    })
  );
}

export function canContinueVideoExport(context: SnapshotContext): boolean {
  const { exportAttempt, frozenExportPayload } = context.state;
  return Boolean(
    frozenExportPayload ||
    (exportAttempt?.rebuild === 'video-v1' &&
      exportAttempt.snapshotId === videoExportSnapshotId(context))
  );
}

/** Reuse original cache refs; a new frame is never a replacement for the exported bytes. */
export async function prepareVideoRecoveryCaptures(
  context: SnapshotContext & {
    dependencies: Pick<VideoSessionOperationContext['dependencies'], 'screenshotCacheRepository'>;
  }
): Promise<VideoCapture[]> {
  const captures = snapshotVideoExportCaptures(context.state.captures);
  const requested = captures.filter(
    (capture): capture is VideoTimestampCapture =>
      capture.kind === 'timestamp' && capture.screenshotRequested === true
  );
  await restoreVideoDraftCachedScreenshots(
    requested.filter((capture) => !capture.screenshot),
    context.dependencies.screenshotCacheRepository
  );
  if (requested.some((capture) => !capture.screenshot) || !canContinueVideoExport(context))
    throw new Error('CLIP_EXPORT_SNAPSHOT_UNAVAILABLE');
  return captures;
}
