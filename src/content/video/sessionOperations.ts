import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { bucketCount, createFeatureTimer } from '../../shared/analytics';
import type { AnalyticsSource } from '../../shared/analytics';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionState } from './sessionState';
import type { FragmentHighlighter } from './fragmentHighlighter';
import { clearVideoSession } from '../runtime/contentSessionRegistry';
import { resolveHighlightTheme, DEFAULT_HIGHLIGHT_THEME } from './fragmentHighlighter';
import type { ReaderHighlightTheme, StoredOptions } from '../../shared/types/options';
import { focusFragmentCapture, focusTimestampCapture } from './videoSessionCaptureFocus';
import {
  createVideoTimestampCapture,
  rollbackVideoTimestampCaptureMutation
} from './videoTimestampCaptureTransaction';
import type { VideoSessionOperationContext } from './videoSessionOperationContext';
import {
  emitVideoUsageEvent,
  mapVideoAnalyticsPlatform,
  requestRequestedScreenshotPreparation,
  resolveVideoExportDestination,
  resolveVideoFailureCategory,
  resolveVideoSessionDurationBucket,
  restoreRemovedFragmentHighlight,
  restoreTimestampScreenshotState,
  rollbackVideoSessionFragmentAdd,
  runVideoCaptureMutationTransaction,
  saveVideoSessionCaptures,
  snapshotTimestampScreenshotState
} from './videoCaptureMutationTransaction';
import {
  clearRequestedTimestampScreenshot,
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from './screenshotIntent';

export function beginVideoSessionAnalytics(
  context: VideoSessionOperationContext,
  source: AnalyticsSource = 'unknown'
): void {
  context.state.analyticsTimer = createFeatureTimer();
  emitVideoUsageEvent(context.dependencies, 'video_session_started', {
    platform: mapVideoAnalyticsPlatform(context.state.platform),
    source
  });
}

export async function handleVideoSessionAddCapture(
  context: VideoSessionOperationContext,
  options: {
    comment?: string;
    captureScreenshot?: boolean;
    pauseVideo?: boolean;
    beginEditing?: boolean;
    resumePlayback?: boolean;
    collapseAfterCapture?: boolean;
  } = {}
): Promise<VideoTimestampCapture | null> {
  if (context.state.exporting || context.state.saving) {
    return null;
  }

  context.syncCommentDrafts?.();
  context.updateVideoContext();

  const video = context.state.videoElement ?? context.findVideoElement();
  if (!video) {
    context.applyHint('noVideo');
    return null;
  }

  const shouldLeasePlayback = Boolean(options.pauseVideo && options.beginEditing !== false);
  if (options.pauseVideo && !shouldLeasePlayback && typeof video.pause === 'function') {
    video.pause();
  }

  const currentTime = Math.floor(video.currentTime || 0);
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    context.applyHint('failure');
    return null;
  }

  const shareUrl = context.buildTimestampUrl(currentTime);
  if (!shareUrl) {
    context.applyHint('failure');
    return null;
  }

  const capture = createVideoTimestampCapture({
    video,
    currentTime,
    shareUrl,
    comment: options.comment,
    captureScreenshot: options.captureScreenshot
  });

  const saved = await runVideoCaptureMutationTransaction({
    apply: () => {
      context.state.captures.push(capture);
      if (shouldLeasePlayback) {
        context.beginPlaybackEditLease?.(capture.id);
      }
      if (options.collapseAfterCapture) {
        context.dom.collapsePanel();
      }
      return capture;
    },
    afterApply: () => {
      context.syncPanel();
      context.applyHint('saving');
    },
    save: () => saveVideoSessionCaptures(context),
    commit: () => {
      if (hasRequestedTimestampScreenshot(capture) && !capture.screenshot) {
        requestRequestedScreenshotPreparation(context, capture.id);
      }
      emitVideoUsageEvent(context.dependencies, 'video_timestamp_added', {
        capture_count_bucket: bucketCount(context.state.captures.length)
      });
      context.syncPanel();
      if (options.beginEditing !== false) {
        context.dom.beginEditingCapture(capture.id, capture.comment);
      } else {
        context.dom.stopEditing(capture.id);
      }
      if (options.resumePlayback && typeof video.play === 'function') {
        void Promise.resolve(video.play()).catch(() => undefined);
      }
    },
    rollback: () => {
      rollbackVideoTimestampCaptureMutation(context, capture, shouldLeasePlayback);
    },
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to save timestamp capture:', error);
    }
  });
  if (!saved) {
    return null;
  }
  return capture;
}

