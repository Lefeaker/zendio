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
import type { ReaderHighlightTheme, StoredOptions } from '../../shared/types/options';

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
}

export async function handleVideoSessionAddCapture(
  context: VideoSessionOperationContext
): Promise<void> {
  if (context.state.exporting || context.state.saving) {
    return;
  }

  context.updateVideoContext();

  const video = context.state.videoElement ?? context.findVideoElement();
  if (!video) {
    context.applyHint('noVideo');
    return;
  }

  const currentTime = Math.floor(video.currentTime || 0);
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    context.applyHint('failure');
    return;
  }

  const shareUrl = context.buildTimestampUrl(currentTime);
  if (!shareUrl) {
    context.applyHint('failure');
    return;
  }

  const capture: VideoTimestampCapture = {
    kind: 'timestamp',
    id: `aiob-video-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timeSec: currentTime,
    comment: '',
    url: shareUrl,
    createdAt: Date.now()
  };

  context.state.captures.push(capture);
  context.syncPanel();
  context.applyHint('saving');
  await saveVideoCaptures(context);
  context.syncPanel();
  context.dom.beginEditingCapture(capture.id, capture.comment);
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
  target.comment = comment.trim();
  context.applyHint('saving');
  await saveVideoCaptures(context);
  context.syncPanel();
  context.dom.stopEditing();
}

export function removeVideoSessionCapture(context: VideoSessionOperationContext, id: string): void {
  const index = context.state.captures.findIndex((capture) => capture.id === id);
  if (index === -1) {
    return;
  }
  const [removed] = context.state.captures.splice(index, 1);
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

  try {
    const result = await context.exporter.export({
      captures: context.state.captures,
      videoTitle: context.state.videoTitle,
      canonicalUrl: context.state.canonicalUrl || '',
      videoUrl: context.state.videoUrl,
      platform: context.state.platform,
      messages: context.messages,
      storageKey: context.state.storageKey
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Video clip failed');
    }
    onCleanup();
  } catch (error) {
    console.error('[VideoSession] Export failed:', error);
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

function focusTimestampCapture(
  context: VideoSessionOperationContext,
  capture: VideoTimestampCapture
): void {
  const video = context.state.videoElement ?? context.findVideoElement();
  if (!video) {
    context.applyHint('noVideo');
    return;
  }
  try {
    video.currentTime = capture.timeSec;
    const playResult = video.play();
    void Promise.resolve(playResult).catch(() => undefined);
  } catch (error) {
    console.warn('[VideoSession] Failed to seek video:', error);
  }
}

function focusFragmentCapture(
  context: VideoSessionOperationContext,
  capture: VideoFragmentCapture
): void {
  context.ensureCaptureHighlight(capture);
  if (capture.wrapperId) {
    const element = context.fragmentHighlighter.getElementByIdDeep(capture.wrapperId);
    if (element) {
      context.fragmentHighlighter.decorateElement(element);
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('aiob-reader-highlight--focus');
      window.setTimeout(() => element.classList.remove('aiob-reader-highlight--focus'), 1600);
      context.fragmentHighlightCoordinator.scheduleRestore();
      return;
    }
  }
  context.highlightFragmentText(capture.selectedText);
}

async function saveVideoCaptures(context: VideoSessionOperationContext): Promise<void> {
  const hintState = await context.platformController.saveCaptures();
  if (hintState) {
    context.applyHint(hintState);
  }
}
