import type { FragmentClipperOptions } from '../../../shared/types/options';
import { ClipperDialog } from '../components/dialog';
import { extractSelectionClip, type SelectionClipResult } from '../../extractors/selectionExtractor';
import { ReaderSession, ADD_HIGHLIGHT_EVENT } from '../../reader/session';

const DEFAULT_FRAGMENT_CONFIG: FragmentClipperOptions = {
  useFootnoteFormat: true,
  captureContext: false,
  contextLength: 200,
  contextMode: 'chars'
};

export async function handleSelectionClip(
  doc: Document,
  url: string,
  selection: Selection
): Promise<SelectionClipResult | null> {
  if (!selection.rangeCount) {
    throw new Error('No text selected');
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    throw new Error('Selected text is empty');
  }

  const range = selection.getRangeAt(0);
  const savedRange = range.cloneRange();

  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  const selectedHtml = container.innerHTML;

  const dialog = new ClipperDialog();
  const existingSession = window.__aiobReaderController;
  const readerPanel = doc.getElementById('aiob-reader-panel');
  const readerFlag = doc.documentElement?.dataset?.aiobReaderActive === 'true';
  const hasReaderSession = Boolean(existingSession || readerPanel || window.__aiobReaderActive || readerFlag);
  const dialogResult = await dialog.show(selectedText, {
    readerModeBehavior: hasReaderSession ? 'append' : 'start',
    allowReaderMode: true
  });
  const action = resolveDialogAction(dialogResult);
  const comment = (dialogResult.comment ?? '').trim();

  if (action === 'cancel') {
    selection.removeAllRanges();
    return null;
  }

  if (action === 'reader') {
    if (existingSession) {
      existingSession.ingestExternalHighlight(savedRange, selectedHtml, selectedText, comment);
    } else if (hasReaderSession) {
      const event = new CustomEvent(ADD_HIGHLIGHT_EVENT, {
        detail: {
          range: savedRange,
          selectedHtml,
          selectedText,
          comment
        }
      });
      doc.dispatchEvent(event);
    } else {
      const session = new ReaderSession(doc, url);
      await session.start({
        range: savedRange,
        selectedHtml,
        selectedText,
        comment
      });
    }
    selection.removeAllRanges();
    return null;
  }

  const fragmentConfig = await loadFragmentConfig();

  return extractSelectionClip({
    doc,
    url,
    selectedHtml,
    selectedText,
    userComment: comment,
    config: fragmentConfig,
    selectionRange: savedRange
  });
}

async function loadFragmentConfig(): Promise<FragmentClipperOptions> {
  try {
    const { options } = await chrome.storage.sync.get('options');
    const fragmentConfig = options?.fragmentClipper as FragmentClipperOptions | undefined;
    const merged = {
      ...DEFAULT_FRAGMENT_CONFIG,
      ...fragmentConfig
    };
    return {
      useFootnoteFormat: merged.useFootnoteFormat,
      captureContext: merged.captureContext,
      contextLength: 200,
      contextMode: 'chars'
    };
  } catch (error) {
    console.warn('[selectionController] Failed to load fragment config:', error);
    return DEFAULT_FRAGMENT_CONFIG;
  }
}

interface DialogLikeResult {
  action?: string;
  confirmed?: boolean;
  comment?: string;
}

function resolveDialogAction(result: DialogLikeResult): 'clip' | 'cancel' | 'reader' {
  if (result.action === 'reader') {
    return 'reader';
  }
  if (result.action === 'cancel' || result.confirmed === false) {
    return 'cancel';
  }
  return 'clip';
}
