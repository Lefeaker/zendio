import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from './readerPanelModel';

export interface ReaderSessionView {
  readonly element: HTMLElement;
  updateCount(count: number): void;
  updateHint(message: string): void;
  setHighlights(highlights: ReaderPanelHighlight[]): void;
  stopEditing(): void;
  isEditing(): boolean;
  destroy(): void;
}

export interface ReaderSessionViewFactory {
  createView(callbacks: ReaderPanelCallbacks, texts: ReaderPanelTexts): ReaderSessionView;
}
