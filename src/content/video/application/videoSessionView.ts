import type { VideoPanelCallbacks, VideoPanelCapture, VideoPanelTexts } from './videoPanelModel';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

export interface VideoSessionView {
  updateCount(count: number): void;
  setCaptures(captures: VideoPanelCapture[]): void;
  updateDestination?(destination: ExportDestinationSurfacePreview | undefined): void;
  updateHint(message: string): void;
  updateTexts(texts: VideoPanelTexts): void;
  beginEditingCapture(captureId: string, comment: string): void;
  stopEditing(): void;
  collapse?(): void;
  destroy(): void;
}

export interface VideoSessionViewFactory {
  createView(callbacks: VideoPanelCallbacks, texts: VideoPanelTexts): VideoSessionView;
}