export function ingestVideoSessionTextCapture(
  context: VideoSessionOperationContext,
  selectedHtml: string,
  selectedText: string,
  comment: string,
  selectionRange?: Range
): void {
  context.syncCommentDrafts?.();
  context.updateVideoContext();
  const normalizedText = selectedText.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return;
  }

  const commentTrimmed = comment.trim();
  const now = Date.now();
  const fragmentUrl = generateTextFragmentUrl(
    context.state.canonicalUrl || context.doc.location.href,
    normalizedText
  );
  const capture: VideoFragmentCapture = {
    kind: 'fragment',
    id: `aiob-video-fragment-${now}-${Math.random().toString(16).slice(2)}`,
    comment: commentTrimmed,
    selectedText: normalizedText,
    selectedHtml,
    fragmentUrl,
    createdAt: now
  };

  if (selectionRange) {
    try {
      const cloned = selectionRange.cloneRange();
      const wrapperId =
        context.state.platformAdapter?.highlight(cloned, capture.id, fragmentUrl) ??
        context.fragmentHighlighter.highlightRange(cloned, capture.id, fragmentUrl);
      if (wrapperId !== undefined) {
        capture.wrapperId = wrapperId;
      }
    } catch (error) {
      console.warn('[VideoSession] Failed to highlight selection range:', error);
    }
  }
  if (!capture.wrapperId) {
    try {
      const newWrapperId = context.state.platformAdapter?.restoreHighlight(capture);
      if (newWrapperId !== undefined) {
        capture.wrapperId = newWrapperId;
      }
    } catch (error) {
      console.warn('[VideoSession] Failed to ensure fragment highlight:', error);
    }
  }

  const saveTask = runVideoCaptureMutationTransaction({
    apply: () => {
      context.state.captures.push(capture);
      context.fragmentHighlightCoordinator.ensureStartedForFragments();
      context.fragmentHighlightCoordinator.scheduleRestore();
      return capture;
    },
    afterApply: () => {
      context.syncPanel();
      focusVideoSessionCapture(context, capture.id);
      context.applyHint('saving');
      context.dom.beginEditingCapture(capture.id, capture.comment);
    },
    save: () => saveVideoSessionCaptures(context),
    commit: () => {
      context.syncPanel();
      emitVideoUsageEvent(context.dependencies, 'video_fragment_added', {
        capture_count_bucket: bucketCount(context.state.captures.length)
      });
    },
    rollback: () => {
      rollbackVideoSessionFragmentAdd(context, capture);
      context.fragmentHighlightCoordinator.stopIfNoFragments();
    },
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to save fragment capture:', error);
    }
  });
  void saveTask;
}

export async function submitVideoSessionCaptureEdit(
  context: VideoSessionOperationContext,
  id: string,
  comment: string
): Promise<void> {
  const target = context.state.captures.find((capture) => capture.id === id);
  if (!target) {
    return;
  }
  const previousDraft = context.state.commentDrafts[id];
  context.syncCommentDrafts?.();
  const syncedDraft = context.state.commentDrafts[id];
  const draftToRestore = syncedDraft ?? previousDraft;
  const nextComment = comment.trim();

  await runVideoCaptureMutationTransaction({
    apply: () => {
      delete context.state.commentDrafts[id];
      const previousComment = target.comment;
      target.comment = nextComment;
      return { previousComment, previousDraft: draftToRestore };
    },
    afterApply: () => {
      context.syncPanel();
      context.applyHint('saving');
    },
    save: () => saveVideoSessionCaptures(context),
    commit: () => {
      context.releasePlaybackEditLease?.(id, true);
      context.dom.stopEditing(id);
      context.syncPanel();
    },
    rollback: ({ previousComment, previousDraft: draftSnapshot }) => {
      target.comment = previousComment;
      if (draftSnapshot !== undefined) {
        context.state.commentDrafts[id] = draftSnapshot;
      }
      context.syncPanel();
      context.applyHint('failure');
    },
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to save capture edit:', error);
    }
  });
}

