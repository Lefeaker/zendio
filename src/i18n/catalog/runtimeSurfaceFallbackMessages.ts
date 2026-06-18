import type { Messages } from '../messages';

type RuntimeSurfaceFallbackMessageKey =
  | 'addToReaderButton'
  | 'clipSelection'
  | 'clipSelectionVideo'
  | 'commentPlaceholder'
  | 'readerPanelTitle'
  | 'readerPanelStatus'
  | 'readerPanelFinish'
  | 'readerPanelCancel'
  | 'readerPanelCounter'
  | 'readerPanelCounterZero'
  | 'readerHighlightEditPlaceholder'
  | 'readerHighlightSaveLabel'
  | 'readerHighlightDeleteLabel'
  | 'videoPanelTitle'
  | 'videoPanelStatus'
  | 'videoPanelAdd'
  | 'videoPanelFinish'
  | 'videoPanelCancel'
  | 'videoPanelCounter'
  | 'videoPanelCounterZero'
  | 'videoCaptureEditPlaceholder'
  | 'videoCaptureDeleteLabel'
  | 'supportPromptTitle'
  | 'supportPromptLikeLabel'
  | 'supportPromptDislikeLabel'
  | 'supportPromptDismiss'
  | 'supportPromptStatusFailure'
  | 'supportPromptStatusWarning'
  | 'supportPromptStatusSuccessWithVault'
  | 'supportPromptStatusSuccess'
  | 'supportPromptKoFiTitle'
  | 'supportPromptKoFiDescription'
  | 'supportPromptAfdianTitle'
  | 'supportPromptAfdianDescription'
  | 'supportPromptGithubTitle'
  | 'supportPromptGithubDescription'
  | 'schemaRuntimeAiSummaryBadge'
  | 'schemaRuntimeClipperTitle'
  | 'schemaRuntimeClipperDescription'
  | 'schemaRuntimeReaderTitle'
  | 'schemaRuntimeReaderDescription'
  | 'schemaRuntimeSurfaceCollapsePanelAriaLabel'
  | 'schemaRuntimeSurfaceConfigureVaultLabel'
  | 'schemaRuntimeSurfaceResizePanelAriaLabel'
  | 'schemaRuntimeSurfaceResizePanelHeightAriaLabel'
  | 'schemaRuntimeSurfaceSaveToLabel'
  | 'schemaRuntimeTaskSuccessDescription'
  | 'schemaRuntimeTaskSuccessProgressAriaLabel'
  | 'schemaRuntimeTaskSuccessStatusDetail'
  | 'schemaRuntimeTaskSuccessTitle'
  | 'schemaRuntimeVideoCaptureScreenshotLabel'
  | 'schemaRuntimeVideoRemoveScreenshotLabel'
  | 'schemaRuntimeVideoTitle'
  | 'schemaRuntimeVideoDescription';

export const RUNTIME_SURFACE_FALLBACK_MESSAGES = {
  addToReaderButton: 'Add to reading session',
  clipSelection: 'Clip selection to Obsidian',
  clipSelectionVideo: 'Clip to video capture panel',
  commentPlaceholder: 'Write your thoughts, notes or comments here...',
  readerPanelTitle: 'Reading session active',
  readerPanelStatus: 'Select text to highlight and annotate',
  readerPanelFinish: 'Finish & export',
  readerPanelCancel: 'Cancel',
  readerPanelCounter: 'Collected {count} highlights',
  readerPanelCounterZero: 'Collected 0 highlights',
  readerHighlightEditPlaceholder: 'Edit the note here...',
  readerHighlightSaveLabel: 'Save note',
  readerHighlightDeleteLabel: 'Remove highlight',
  videoPanelTitle: 'Video capture mode',
  videoPanelStatus: 'Capture timestamps and quick notes',
  videoPanelAdd: 'Capture current timestamp',
  videoPanelFinish: 'Finish & export',
  videoPanelCancel: 'Cancel',
  videoPanelCounter: 'Saved {count} entries',
  videoPanelCounterZero: 'Saved 0 entries',
  videoCaptureEditPlaceholder: 'Add a note for this timestamp...',
  videoCaptureDeleteLabel: 'Remove capture',
  supportPromptTitle: 'Support Zendio',
  supportPromptLikeLabel: 'Thumbs up',
  supportPromptDislikeLabel: 'Thumbs down',
  supportPromptDismiss: 'Click anywhere outside to close',
  supportPromptStatusFailure: 'Send failed',
  supportPromptStatusWarning: 'Saved, but classification fell back',
  supportPromptStatusSuccessWithVault: 'Successfully sent to {vault}',
  supportPromptStatusSuccess: 'Send succeeded',
  supportPromptKoFiTitle: 'Ko-fi',
  supportPromptKoFiDescription: 'Buy me a coffee',
  supportPromptAfdianTitle: 'WeChat Reward',
  supportPromptAfdianDescription: 'Scan the WeChat reward code to support the project.',
  supportPromptGithubTitle: 'GitHub',
  supportPromptGithubDescription: 'File feedback',
  schemaRuntimeAiSummaryBadge: 'AI Summary',
  schemaRuntimeClipperTitle: 'Clipper Dialog',
  schemaRuntimeClipperDescription: 'Dialog users see after selecting text on a webpage.',
  schemaRuntimeReaderTitle: 'Reader Mode',
  schemaRuntimeReaderDescription:
    'Floating reader panel with real highlight lists and inline note editing.',
  schemaRuntimeSurfaceCollapsePanelAriaLabel: 'Collapse panel',
  schemaRuntimeSurfaceConfigureVaultLabel: 'Configure vault',
  schemaRuntimeSurfaceResizePanelAriaLabel: 'Resize panel',
  schemaRuntimeSurfaceResizePanelHeightAriaLabel: 'Resize panel height',
  schemaRuntimeSurfaceSaveToLabel: 'Save to',
  schemaRuntimeTaskSuccessDescription: 'Success prompt shown after a save finishes.',
  schemaRuntimeTaskSuccessProgressAriaLabel: 'Send progress',
  schemaRuntimeTaskSuccessStatusDetail:
    'Content was saved using the current vault routing, and classification is complete.',
  schemaRuntimeTaskSuccessTitle: 'Task Success',
  schemaRuntimeVideoCaptureScreenshotLabel: 'Capture screenshot',
  schemaRuntimeVideoRemoveScreenshotLabel: 'Remove screenshot',
  schemaRuntimeVideoTitle: 'Video Mode',
  schemaRuntimeVideoDescription:
    'Video note panel built around timestamps, captured fragments, and comments.'
} satisfies Pick<Messages, RuntimeSurfaceFallbackMessageKey>;
