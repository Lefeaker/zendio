import type { VideoFragmentCapture, VideoTimestampCapture } from './types';

interface VideoSessionCaptureFocusContext {
  state: {
    videoElement: HTMLVideoElement | null;
  };
  fragmentHighlighter: {
    getElementByIdDeep(wrapperId: string): HTMLElement | null;
    decorateElement(element: HTMLElement): void;
  };
  fragmentHighlightCoordinator: {
    scheduleRestore(): void;
  };
  findVideoElement(): HTMLVideoElement | null;
  applyHint(state: 'noVideo'): void;
  ensureCaptureHighlight(capture: VideoFragmentCapture): void;
  highlightFragmentText(text: string): void;
}

export function focusTimestampCapture(
  context: VideoSessionCaptureFocusContext,
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

export function focusFragmentCapture(
  context: VideoSessionCaptureFocusContext,
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
