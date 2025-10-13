import { ReaderPanel } from '../ui/panel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type {
  ReaderSessionView,
  ReaderSessionViewFactory
} from '../application/readerSessionView';

class ReaderPanelViewAdapter implements ReaderSessionView {
  constructor(private readonly panel: ReaderPanel) {}

  get element(): HTMLElement {
    return this.panel.element;
  }

  updateCount(count: number): void {
    this.panel.updateCount(count);
  }

  updateHint(message: string): void {
    this.panel.updateHint(message);
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
    const panel = new ReaderPanel(callbacks, texts);
    return new ReaderPanelViewAdapter(panel);
  }
});
