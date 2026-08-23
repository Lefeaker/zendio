import { bucketCount, type FeatureTimer } from '../../shared/analytics';
import { VIDEO_TITLE_FALLBACK } from '../../i18n/catalog/runtimeFallbackMessages';
import type { SessionDraftPersister } from '../sessionDrafts';
import type {
  SessionDraftEnvelope,
  SessionDraftStatus,
  VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import type { VideoSessionState } from './sessionState';
import type { VideoHintState } from './videoHintManager';
import type { VideoCapture } from './types';
import type { VideoSessionDraftControllerOptions } from './videoSessionRuntimePorts';
import { hasRequestedTimestampScreenshot } from './screenshotIntent';
import { scheduleRestoredVideoDraftScreenshotHydration } from './videoSessionDraftScreenshotHydration';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  type VideoSessionDraftPayloadShape
} from './sessionDrafts';
export type VideoDraftRestoreTelemetryParams = Parameters<
  NonNullable<VideoSessionDraftControllerOptions['trackDraftRestoreEvent']>
>[0];

function countRequestedDraftScreenshots(captures: readonly VideoCapture[]): number {
  return captures.filter(
    (capture): capture is Extract<VideoCapture, { kind: 'timestamp' }> =>
      capture.kind === 'timestamp' &&
      (hasRequestedTimestampScreenshot(capture) ||
        capture.screenshot !== undefined ||
        capture.screenshotRef !== undefined)
  ).length;
}

export function buildVideoDraftRestoreTelemetryParams(args: {
  captures: readonly VideoCapture[];
  outcome: VideoDraftRestoreTelemetryParams['outcome'];
  restoreTimer: FeatureTimer;
  staleRefCount?: number;
}): VideoDraftRestoreTelemetryParams {
  return {
    capture_count_bucket: bucketCount(args.captures.length),
    screenshot_count_bucket: bucketCount(countRequestedDraftScreenshots(args.captures)),
    outcome: args.outcome,
    ...(args.staleRefCount && args.staleRefCount > 0
      ? { stale_screenshot_ref_count_bucket: bucketCount(args.staleRefCount) }
      : {}),
    duration_bucket: args.restoreTimer.durationBucket()
  };
}

export function readVideoDraftRestoreTelemetryCaptures(
  draft: Pick<SessionDraftEnvelope, 'payload'>
): readonly VideoCapture[] {
  const payload = draft.payload as Partial<VideoSessionDraftPayloadShape>;
  return Array.isArray(payload.captures) ? (payload.captures as VideoCapture[]) : [];
}

export function trackVideoDraftRestoreEvent(
  track: VideoSessionDraftControllerOptions['trackDraftRestoreEvent'],
  params: VideoDraftRestoreTelemetryParams
): void {
  if (!track) return;
  void Promise.resolve(track(params)).catch((error) => {
    console.debug('[VideoSession] Failed to send draft restore analytics event:', error);
  });
}

export function scheduleVideoDraftScreenshotHydration(args: {
  captures: VideoCapture[];
  restoreTimer: FeatureTimer;
  options: Pick<
    VideoSessionDraftControllerOptions,
    | 'screenshotCache'
    | 'onScreenshotHydrationStart'
    | 'onScreenshotHydrationChange'
    | 'onScreenshotHydrationSettled'
    | 'trackDraftRestoreEvent'
  >;
  isCurrent: () => boolean;
  scheduleSave: () => Promise<void>;
}): void {
  scheduleRestoredVideoDraftScreenshotHydration({
    captures: args.captures,
    screenshotCache: args.options.screenshotCache,
    isCurrent: args.isCurrent,
    onScreenshotHydrationStart: args.options.onScreenshotHydrationStart,
    onScreenshotHydrationChange: args.options.onScreenshotHydrationChange,
    onScreenshotHydrationSettled: (result) => {
      args.options.onScreenshotHydrationSettled?.(result);
      if (!result.isCurrent) return;
      trackVideoDraftRestoreEvent(
        args.options.trackDraftRestoreEvent,
        buildVideoDraftRestoreTelemetryParams({
          captures: args.captures,
          outcome: result.failedCount > 0 ? 'failed' : 'completed',
          restoreTimer: args.restoreTimer,
          staleRefCount: result.invalidRefCount + result.staleRefCount
        })
      );
    },
    scheduleSave: args.scheduleSave
  });
}

