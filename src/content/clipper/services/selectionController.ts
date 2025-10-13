import { extractSelectionClip, type SelectionClipResult } from '../../extractors/selectionExtractor';
import type { ReaderBootstrapHighlight } from '../../reader/types';
import type { ClipPromptGateway } from '../application/clipPromptGateway';
import { ADD_HIGHLIGHT_EVENT } from '../../reader/constants';
import { loadFragmentConfig } from './fragmentConfig';

export interface ReaderSessionAdapter {
  ingestExternalHighlight(range: Range, selectedHtml: string, selectedText: string, comment: string): void;
  start(initialHighlight: ReaderBootstrapHighlight): Promise<void>;
}

export interface VideoSessionAdapter {
  start(): Promise<void>;
  ingestTextCapture(selectedHtml: string, selectedText: string, comment: string, selectionRange: Range): void;
}

export interface SelectionClipDependencies {
  prompt: ClipPromptGateway;
  createReaderSession(doc: Document, url: string): ReaderSessionAdapter;
  createVideoSession(doc: Document): VideoSessionAdapter;
}

export interface SelectionController {
  handleSelectionClip(doc: Document, url: string, selection: Selection): Promise<SelectionClipResult | null>;
  handleVideoSelectionClip(doc: Document, url: string, selection: Selection): Promise<void>;
  handleVideoSelectionClipFromData(
    doc: Document,
    url: string,
    selectedHtml: string,
    selectedText: string,
    comment?: string
  ): Promise<void>;
}

export function createSelectionController(deps: SelectionClipDependencies): SelectionController {
  async function handleSelectionClip(
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

    const existingSession = window.__aiobReaderController as ReaderSessionAdapter | undefined;
    const readerPanel = doc.getElementById('aiob-reader-panel');
    const readerFlag = doc.documentElement?.dataset?.aiobReaderActive === 'true';
    const hasReaderSession = Boolean(existingSession || readerPanel || window.__aiobReaderActive || readerFlag);

    const promptResult = await deps.prompt.requestSelectionAction({
      selectedText,
      allowReaderMode: true,
      readerModeBehavior: hasReaderSession ? 'append' : 'start'
    });
    const action = promptResult.action;
    const comment = promptResult.comment.trim();

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
        const session = deps.createReaderSession(doc, url);
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

  async function handleVideoSelectionClip(
    doc: Document,
    url: string,
    selection: Selection
  ): Promise<void> {
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

    let session = window.__aiobVideoController as VideoSessionAdapter | undefined;
    if (!session) {
      session = deps.createVideoSession(doc);
      await session.start();
    }

    session.ingestTextCapture(selectedHtml, selectedText, '', savedRange);
    selection.removeAllRanges();
  }

  return {
    handleSelectionClip,
    handleVideoSelectionClip,
    handleVideoSelectionClipFromData: async (doc, url, selectedHtml, selectedText, comment = '') => {
      const normalizedText = selectedText.replace(/\s+/g, ' ').trim();
      if (!normalizedText) {
        throw new Error('Selected text is empty');
      }

      let session = window.__aiobVideoController as VideoSessionAdapter | undefined;
      if (!session) {
        session = deps.createVideoSession(doc);
        await session.start();
      }

      session.ingestTextCapture(selectedHtml, normalizedText, comment, undefined);
    }
  };
}
