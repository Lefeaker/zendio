import type { VideoPanelCallbacks, VideoPanelCapture, VideoPanelTexts } from './videoPanelModel';

export interface VideoSessionView {
  updateCount(count: number): void;
  setCaptures(captures: VideoPanelCapture[]): void;
  updateHint(message: string): void;
  beginEditingCapture(captureId: string, comment: string): void;
  stopEditing(): void;
  destroy(): void;
}

export interface VideoSessionViewFactory {
  createView(callbacks: VideoPanelCallbacks, texts: VideoPanelTexts): VideoSessionView;
}