export function buildVideoDraftEnvelopeFromRuntime(
  runtime: Pick<
    VideoSessionDraftControllerOptions,
    'doc' | 'state' | 'destinationState' | 'sessionDraftStoragePolicy'
  >,
  identity: { draftId: string; activePageUrl: string; pendingStatus: SessionDraftStatus },
  options: {
    status?: SessionDraftStatus;
    draftId?: string;
    pageUrl?: string;
    allowEmpty?: boolean;
  } = {}
): VideoSessionDraftEnvelope | null {
  if (
    !options.allowEmpty &&
    runtime.state.captures.length === 0 &&
    Object.keys(runtime.state.commentDrafts).length === 0 &&
    runtime.destinationState.metadata === undefined
  )
    return null;
  const pageUrl = (options.pageUrl ?? identity.activePageUrl) || runtime.doc.location.href;
  const title = runtime.state.videoTitle || runtime.doc.title || VIDEO_TITLE_FALLBACK;
  return createVideoSessionDraftEnvelope({
    draftId: options.draftId ?? identity.draftId,
    pageUrl,
    pageTitle: title,
    updatedAt: Date.now(),
    status: options.status ?? identity.pendingStatus,
    payload: buildVideoSessionDraftPayload({
      captures: runtime.state.captures,
      commentDrafts: runtime.state.commentDrafts,
      ...(runtime.destinationState.metadata
        ? { destination: runtime.destinationState.metadata }
        : {}),
      platform: runtime.state.platform,
      videoId: runtime.state.videoId,
      videoUrl: runtime.state.videoUrl || pageUrl,
      canonicalUrl: runtime.state.canonicalUrl || pageUrl,
      videoTitle: title,
      retentionPolicy: runtime.sessionDraftStoragePolicy?.retentionPolicy
    })
  });
}

interface VideoSessionCommentDraftHydrator {
  setCommentDrafts(drafts: Record<string, string>): void;
}

interface VideoSessionCommentDraftReader {
  readCommentDrafts(): Record<string, string>;
}

export function applyVideoSessionCommentDrafts(
  state: VideoSessionState,
  drafts: Record<string, string>,
  options: {
    hydrateDom?: boolean;
    dom?: VideoSessionCommentDraftHydrator | null;
  } = {}
): void {
  state.commentDrafts = { ...drafts };
  if (options.hydrateDom) {
    options.dom?.setCommentDrafts(state.commentDrafts);
  }
}

export function syncVideoSessionCommentDraftsFromDom(
  state: VideoSessionState,
  dom: VideoSessionCommentDraftReader
): Record<string, string> {
  const drafts = dom.readCommentDrafts();
  applyVideoSessionCommentDrafts(state, drafts);
  return { ...state.commentDrafts };
}

export function bindVideoSessionDraftPersistence(
  view: Window,
  flushDraftNow: () => void
): () => void {
  view.addEventListener('pagehide', flushDraftNow, { passive: true });
  view.addEventListener('beforeunload', flushDraftNow, true);
  return () => {
    view.removeEventListener('pagehide', flushDraftNow);
    view.removeEventListener('beforeunload', flushDraftNow, true);
  };
}

export async function flushVideoSessionDraftNow(options: {
  state: VideoSessionState;
  isCleaningUp: boolean;
  syncCommentDrafts: () => void;
  buildDraftEnvelope: () => VideoSessionDraftEnvelope | null;
  removeDraft: () => Promise<void>;
  draftPersister: SessionDraftPersister;
  persistDraft?: () => Promise<void>;
  clearSupersededDurableSources: () => Promise<void>;
  trackSavingState?: boolean;
  onPostSaveCleanupError?: (error: unknown) => void;
}): Promise<VideoHintState | null> {
  if (!options.isCleaningUp) {
    options.syncCommentDrafts();
  }

  if (!options.buildDraftEnvelope()) {
    if (options.trackSavingState) {
      options.state.saving = true;
    }
    try {
      await options.removeDraft();
    } finally {
      if (options.trackSavingState) {
        options.state.saving = false;
      }
    }
    return options.state.captures.length ? 'ready' : 'noCaptures';
  }

  if (options.trackSavingState) {
    options.state.saving = true;
  }
  try {
    if (options.persistDraft) {
      await options.persistDraft();
    } else {
      const pending = options.draftPersister.scheduleSave();
      try {
        await options.draftPersister.flushNow();
        await pending;
      } catch (error) {
        await pending.catch(() => undefined);
        throw error;
      }
    }
  } finally {
    if (options.trackSavingState) {
      options.state.saving = false;
    }
  }
  try {
    await options.clearSupersededDurableSources();
  } catch (error) {
    options.onPostSaveCleanupError?.(error);
  }
  return options.state.captures.length ? 'ready' : 'noCaptures';
}
