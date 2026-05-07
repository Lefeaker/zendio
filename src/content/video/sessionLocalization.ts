import type { Messages } from '../../i18n';
import { getContentI18nResource, getContentMessages } from '../i18n/context';
import { loadFragmentConfig } from '../clipper/services/fragmentConfig';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { StorageService } from '../../platform/interfaces/storage';
import { DEFAULT_SESSION_MESSAGES, type VideoSessionMessages } from './sessionMessages';

export async function loadVideoSessionMessages(
  updateTexts: (messages: VideoSessionMessages['panel']) => void,
  refreshHint: () => void
): Promise<VideoSessionMessages> {
  try {
    const resource = getContentI18nResource();
    const msgs = resource?.messages ?? (await getContentMessages());
    return applyVideoSessionMessages(msgs, updateTexts, refreshHint);
  } catch (error) {
    console.warn('[video-session] Failed to load i18n messages:', error);
    return applyDefaultVideoSessionMessages(updateTexts, refreshHint);
  }
}

export async function loadVideoSessionFragmentConfig(
  optionsRepository: IOptionsRepository
): Promise<FragmentClipperOptions | null> {
  try {
    return await loadFragmentConfig(optionsRepository);
  } catch (error) {
    console.warn('[VideoSession] Failed to load fragment config:', error);
    return null;
  }
}

export function watchVideoSessionLanguage(
  storage: StorageService,
  onRefresh: () => void
): () => void {
  return storage.sync.watchKey<string>('language', () => {
    onRefresh();
  });
}

function applyVideoSessionMessages(
  msgs: Messages,
  updateTexts: (messages: VideoSessionMessages['panel']) => void,
  refreshHint: () => void
): VideoSessionMessages {
  const messages: VideoSessionMessages = {
    panel: {
      title: msgs.videoPanelTitle,
      status: msgs.videoPanelStatus,
      counter: msgs.videoPanelCounter,
      counterZero: msgs.videoPanelCounterZero,
      add: msgs.videoPanelAdd,
      finish: msgs.videoPanelFinish,
      cancel: msgs.videoPanelCancel,
      hint: msgs.videoPanelHint,
      captureEditLabel: msgs.videoCaptureEditLabel,
      captureDeleteLabel: msgs.videoCaptureDeleteLabel,
      captureNoComment: msgs.videoCaptureNoComment,
      captureSaveLabel: msgs.videoCaptureSaveLabel,
      captureCancelLabel: msgs.videoCaptureCancelLabel,
      captureEditPlaceholder: msgs.videoCaptureEditPlaceholder,
      fragmentEditPlaceholder: msgs.readerHighlightEditPlaceholder,
      captureFocusLabel: msgs.videoCaptureFocusLabel
    },
    hintNoVideo: msgs.videoHintNoVideo,
    hintReady: msgs.videoHintReady,
    hintNoCaptures: msgs.videoHintNoCaptures,
    hintSaving: msgs.videoHintSaving,
    hintExporting: msgs.videoHintExporting,
    hintFailure: msgs.videoHintFailure,
    timestampSectionTitle: msgs.videoTimestampSectionTitle,
    fragmentSectionTitle: msgs.videoFragmentSectionTitle
  };

  updateTexts(messages.panel);
  refreshHint();
  return messages;
}

function applyDefaultVideoSessionMessages(
  updateTexts: (messages: VideoSessionMessages['panel']) => void,
  refreshHint: () => void
): VideoSessionMessages {
  const messages: VideoSessionMessages = {
    panel: { ...DEFAULT_SESSION_MESSAGES.panel },
    hintNoVideo: DEFAULT_SESSION_MESSAGES.hintNoVideo,
    hintReady: DEFAULT_SESSION_MESSAGES.hintReady,
    hintNoCaptures: DEFAULT_SESSION_MESSAGES.hintNoCaptures,
    hintSaving: DEFAULT_SESSION_MESSAGES.hintSaving,
    hintExporting: DEFAULT_SESSION_MESSAGES.hintExporting,
    hintFailure: DEFAULT_SESSION_MESSAGES.hintFailure,
    timestampSectionTitle: DEFAULT_SESSION_MESSAGES.timestampSectionTitle,
    fragmentSectionTitle: DEFAULT_SESSION_MESSAGES.fragmentSectionTitle
  };

  updateTexts(messages.panel);
  refreshHint();
  return messages;
}
