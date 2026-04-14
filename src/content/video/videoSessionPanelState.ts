import type { VideoFragmentCapture } from './types';
import type { VideoSessionState } from './sessionState';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { VideoSessionDomController } from './sessionDom';
import { resolveVideoHintState } from './videoSessionSelection';

export function syncVideoSessionPanel(args: {
  dom: VideoSessionDomController;
  state: VideoSessionState;
  getFragmentElement: (capture: VideoFragmentCapture) => HTMLElement | null;
  applyHint: (state: ReturnType<typeof resolveVideoHintState>) => void;
}): void {
  const totalCount = args.dom.syncPanel(args.state, args.getFragmentElement);
  args.applyHint(resolveVideoHintState(Boolean(args.state.videoElement), totalCount));
}

export function getVideoSessionFragmentElement(args: {
  capture: VideoFragmentCapture;
  fragmentHighlighter: FragmentHighlighter;
  ensureCaptureHighlight: (capture: VideoFragmentCapture) => void;
}): HTMLElement | null {
  args.ensureCaptureHighlight(args.capture);
  if (!args.capture.wrapperId) {
    return null;
  }
  const node = args.fragmentHighlighter.getElementByIdDeep(args.capture.wrapperId);
  return node instanceof HTMLElement ? node : null;
}

export function ensureVideoSessionCaptureHighlight(args: {
  capture: VideoFragmentCapture;
  fragmentHighlighter: FragmentHighlighter;
  restoreHighlight: (capture: VideoFragmentCapture) => string | undefined;
}): void {
  const existing = args.capture.wrapperId
    ? args.fragmentHighlighter.getElementByIdDeep(args.capture.wrapperId)
    : null;
  if (existing && existing.isConnected) {
    args.fragmentHighlighter.decorateElement(existing);
    return;
  }
  const newWrapperId = args.restoreHighlight(args.capture);
  if (newWrapperId !== undefined) {
    args.capture.wrapperId = newWrapperId;
    args.fragmentHighlighter.decorateById(newWrapperId);
  }
}
