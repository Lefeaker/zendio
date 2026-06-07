import { ReaderDialogPanel } from '../ui/ReaderDialogPanel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type {
  ReaderSessionView,
  ReaderSessionViewFactory,
  ReaderSessionViewOptions
} from '../application/readerSessionView';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import type { SessionCommentDraftSnapshot } from '@content/shared/panels/sessionCommentDrafts';

type ReaderPanelLike = {
  readonly element: HTMLElement;
  updateCount(count: number): void;
  updateHint(message: string): void;
  updateTexts(texts: ReaderPanelTexts): void;
  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void;
  setHighlights(highlights: ReaderPanelHighlight[]): void;
  snapshotCommentDrafts?(): SessionCommentDraftSnapshot;
  hydrateCommentDrafts?(drafts: SessionCommentDraftSnapshot): void;
  stopEditing(): void;
  isEditing(): boolean;
  destroy(): void;
};

interface ReaderPanelViewFactoryOptions {
  resolveAssetUrl?: (path: string) => string;
}

class ReaderPanelViewAdapter implements ReaderSessionView {
  constructor(private readonly panel: ReaderPanelLike) {}

  get element(): HTMLElement {
    return this.panel.element;
  }

  updateCount(count: number): void {
    this.panel.updateCount(count);
  }

  updateHint(message: string): void {
    this.panel.updateHint(message);
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.panel.updateTexts(texts);
  }

  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.panel.updateDestination(destination);
  }

  setHighlights(highlights: ReaderPanelHighlight[]): void {
    this.panel.setHighlights(highlights);
  }

  snapshotCommentDrafts(): SessionCommentDraftSnapshot {
    return this.panel.snapshotCommentDrafts?.() ?? {};
  }

  hydrateCommentDrafts(drafts: SessionCommentDraftSnapshot): void {
    this.panel.hydrateCommentDrafts?.(drafts);
  }

  stopEditing(): void {
    this.panel.stopEditing();
  }

  isEditing(): boolean {
    return this.panel.isEditing();
  }

  destroy(): void {
    this.panel.destroy();
  }
}

export const createReaderPanelViewFactory = (
  options: ReaderPanelViewFactoryOptions = {}
): ReaderSessionViewFactory => ({
  createView(
    callbacks: ReaderPanelCallbacks,
    texts: ReaderPanelTexts,
    viewOptions: ReaderSessionViewOptions = {}
  ): ReaderSessionView {
    const panel = new ReaderDialogPanel({
      callbacks,
      texts,
      ...(viewOptions.onCommentDraftChange
        ? { onCommentDraftChange: viewOptions.onCommentDraftChange }
        : {}),
      ...(options.resolveAssetUrl ? { resolveAssetUrl: options.resolveAssetUrl } : {})
    });
    panel.show();
    return new ReaderPanelViewAdapter(panel);
  }
});
