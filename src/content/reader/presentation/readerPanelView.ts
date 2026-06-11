import { ReaderDialogPanel } from '../ui/ReaderDialogPanel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type {
  ReaderPanelEditingSnapshot,
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
  clearCommentDraft?(id: string): void;
  restoreCommentDraft?(id: string, draft: string | undefined): void;
  snapshotEditingState?(): ReaderPanelEditingSnapshot;
  restoreEditingState?(snapshot: ReaderPanelEditingSnapshot): void;
  finishEditing?(): void;
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

  clearCommentDraft(id: string): void {
    this.panel.clearCommentDraft?.(id);
  }

  restoreCommentDraft(id: string, draft: string | undefined): void {
    this.panel.restoreCommentDraft?.(id, draft);
  }

  snapshotEditingState(): ReaderPanelEditingSnapshot {
    return (
      this.panel.snapshotEditingState?.() ?? {
        editingHighlightId: null,
        pendingNoteFocusHighlightId: null
      }
    );
  }

  restoreEditingState(snapshot: ReaderPanelEditingSnapshot): void {
    this.panel.restoreEditingState?.(snapshot);
  }

  finishEditing(): void {
    this.panel.finishEditing?.();
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
