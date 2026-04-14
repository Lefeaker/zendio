import { ReaderDialogPanel } from '../ui/ReaderDialogPanel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type {
  ReaderSessionView,
  ReaderSessionViewFactory
} from '../application/readerSessionView';

type ReaderPanelLike = {
  readonly element: HTMLElement;
  updateCount(count: number): void;
  updateHint(message: string): void;
  updateTexts(texts: ReaderPanelTexts): void;
  setHighlights(highlights: ReaderPanelHighlight[]): void;
  stopEditing(): void;
  isEditing(): boolean;
  destroy(): void;
};

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

  setHighlights(highlights: ReaderPanelHighlight[]): void {
    this.panel.setHighlights(highlights);
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

export const createReaderPanelViewFactory = (): ReaderSessionViewFactory => ({
  createView(callbacks: ReaderPanelCallbacks, texts: ReaderPanelTexts): ReaderSessionView {
    const panel = new ReaderDialogPanel({ callbacks, texts });
    panel.show();
    return new ReaderPanelViewAdapter(panel);
  }
});
