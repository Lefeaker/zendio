import type { CompleteOptions } from '@shared/types/options';
import type { PreviewStoreState } from '@options/stitch/types';

export function updateVideoDraftPath(
  draft: CompleteOptions,
  state: PreviewStoreState,
  path: string,
  value: boolean
): boolean {
  switch (path) {
    case 'video.floatingPromptEnabled':
      draft.video.floatingPromptEnabled = value;
      state.videoFloatingPromptEnabled = draft.video.floatingPromptEnabled;
      return true;
    case 'video.commentEditorAutoPause':
      draft.video.commentEditorAutoPause = value;
      state.videoCommentEditorAutoPause = draft.video.commentEditorAutoPause;
      return true;
    default:
      return false;
  }
}
