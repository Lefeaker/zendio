import { ReaderDialogPanel } from '../ui/ReaderDialogPanel';
import type { ReaderPanelCallbacks, ReaderPanelTexts } from '../application/readerPanelModel';
import type {
  ReaderSessionView,
  ReaderSessionViewFactory,
  ReaderSessionViewOptions
} from '../application/readerSessionView';

interface ReaderPanelViewFactoryOptions {
  resolveAssetUrl?: (path: string) => string;
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
    return panel;
  }
});
