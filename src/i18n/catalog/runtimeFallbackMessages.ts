import type { Messages } from '../messages';

type RuntimeFallbackMessageKey =
  | 'onboardingSupportModalAfdianLabel'
  | 'onboardingSupportModalCloseButton'
  | 'onboardingSupportModalDescription'
  | 'onboardingSupportModalTitle'
  | 'readerHighlightCancelLabel'
  | 'readerHighlightDeleteLabel'
  | 'readerHighlightEditLabel'
  | 'readerHighlightEditPlaceholder'
  | 'readerHighlightFocusLabel'
  | 'readerHighlightNoComment'
  | 'readerHighlightSaveLabel'
  | 'readerHintExporting'
  | 'readerHintFailure'
  | 'readerHintNoHighlights'
  | 'readerHintSelectionFailure'
  | 'readerPanelCancel'
  | 'readerPanelCounter'
  | 'readerPanelCounterZero'
  | 'readerPanelFinish'
  | 'readerPanelHint'
  | 'readerPanelStatus'
  | 'readerPanelTitle'
  | 'supportProgressErrorCodeSuffix'
  | 'supportProgressRecordingResult'
  | 'supportProgressReadingSettings'
  | 'supportProgressSavingDownloads'
  | 'supportProgressSelectingVault'
  | 'supportProgressSendingToObsidian'
  | 'supportProgressWritingAttachments'
  | 'supportProgressWritingNote'
  | 'supportPromptAfdianDescription'
  | 'supportPromptAfdianTitle'
  | 'supportPromptDialogLabel'
  | 'supportPromptDismiss'
  | 'supportPromptDislikeLabel'
  | 'supportPromptDislikeQrCaption'
  | 'supportPromptDislikeQrLinkLabel'
  | 'supportPromptDislikeQrPlaceholder'
  | 'supportPromptDislikeRedditLinkLabel'
  | 'supportPromptDislikeToastTitle'
  | 'supportPromptFeedbackGroupLabel'
  | 'supportPromptGithubDescription'
  | 'supportPromptGithubTitle'
  | 'supportPromptKoFiDescription'
  | 'supportPromptKoFiTitle'
  | 'supportPromptLikeLabel'
  | 'supportPromptLikeThankYou'
  | 'supportPromptReviewAcknowledgedLabel'
  | 'supportPromptReviewLinkLabel'
  | 'supportPromptStatusFailure'
  | 'supportPromptStatusFailureWithReason'
  | 'supportPromptStatusSuccess'
  | 'supportPromptStatusSuccessWithVault'
  | 'supportPromptStatusWarning'
  | 'supportPromptStatusWarningWithReason'
  | 'supportPromptTitle'
  | 'videoCaptureCancelLabel'
  | 'videoCaptureDeleteLabel'
  | 'videoCaptureEditLabel'
  | 'videoCaptureEditPlaceholder'
  | 'videoCaptureFocusLabel'
  | 'videoCaptureNoComment'
  | 'videoCaptureSaveLabel'
  | 'videoFragmentSectionTitle'
  | 'videoHintExporting'
  | 'videoHintFailure'
  | 'videoHintNoCaptures'
  | 'videoHintNoVideo'
  | 'videoHintReady'
  | 'videoHintSaving'
  | 'videoPanelAdd'
  | 'videoPanelCancel'
  | 'videoPanelCounter'
  | 'videoPanelCounterZero'
  | 'videoPanelFinish'
  | 'videoPanelHint'
  | 'videoPanelStatus'
  | 'videoPanelTitle'
  | 'videoSessionDraftTitleFallback'
  | 'videoTimestampSectionTitle';

