import { RUNTIME_FALLBACK_MESSAGES } from '../../i18n/catalog/runtimeFallbackMessages';
import type { ReaderPanelTexts } from './application/readerPanelModel';

export type ReaderHintState =
  | 'panel'
  | 'noHighlights'
  | 'exporting'
  | 'failure'
  | 'selectionFailure';

export interface ReaderSessionMessages {
  panel: ReaderPanelTexts;
  hintNoHighlights: string;
  hintExporting: string;
  hintFailure: string;
  hintSelectionFailure: string;
}

export const DEFAULT_SESSION_MESSAGES: ReaderSessionMessages = {
  panel: {
    title: RUNTIME_FALLBACK_MESSAGES.readerPanelTitle,
    status: RUNTIME_FALLBACK_MESSAGES.readerPanelStatus,
    counter: RUNTIME_FALLBACK_MESSAGES.readerPanelCounter,
    counterZero: RUNTIME_FALLBACK_MESSAGES.readerPanelCounterZero,
    finish: RUNTIME_FALLBACK_MESSAGES.readerPanelFinish,
    cancel: RUNTIME_FALLBACK_MESSAGES.readerPanelCancel,
    hint: RUNTIME_FALLBACK_MESSAGES.readerPanelHint,
    highlightEditLabel: RUNTIME_FALLBACK_MESSAGES.readerHighlightEditLabel,
    highlightDeleteLabel: RUNTIME_FALLBACK_MESSAGES.readerHighlightDeleteLabel,
    highlightNoComment: RUNTIME_FALLBACK_MESSAGES.readerHighlightNoComment,
    highlightSaveLabel: RUNTIME_FALLBACK_MESSAGES.readerHighlightSaveLabel,
    highlightCancelLabel: RUNTIME_FALLBACK_MESSAGES.readerHighlightCancelLabel,
    highlightEditPlaceholder: RUNTIME_FALLBACK_MESSAGES.readerHighlightEditPlaceholder,
    highlightFocusLabel: RUNTIME_FALLBACK_MESSAGES.readerHighlightFocusLabel
  },
  hintNoHighlights: RUNTIME_FALLBACK_MESSAGES.readerHintNoHighlights,
  hintExporting: RUNTIME_FALLBACK_MESSAGES.readerHintExporting,
  hintFailure: RUNTIME_FALLBACK_MESSAGES.readerHintFailure,
  hintSelectionFailure: RUNTIME_FALLBACK_MESSAGES.readerHintSelectionFailure
};
