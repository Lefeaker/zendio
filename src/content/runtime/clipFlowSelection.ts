import { extractionErrors } from '../../shared/errors';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import { isVideoSessionActive } from './contentSessionRegistry';
import type { SupportProgressReporter } from './supportProgress';
import { hasUsableSelection } from './selectionSnapshot';
import type { ClipFlowResult } from './clipFlowDispatch';
import type { VideoSelectionController } from './clipFlow';

export async function prepareSelectionClip(
  document: Document,
  url: string,
  runtimeState: ContentRuntimeState,
  selectionTracker: ContentSelectionTracker,
  selectionController: VideoSelectionController,
  showSupportProgress?: SupportProgressReporter
): Promise<ClipFlowResult | undefined> {
  let selectionInfo = selectionTracker.resolveActiveSelection();
  if (
    (!selectionInfo || !hasUsableSelection(selectionInfo.selection)) &&
    runtimeState.getLastSelectionSnapshot()
  ) {
    selectionInfo = selectionTracker.restoreSelectionFromSnapshot(
      runtimeState.getLastSelectionSnapshot()
    );
  }

  const selection = selectionInfo?.selection ?? null;
  if (!selection || !hasUsableSelection(selection)) {
    throw extractionErrors.noSelection({
      url,
      type: 'selection',
      selectionLength: selection ? selection.toString().length : 0
    });
  }

  if (isVideoSessionActive(document)) {
    await selectionController.handleVideoSelectionClip(document, url, selection);
    runtimeState.setClipMode('full');
    runtimeState.setLastSelectionSnapshot(null);
    return undefined;
  }

  const clip = await selectionController.handleSelectionClip(document, url, selection);
  runtimeState.setClipMode('full');
  runtimeState.setLastSelectionSnapshot(null);
  if (!clip) {
    return undefined;
  }
  showSupportProgress?.({
    value: 16,
    label: '正在发送选区剪藏'
  });
  return clip;
}