export const RUNTIME_FALLBACK_MESSAGES = {
  onboardingSupportModalAfdianLabel: 'Afdian',
  onboardingSupportModalCloseButton: 'Close',
  onboardingSupportModalDescription:
    'Development is not easy. If this plugin helps you, welcome to support through the following ways:',
  onboardingSupportModalTitle: 'Thank You for Your Support',
  readerHighlightCancelLabel: 'Cancel',
  readerHighlightDeleteLabel: 'Remove highlight',
  readerHighlightEditLabel: 'Edit note',
  readerHighlightEditPlaceholder: 'Edit the note here...',
  readerHighlightFocusLabel: 'Jump to highlight {index}',
  readerHighlightNoComment: 'No note yet',
  readerHighlightSaveLabel: 'Save note',
  readerHintExporting: 'Generating Markdown...',
  readerHintFailure: 'Export failed, please try again later.',
  readerHintNoHighlights: 'No highlights yet. Select some text first.',
  readerHintSelectionFailure: 'Failed to highlight, please try again.',
  readerPanelCancel: 'Cancel',
  readerPanelCounter: 'Collected {count} highlights',
  readerPanelCounterZero: 'Collected 0 highlights',
  readerPanelFinish: 'Finish & export',
  readerPanelHint:
    'Tip: release the mouse to open the annotation dialog; leave it blank to save highlight only.',
  readerPanelStatus: 'Select text to highlight and annotate',
  readerPanelTitle: 'Reading session active',
  supportProgressErrorCodeSuffix: ' (code: {code})',
  supportProgressRecordingResult: 'Recording result',
  supportProgressReadingSettings: 'Reading settings and categories',
  supportProgressSavingDownloads: 'Saving to Downloads',
  supportProgressSelectingVault: 'Selecting Obsidian vault',
  supportProgressSendingToObsidian: 'Sending to Obsidian',
  supportProgressWritingAttachments: 'Writing attachments',
  supportProgressWritingNote: 'Writing note',
  supportPromptAfdianDescription: 'Scan the WeChat reward code to support the project.',
  supportPromptAfdianTitle: 'WeChat Reward',
  supportPromptDialogLabel: 'Support Zendio',
  supportPromptDismiss: 'Click anywhere outside to close',
  supportPromptDislikeLabel: 'Thumbs down',
  supportPromptDislikeQrCaption: 'Scan with Xiaohongshu to join the group',
  supportPromptDislikeQrLinkLabel: 'Xiaohongshu',
  supportPromptDislikeQrPlaceholder: 'QR code unavailable',
  supportPromptDislikeRedditLinkLabel: 'Reddit',
  supportPromptDislikeToastTitle: 'Share your feedback',
  supportPromptFeedbackGroupLabel: 'Quick feedback',
  supportPromptGithubDescription: 'File feedback',
  supportPromptGithubTitle: 'GitHub',
  supportPromptKoFiDescription: 'Buy me a coffee',
  supportPromptKoFiTitle: 'Ko-fi',
  supportPromptLikeLabel: 'Thumbs up',
  supportPromptLikeThankYou: 'Thanks for the encouragement!',
  supportPromptReviewAcknowledgedLabel: 'I already left a review',
  supportPromptReviewLinkLabel: 'Write a review',
  supportPromptStatusFailure: 'Send failed',
  supportPromptStatusFailureWithReason: 'Send failed, {reason}',
  supportPromptStatusSuccess: 'Send succeeded',
  supportPromptStatusSuccessWithVault: 'Successfully sent to {vault}',
  supportPromptStatusWarning: 'Saved, but classification fell back',
  supportPromptStatusWarningWithReason: 'Saved, but classification failed: {reason}',
  supportPromptTitle: 'Support Zendio',
  videoCaptureCancelLabel: 'Cancel',
  videoCaptureDeleteLabel: 'Remove capture',
  videoCaptureEditLabel: 'Edit note',
  videoCaptureEditPlaceholder: 'Add a note for this timestamp...',
  videoCaptureFocusLabel: 'Jump to capture {index}',
  videoCaptureNoComment: 'No note yet',
  videoCaptureSaveLabel: 'Save note',
  videoFragmentSectionTitle: 'Captured fragments',
  videoHintExporting: 'Generating Markdown export...',
  videoHintFailure: 'Something went wrong. Please try again.',
  videoHintNoCaptures: 'No captures yet. Start by clicking the + button.',
  videoHintNoVideo: 'Waiting for video element to be ready...',
  videoHintReady: 'Click + to capture current timestamp. Notes are saved automatically.',
  videoHintSaving: 'Saving capture...',
  videoPanelAdd: 'Capture current timestamp',
  videoPanelCancel: 'Cancel',
  videoPanelCounter: 'Saved {count} entries',
  videoPanelCounterZero: 'Saved 0 entries',
  videoPanelFinish: 'Finish & export',
  videoPanelHint:
    'Tip: Selecting text adds it automatically; press Enter twice to save notes, Esc to cancel.',
  videoPanelStatus: 'Capture timestamps and quick notes',
  videoPanelTitle: 'Video capture mode',
  videoSessionDraftTitleFallback: 'Video Capture',
  videoTimestampSectionTitle: 'Video timestamps'
} satisfies Pick<Messages, RuntimeFallbackMessageKey>;

export const VIDEO_TITLE_FALLBACK = RUNTIME_FALLBACK_MESSAGES.videoSessionDraftTitleFallback;
