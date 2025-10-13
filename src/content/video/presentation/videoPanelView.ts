import { VideoPanel } from '../ui/panel';
import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import type {
  VideoSessionView,
  VideoSessionViewFactory
} from '../application/videoSessionView';

class VideoPanelViewAdapter implements VideoSessionView {
  constructor(private readonly panel: VideoPanel) {}

  updateCount(count: number): void {
    this.panel.updateCount(count);
  }

  setCaptures(captures: VideoPanelCapture[]): void {
    this.panel.setCaptures(captures);
  }

  updateHint(message: string): void {
    this.panel.updateHint(message);
  }

  beginEditingCapture(captureId: string, comment: string): void {
    this.panel.beginEditingCapture(captureId, comment);
  }

  stopEditing(): void {
    this.panel.stopEditing();
  }

  destroy(): void {
    this.panel.destroy();
  }
}

export const createVideoPanelViewFactory = (): VideoSessionViewFactory => ({
  createView(callbacks: VideoPanelCallbacks, texts: VideoPanelTexts): VideoSessionView {
    const panel = new VideoPanel(callbacks, texts);
    return new VideoPanelViewAdapter(panel);
  }
});