export function removeVideoSessionCapture(context: VideoSessionOperationContext, id: string): void {
  const index = context.state.captures.findIndex((capture) => capture.id === id);
  if (index === -1) {
    return;
  }
  const previousDraft = context.state.commentDrafts[id];
  context.syncCommentDrafts?.();
  const syncedDraft = context.state.commentDrafts[id];
  const draftToRestore = syncedDraft ?? previousDraft;
  const saveTask = runVideoCaptureMutationTransaction({
    apply: () => {
      delete context.state.commentDrafts[id];
      const [removed] = context.state.captures.splice(index, 1);
      context.releasePlaybackEditLease?.(id, false);
      if (removed?.kind === 'fragment' && removed.wrapperId) {
        context.fragmentHighlighter.removeById(removed.wrapperId);
      }
      context.fragmentHighlightCoordinator.stopIfNoFragments();
      return { removed, previousDraft: draftToRestore, index };
    },
    afterApply: () => {
      context.syncPanel();
      context.applyHint('saving');
    },
    save: () => saveVideoSessionCaptures(context),
    commit: () => {
      context.syncPanel();
      emitVideoUsageEvent(context.dependencies, 'video_capture_removed', {
        capture_count_bucket: bucketCount(context.state.captures.length)
      });
    },
    rollback: ({ removed, previousDraft: draftSnapshot }) => {
      if (!removed) {
        context.syncPanel();
        context.applyHint('failure');
        return;
      }
      context.state.captures.splice(index, 0, removed);
      if (draftSnapshot !== undefined) {
        context.state.commentDrafts[id] = draftSnapshot;
      }
      restoreRemovedFragmentHighlight(context, removed);
      context.syncPanel();
      context.applyHint('failure');
    },
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to save captures after removal:', error);
    }
  });
  void saveTask;
}

export async function toggleVideoSessionCaptureScreenshot(
  context: VideoSessionOperationContext,
  id: string
): Promise<void> {
  const target = context.state.captures.find(
    (capture): capture is VideoTimestampCapture => capture.kind === 'timestamp' && capture.id === id
  );
  if (!target) {
    return;
  }
  context.syncCommentDrafts?.();
  const previousScreenshotState = snapshotTimestampScreenshotState(target);
  const shouldPrepareScreenshot = !hasRequestedTimestampScreenshot(target);
  await runVideoCaptureMutationTransaction({
    apply: () => {
      if (shouldPrepareScreenshot) {
        setRequestedTimestampScreenshot(target, null);
      } else {
        clearRequestedTimestampScreenshot(target);
      }
      return target;
    },
    afterApply: () => {
      context.syncPanel();
      context.applyHint('saving');
    },
    save: () => saveVideoSessionCaptures(context),
    commit: () => {
      context.syncPanel();
      if (shouldPrepareScreenshot) {
        requestRequestedScreenshotPreparation(context, id);
      }
    },
    rollback: () => {
      restoreTimestampScreenshotState(target, previousScreenshotState);
      context.syncPanel();
      context.applyHint('failure');
    },
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to save screenshot toggle:', error);
    }
  });
}

export function focusVideoSessionCapture(context: VideoSessionOperationContext, id: string): void {
  const target = context.state.captures.find((capture) => capture.id === id);
  if (!target) {
    return;
  }
  if (target.kind === 'timestamp') {
    focusTimestampCapture(context, target);
  } else {
    focusFragmentCapture(context, target);
  }
}

export async function finishVideoSession(
  context: VideoSessionOperationContext,
  onCleanup: () => void
): Promise<void> {
  if (context.state.exporting || context.state.saving) {
    return;
  }
  if (!context.state.captures.length) {
    context.applyHint('noCaptures');
    return;
  }

  context.syncCommentDrafts?.();
  context.updateVideoContext();
  const exportDestination = context.getExportDestinationMetadata?.();
  context.state.exporting = true;
  context.applyHint('exporting');
  context.dependencies.showSupportProgress?.({
    value: 10,
    label: '正在准备视频导出'
  });

  try {
    context.dependencies.showSupportProgress?.({
      value: 34,
      label: '正在生成视频笔记'
    });
    context.dependencies.showSupportProgress?.({
      value: 70,
      label: '正在写入 Obsidian'
    });
    const result = await context.exporter.export({
      captures: context.state.captures,
      videoTitle: context.state.videoTitle,
      canonicalUrl: context.state.canonicalUrl || '',
      videoUrl: context.state.videoUrl,
      platform: context.state.platform,
      messages: context.messages,
      storageKey: context.state.storageKey,
      ...(exportDestination ? { exportDestination } : {})
    });
    if (typeof result !== 'object' || result === null || typeof result.success !== 'boolean') {
      throw new Error('Invalid video export response');
    }
    if (!result.success) {
      throw new Error(result.error ?? 'Video clip failed');
    }
    context.dependencies.showSupportProgress?.({
      value: 100,
      label: '成功发送到 Obsidian',
      variant: 'success'
    });
    emitVideoUsageEvent(context.dependencies, 'video_exported', {
      platform: mapVideoAnalyticsPlatform(context.state.platform),
      destination: resolveVideoExportDestination(exportDestination),
      duration_bucket: resolveVideoSessionDurationBucket(context.state)
    });
    await context.removeDraft?.();
    onCleanup();
  } catch (error) {
    console.error('[VideoSession] Export failed:', error);
    context.dependencies.showSupportProgress?.({
      value: 100,
      label: '发送失败',
      variant: 'failure'
    });
    emitVideoUsageEvent(context.dependencies, 'video_export_failed', {
      platform: mapVideoAnalyticsPlatform(context.state.platform),
      destination: resolveVideoExportDestination(exportDestination),
      failure_category: resolveVideoFailureCategory(error)
    });
    context.applyHint('failure');
    context.state.exporting = false;
  }
}

