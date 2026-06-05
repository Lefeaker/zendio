import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from './readerPanelModel';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import type { SessionCommentDraftSnapshot } from '@content/shared/panels/sessionCommentDrafts';

export interface ReaderSessionViewOptions {
  onCommentDraftChange?: (drafts: SessionCommentDraftSnapshot) => void;
}

export interface ReaderSessionView {
  readonly element: HTMLElement;
  updateCount(count: number): void;
  updateHint(message: string): void;
  updateTexts(texts: ReaderPanelTexts): void;
  updateDestination?(destination: ExportDestinationSurfacePreview | undefined): void;
  setHighlights(highlights: ReaderPanelHighlight[]): void;
  snapshotCommentDrafts?(): SessionCommentDraftSnapshot;
  hydrateCommentDrafts?(drafts: SessionCommentDraftSnapshot): void;
  stopEditing(): void;
  isEditing(): boolean;
  destroy(): void;
}

export interface ReaderSessionViewFactory {
  createView(
    callbacks: ReaderPanelCallbacks,
    texts: ReaderPanelTexts,
    options?: ReaderSessionViewOptions
  ): ReaderSessionView;
}
