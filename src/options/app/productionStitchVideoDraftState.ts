import type { CompleteOptions } from '@shared/types/options';
import type { PreviewStoreState } from '@options/stitch/types';

export function updateVideoDraftPath(
  draft: CompleteOptions,
  state: PreviewStoreState,
  path: string,
  value: unknown
): boolean {
  switch (path) {
    case 'video.floatingPromptEnabled':
      draft.video.floatingPromptEnabled = Boolean(value);
      state.videoFloatingPromptEnabled = draft.video.floatingPromptEnabled;
      return true;
    case 'video.commentEditorAutoPause':
      draft.video.commentEditorAutoPause = Boolean(value);
      state.videoCommentEditorAutoPause = draft.video.commentEditorAutoPause;
      return true;
    case 'video.screenshotAttachment.locationTemplate':
      draft.video.screenshotAttachment.locationTemplate = String(value ?? '');
      state.videoScreenshotAttachmentLocationTemplate =
        draft.video.screenshotAttachment.locationTemplate;
      return true;
    case 'video.screenshotAttachment.fileNameTemplate':
      draft.video.screenshotAttachment.fileNameTemplate = String(value ?? '');
      state.videoScreenshotAttachmentFileNameTemplate =
        draft.video.screenshotAttachment.fileNameTemplate;
      return true;
    case 'video.screenshotAttachment.markdownUrlFormat':
      draft.video.screenshotAttachment.markdownUrlFormat = String(value ?? '');
      state.videoScreenshotAttachmentMarkdownUrlFormat =
        draft.video.screenshotAttachment.markdownUrlFormat;
      return true;
    default:
      return false;
  }
}