export async function cancelVideoSession(context: VideoSessionOperationContext): Promise<void> {
  if (context.state.exporting) {
    return;
  }
  emitVideoUsageEvent(context.dependencies, 'video_session_cancelled', {
    platform: mapVideoAnalyticsPlatform(context.state.platform),
    duration_bucket: resolveVideoSessionDurationBucket(context.state)
  });
  await context.removeDraft?.();
  cleanupVideoSession(context);
}

export function cleanupVideoSession(context: VideoSessionOperationContext): void {
  context.resetPlaybackEditLease?.();
  context.lifecycle.stop();
  context.state.stopOptionsWatcher?.();
  context.state.stopOptionsWatcher = null;
  context.state.stopLanguageWatcher?.();
  context.state.stopLanguageWatcher = null;
  context.state.controller = null;
  context.fragmentHighlightCoordinator.updateAdapter(null);
  context.fragmentHighlightCoordinator.stop();
  context.platformController.dispose();
  context.fragmentHighlighter.reset();
  context.shadowSelectionBridge.reset();
  context.pendingSelection.reset();
  context.state.suppressSelectionCapture = false;
  context.selectionCaptureController.stop();
  context.fragmentSelectionController.handleWindowBlur();
  context.dom.destroy();

  clearVideoSession(context.session, context.doc);
  context.state.videoElement = null;
  context.state.exporting = false;
  context.state.saving = false;
  context.state.analyticsTimer = null;
  context.state.commentDrafts = {};
  context.hintManager.apply('noVideo', { videoAvailable: false, hasCaptures: false });

  for (const capture of context.state.captures) {
    if (capture.kind === 'fragment' && capture.wrapperId) {
      context.fragmentHighlighter.removeById(capture.wrapperId);
    }
  }
  context.state.captures = [];
}

export async function loadVideoSessionHighlightTheme(
  dependencies: VideoSessionDependencies
): Promise<ReaderHighlightTheme> {
  try {
    const options = await dependencies.optionsRepository.get();
    const highlightTheme = options.readingSession?.highlightTheme;
    return resolveHighlightTheme(highlightTheme);
  } catch (error) {
    console.warn('[VideoSession] Failed to load highlight theme, using default:', error);
    return DEFAULT_HIGHLIGHT_THEME;
  }
}

export function applyVideoSessionHighlightTheme(
  state: VideoSessionState,
  fragmentHighlighter: FragmentHighlighter,
  theme: ReaderHighlightTheme
): void {
  fragmentHighlighter.setTheme(theme);
  const wrapperIds = state.captures
    .filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment')
    .map((capture) => capture.wrapperId)
    .filter((id): id is string => Boolean(id));
  if (wrapperIds.length) {
    fragmentHighlighter.decorateExisting(wrapperIds);
  }
}

export function watchVideoSessionHighlightTheme(
  context: VideoSessionOperationContext,
  applyHighlightTheme: (theme: ReaderHighlightTheme) => void
): void {
  const applyOptions = (nextOptions?: StoredOptions) => {
    if (!nextOptions || !Object.prototype.hasOwnProperty.call(nextOptions, 'readingSession')) {
      return;
    }
    const highlightTheme = resolveHighlightTheme(nextOptions.readingSession?.highlightTheme);
    context.state.highlightTheme = highlightTheme;
    applyHighlightTheme(highlightTheme);
    context.fragmentHighlightCoordinator.scheduleRestore();
  };

  void context.dependencies.optionsRepository
    .get()
    .then((value) => {
      applyOptions(value);
    })
    .catch((error) => {
      console.warn('[VideoSession] Failed to preload highlight theme options:', error);
    });
  context.state.stopOptionsWatcher = context.dependencies.optionsRepository.onChange((value) => {
    applyOptions(value);
  });
}
