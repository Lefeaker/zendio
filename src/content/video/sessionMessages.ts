import { RUNTIME_FALLBACK_MESSAGES } from '../../i18n/catalog/runtimeFallbackMessages';
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
    title: RUNTIME_FALLBACK_MESSAGES.videoPanelTitle,
    status: RUNTIME_FALLBACK_MESSAGES.videoPanelStatus,
    counter: RUNTIME_FALLBACK_MESSAGES.videoPanelCounter,
    counterZero: RUNTIME_FALLBACK_MESSAGES.videoPanelCounterZero,
    add: RUNTIME_FALLBACK_MESSAGES.videoPanelAdd,
    finish: RUNTIME_FALLBACK_MESSAGES.videoPanelFinish,
    cancel: RUNTIME_FALLBACK_MESSAGES.videoPanelCancel,
    hint: RUNTIME_FALLBACK_MESSAGES.videoPanelHint,
    captureEditLabel: RUNTIME_FALLBACK_MESSAGES.videoCaptureEditLabel,
    captureDeleteLabel: RUNTIME_FALLBACK_MESSAGES.videoCaptureDeleteLabel,
    captureNoComment: RUNTIME_FALLBACK_MESSAGES.videoCaptureNoComment,
    captureSaveLabel: RUNTIME_FALLBACK_MESSAGES.videoCaptureSaveLabel,
    captureCancelLabel: RUNTIME_FALLBACK_MESSAGES.videoCaptureCancelLabel,
    captureEditPlaceholder: RUNTIME_FALLBACK_MESSAGES.videoCaptureEditPlaceholder,
    fragmentEditPlaceholder: RUNTIME_FALLBACK_MESSAGES.readerHighlightEditPlaceholder,
    captureFocusLabel: RUNTIME_FALLBACK_MESSAGES.videoCaptureFocusLabel
  },
  hintNoVideo: RUNTIME_FALLBACK_MESSAGES.videoHintNoVideo,
  hintReady: RUNTIME_FALLBACK_MESSAGES.videoHintReady,
  hintNoCaptures: RUNTIME_FALLBACK_MESSAGES.videoHintNoCaptures,
  hintSaving: RUNTIME_FALLBACK_MESSAGES.videoHintSaving,
  hintExporting: RUNTIME_FALLBACK_MESSAGES.videoHintExporting,
  hintFailure: RUNTIME_FALLBACK_MESSAGES.videoHintFailure,
  timestampSectionTitle: RUNTIME_FALLBACK_MESSAGES.videoTimestampSectionTitle,
  fragmentSectionTitle: RUNTIME_FALLBACK_MESSAGES.videoFragmentSectionTitle
};
