import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import { ReaderDialog, type ReaderDialogHighlight } from '../components/ReaderDialog';

interface ReaderDialogPanelOptions {
  callbacks: ReaderPanelCallbacks;
  texts: ReaderPanelTexts;
}

export class ReaderDialogPanel {
  private readonly dialog: ReaderDialog;
  private readonly renderRoot: HTMLElement;
  private texts: ReaderPanelTexts;
  private highlightCount = 0;

  constructor(options: ReaderDialogPanelOptions) {
    this.texts = options.texts;
    this.dialog = new ReaderDialog({
      title: options.texts.title,
      highlights: [],
      texts: {
        hint: options.texts.hint,
        finish: options.texts.finish,
        cancel: options.texts.cancel,
        highlightNoComment: options.texts.highlightNoComment,
        highlightFocusLabel: options.texts.highlightFocusLabel,
        highlightEditPlaceholder: options.texts.highlightEditPlaceholder,
        highlightSaveLabel: options.texts.highlightSaveLabel,
        highlightCancelLabel: options.texts.highlightCancelLabel
      },
      onExport: options.callbacks.onFinish,
      onClose: options.callbacks.onCancel,
      onFinish: options.callbacks.onFinish,
      onCancel: options.callbacks.onCancel,
      onDeleteHighlight: options.callbacks.onDeleteHighlight,
      onFocusHighlight: options.callbacks.onFocusHighlight,
      onSubmitHighlightEdit: options.callbacks.onSubmitHighlightEdit
    });
    this.renderRoot = this.dialog.render();
    this.dialog.setCounterText(this.formatCounter(0));
    this.dialog.show();
  }

  get element(): HTMLElement {
    return this.renderRoot;
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.texts = texts;
    this.dialog.updateTitle(texts.title);
    this.dialog.setHintText(texts.hint);
    this.dialog.setCounterText(this.formatCounter(this.highlightCount));
  }

  updateCount(count: number): void {
    this.highlightCount = count;
    this.dialog.setCounterText(this.formatCounter(count));
  }

  updateHint(text: string): void {
    this.dialog.setHintText(text);
  }

  setHighlights(highlights: ReaderPanelHighlight[]): void {
    this.highlightCount = highlights.length;
    this.dialog.updateHighlights(this.mapHighlights(highlights));
    this.dialog.setCounterText(this.formatCounter(highlights.length));
  }

  stopEditing(): void {
    this.dialog.stopEditing();
  }

  isEditing(): boolean {
    return this.dialog.isEditing();
  }

  destroy(): void {
    this.dialog.destroy();
  }

  private mapHighlights(highlights: ReaderPanelHighlight[]): ReaderDialogHighlight[] {
    return highlights.map((highlight) => ({
      id: highlight.id,
      index: highlight.index,
      excerpt: highlight.excerpt,
      fullText: highlight.fullText,
      commentPreview: highlight.commentPreview,
      comment: highlight.comment,
      timestamp: typeof highlight.timestamp === 'number' ? highlight.timestamp : Date.now()
    }));
  }

  private formatCounter(count: number): string {
    if (count <= 0) {
      return this.texts.counterZero;
    }
    return this.texts.counter.replace('{count}', String(count));
  }
}
