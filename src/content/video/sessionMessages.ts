import type { VideoPanelTexts } from './application/videoPanelModel';

export interface VideoSessionMessages {
  panel: VideoPanelTexts;
  hintNoVideo: string;
  hintReady: string;
  hintNoCaptures: string;
  hintSaving: string;
  hintExporting: string;
  hintFailure: string;
  timestampSectionTitle: string;
  fragmentSectionTitle: string;
}

export const DEFAULT_SESSION_MESSAGES: VideoSessionMessages = {
  panel: {
    title: 'Video capture mode',
    status: 'Capture timestamps and quick notes',
    counter: 'Saved {count} entries',
    counterZero: 'Saved 0 entries',
    add: 'Capture current timestamp',
    finish: 'Finish & export',
    cancel: 'Cancel',
    hint: 'Click “Capture current timestamp” or use the context menu on selected text to add it to the panel.',
    captureEditLabel: 'Edit note',
    captureDeleteLabel: 'Remove capture',
    captureNoComment: 'No note yet',
    captureSaveLabel: 'Save note',
    captureCancelLabel: 'Cancel',
    captureEditPlaceholder: 'Add a note for this timestamp...',
    fragmentEditPlaceholder: 'Update the note here...',
    captureFocusLabel: 'Jump to capture {index}'
  },
  hintNoVideo: 'Waiting for video element to be ready…',
  hintReady: 'Use “Capture current timestamp” or the selection context menu to add notes.',
  hintNoCaptures: 'No captures yet. Start by clicking the + button.',
  hintSaving: 'Saving capture…',
  hintExporting: 'Generating Markdown export…',
  hintFailure: 'Something went wrong. Please try again.',
  timestampSectionTitle: 'Video timestamps',
  fragmentSectionTitle: 'Captured fragments'
};
