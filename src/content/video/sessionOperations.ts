import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionState } from './sessionState';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { SelectionCaptureController } from './selectionCaptureController';
import type { VideoSessionLifecycle } from './sessionLifecycle';
import type { VideoSessionExporter } from './videoSessionExporter';
import type { VideoSessionMessages } from './sessionMessages';
import type { VideoHintManager } from './videoHintManager';
import type { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import type { PendingSelectionTracker } from './pendingSelectionTracker';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { VideoSessionDomController } from './sessionDom';
import { clearVideoSession } from '../runtime/contentSessionRegistry';
import { resolveHighlightTheme, DEFAULT_HIGHLIGHT_THEME } from './fragmentHighlighter';
import type { VideoHintState } from './videoHintManager';
import type { ReaderHighlightTheme, StoredOptions } from '../../shared/types/options';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';
import { captureVideoFrameScreenshot } from './videoFrameScreenshot';
import { focusFragmentCapture, focusTimestampCapture } from './videoSessionCaptureFocus';
import {
  createVideoTimestampCapture,
  saveVideoTimestampCaptureOrRollback
} from './videoTimestampCaptureTransaction';

export interface VideoSessionOperationContext {
  session: object;
  doc: Document;
  state: VideoSessionState;
  dependencies: VideoSessionDependencies;
  dom: VideoSessionDomController;
  exporter: VideoSessionExporter;
  fragmentHighlighter: FragmentHighlighter;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  shadowSelectionBridge: ShadowSelectionBridge;
  pendingSelection: PendingSelectionTracker;
  selectionCaptureController: SelectionCaptureController;
  fragmentSelectionController: VideoFragmentSelectionController;
  lifecycle: VideoSessionLifecycle;
  platformController: VideoSessionPlatformController;
  hintManager: VideoHintManager;
  messages: VideoSessionMessages;
  updateVideoContext: () => void;
  findVideoElement: () => HTMLVideoElement | null;
  buildTimestampUrl: (timeSec: number) => string | null;
  applyHint: (state: Parameters<VideoSessionDomController['applyHint']>[0]) => void;
  syncPanel: () => void;
  ensureCaptureHighlight: (capture: VideoFragmentCapture) => void;
  getSelectionForNode: (node: Node | null) => Selection | null;
  highlightFragmentText: (text: string) => void;
  getExportDestinationMetadata?: () => ExportDestinationMetadata | undefined;
  beginPlaybackEditLease?: (captureId: string) => void;
  releasePlaybackEditLease?: (captureId: string, restorePlayback: boolean) => void;
  resetPlaybackEditLease?: () => void;
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

  context.state.captures.push(capture);
  if (shouldLeasePlayback) {
    context.beginPlaybackEditLease?.(capture.id);
  }
  if (options.collapseAfterCapture) {
    context.dom.collapsePanel();
  }
  context.syncPanel();
  context.applyHint('saving');
  const saved = await saveVideoTimestampCaptureOrRollback(
    context,
    capture,
    shouldLeasePlayback,
    () => saveVideoCaptures(context)
  );
  if (!saved) {
    return null;
  }
  context.syncPanel();
  if (options.beginEditing !== false) {
    context.dom.beginEditingCapture(capture.id, capture.comment);
  } else {
    context.dom.stopEditing();
  }
  if (options.resumePlayback && typeof video.play === 'function') {
    void Promise.resolve(video.play()).catch(() => undefined);
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

  context.state.captures.push(capture);
  context.fragmentHighlightCoordinator.ensureStartedForFragments();
  context.fragmentHighlightCoordinator.scheduleRestore();
  context.syncPanel();
  focusVideoSessionCapture(context, capture.id);
  context.applyHint('saving');
  context.dom.beginEditingCapture(capture.id, capture.comment);
  void saveVideoCaptures(context)
    .then(() => {
      context.syncPanel();
    })
    .catch((error) => {
      console.warn('[VideoSession] Failed to save fragment capture:', error);
      context.applyHint('failure');
    });
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
  const previousComment = target.comment;
  target.comment = comment.trim();
  context.applyHint('saving');
  const saveHint = await saveVideoCaptures(context);
  if (saveHint === 'failure') {
    target.comment = previousComment;
    context.syncPanel();
    context.applyHint('failure');
    return;
  }
  context.releasePlaybackEditLease?.(id, true);
  context.dom.stopEditing();
  context.syncPanel();
}

export function removeVideoSessionCapture(context: VideoSessionOperationContext, id: string): void {
  const index = context.state.captures.findIndex((capture) => capture.id === id);
  if (index === -1) {
    return;
  }
  const [removed] = context.state.captures.splice(index, 1);
  context.releasePlaybackEditLease?.(id, false);
  if (removed?.kind === 'fragment' && removed.wrapperId) {
    context.fragmentHighlighter.removeById(removed.wrapperId);
  }
  void saveVideoCaptures(context)
    .then(() => {
      context.syncPanel();
    })
    .catch((error) => {
      console.warn('[VideoSession] Failed to save captures after removal:', error);
      context.applyHint('failure');
    });
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

  if (target.screenshot) {
    delete target.screenshot;
    context.applyHint('saving');
    await saveVideoCaptures(context);
    context.syncPanel();
    return;
  }

  context.updateVideoContext();
  const video = context.state.videoElement ?? context.findVideoElement();
  if (!video) {
    context.applyHint('noVideo');
    return;
  }

  const screenshot = captureVideoFrameScreenshot(video, target.timeSec);
  if (!screenshot) {
    context.applyHint('failure');
    return;
  }

  target.screenshot = screenshot;
  context.applyHint('saving');
  await saveVideoCaptures(context);
  context.syncPanel();
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

  context.updateVideoContext();
  context.state.exporting = true;
  context.applyHint('exporting');
  context.dependencies.showSupportProgress?.({
    value: 10,
    label: '正在准备视频导出'
  });

  try {
    const exportDestination = context.getExportDestinationMetadata?.();
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
    onCleanup();
  } catch (error) {
    console.error('[VideoSession] Export failed:', error);
    context.dependencies.showSupportProgress?.({
      value: 100,
      label: '发送失败',
      variant: 'failure'
    });
    context.applyHint('failure');
    context.state.exporting = false;
  }
}

export function cancelVideoSession(context: VideoSessionOperationContext): void {
  if (context.state.exporting) {
    return;
  }
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
    const highlightTheme = (options.readingSession as { highlightTheme?: unknown } | undefined)
      ?.highlightTheme;
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
    const highlightTheme = resolveHighlightTheme(
      (nextOptions.readingSession as { highlightTheme?: unknown } | undefined)?.highlightTheme
    );
    context.state.highlightTheme = highlightTheme;
    applyHighlightTheme(highlightTheme);
    context.fragmentHighlightCoordinator.scheduleRestore();
  };

  void context.dependencies.optionsRepository
    .get()
    .then((value) => {
      applyOptions(value as StoredOptions);
    })
    .catch((error) => {
      console.warn('[VideoSession] Failed to preload highlight theme options:', error);
    });
  context.state.stopOptionsWatcher = context.dependencies.optionsRepository.onChange((value) => {
    applyOptions(value as StoredOptions);
  });
}

async function saveVideoCaptures(
  context: VideoSessionOperationContext
): Promise<VideoHintState | null> {
  const hintState = await context.platformController.saveCaptures();
  if (hintState) {
    context.applyHint(hintState);
  }
  return hintState;
}
