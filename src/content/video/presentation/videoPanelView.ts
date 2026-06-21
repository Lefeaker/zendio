import { VideoDialogPanel } from '../ui/VideoDialogPanel';
import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import type { VideoSessionView, VideoSessionViewFactory } from '../application/videoSessionView';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

interface VideoPanelViewFactoryOptions {
  resolveAssetUrl?: (path: string) => string;
}

class VideoPanelViewAdapter implements VideoSessionView {
  constructor(private readonly panel: VideoDialogPanel) {}

  updateCount(count: number): void {
    this.panel.updateCount(count);
  }

  setCaptures(captures: VideoPanelCapture[]): void {
    this.panel.setCaptures(captures);
  }

  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.panel.updateDestination(destination);
  }

  updateHint(message: string): void {
    this.panel.updateHint(message);
  }

  updateTexts(texts: VideoPanelTexts): void {
    this.panel.updateTexts(texts);
  }

  beginEditingCapture(captureId: string, comment: string): void {
    this.panel.beginEditingCapture(captureId, comment);
  }

  stopEditing(captureId?: string): void {
    this.panel.stopEditing(captureId);
  }

  snapshotCommentDrafts(): Record<string, string> {
    return this.panel.snapshotCommentDrafts();
  }

  hydrateCommentDrafts(drafts: Record<string, string>): void {
    this.panel.hydrateCommentDrafts(drafts);
  }

  collapse(): void {
    this.panel.collapse();
  }

  destroy(): void {
    this.panel.destroy();
  }
}

export const createVideoPanelViewFactory = (
  options: VideoPanelViewFactoryOptions = {}
): VideoSessionViewFactory => ({
  createView(
    callbacks: VideoPanelCallbacks,
    texts: VideoPanelTexts,
    viewOptions: { initialCollapsed?: boolean } = {}
  ): VideoSessionView {
    const panel = new VideoDialogPanel({
      callbacks,
      texts,
      ...(viewOptions.initialCollapsed ? { initialCollapsed: true } : {}),
      ...(options.resolveAssetUrl ? { resolveAssetUrl: options.resolveAssetUrl } : {})
    });
    panel.show();
    return new VideoPanelViewAdapter(panel);
  }
});
