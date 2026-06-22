import type { ReaderPanelHighlight, ReaderPanelTexts } from './application/readerPanelModel';
import type { ReaderPanelRenderOptions, ReaderSessionView } from './application/readerSessionView';
import type { ReaderHighlightRecord } from './services/highlightManager';
import { BasePanelPresenter } from '../shared/panels/basePanelPresenter';

export class ReaderPanelPresenter extends BasePanelPresenter<ReaderSessionView> {
  constructor(
    view: ReaderSessionView,
    private readonly utils: {
      reconstructText: (highlight: ReaderHighlightRecord) => string;
    }
  ) {
    super(view);
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.view.updateTexts(texts);
  }

  render(highlights: ReaderHighlightRecord[], options: ReaderPanelRenderOptions = {}): void {
    const items: ReaderPanelHighlight[] = highlights.map((highlight, index) => {
      const reconstructed = this.utils.reconstructText(highlight);
      return {
        id: highlight.id,
        excerpt: this.buildExcerpt(reconstructed),
        comment: highlight.comment,
        fullText: this.normalizeText(reconstructed),
        commentPreview: this.buildCommentPreview(highlight.comment),
        index: index + 1,
        timestamp: typeof highlight.createdAt === 'number' ? highlight.createdAt : Date.now()
      };
    });
    this.view.updateCount(items.length);
    this.view.setHighlights(items, options);
  }
}
