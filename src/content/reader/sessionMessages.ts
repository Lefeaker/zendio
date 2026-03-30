import type { ReaderPanelTexts } from './application/readerPanelModel';

export type ReaderHintState = 'panel' | 'noHighlights' | 'exporting' | 'failure' | 'selectionFailure';

export interface ReaderSessionMessages {
  panel: ReaderPanelTexts;
  hintNoHighlights: string;
  hintExporting: string;
  hintFailure: string;
  hintSelectionFailure: string;
}

export const DEFAULT_SESSION_MESSAGES: ReaderSessionMessages = {
  panel: {
    title: 'Reading session active',
    status: 'Select text to highlight and annotate',
    counter: 'Collected {count} highlights',
    counterZero: 'Collected 0 highlights',
    finish: 'Finish & export',
    cancel: 'Cancel',
    hint: 'Tip: release the mouse to open the annotation dialog; leave it blank to save highlight only.',
    highlightEditLabel: 'Edit note',
    highlightDeleteLabel: 'Remove highlight',
    highlightNoComment: 'No note yet',
    highlightSaveLabel: 'Save note',
    highlightCancelLabel: 'Cancel',
    highlightEditPlaceholder: 'Update the note here...',
    highlightFocusLabel: 'Jump to highlight {index}'
  },
  hintNoHighlights: 'No highlights yet. Select some text first.',
  hintExporting: 'Generating Markdown...',
  hintFailure: 'Export failed, please try again later.',
  hintSelectionFailure: 'Failed to highlight, please try again.'
};
