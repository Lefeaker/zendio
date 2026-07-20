import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import { isReaderSessionActive, isVideoSessionActive } from './contentSessionRegistry';
import { hasUsableSelection } from './selectionSnapshot';

export function handleModifierKey(runtimeState: ContentRuntimeState, event: KeyboardEvent): void {
  runtimeState.getSelectionModifierTrigger().updateModifierState(event);
}

export function handleWindowBlur(runtimeState: ContentRuntimeState): void {
  runtimeState.resetSelectionTracking();
}

export function handlePrimaryMouseDown(runtimeState: ContentRuntimeState, event: MouseEvent): void {
  runtimeState
    .getSelectionModifierTrigger()
    .beginPointerGesture(runtimeState.getFragmentClipperConfig(), event);
}

export function handleAutoSelectionClip(
  document: Document,
  runtimeState: ContentRuntimeState,
  selectionTracker: ContentSelectionTracker,
  runClip: () => Promise<void>,
  event: MouseEvent
): void {
  if (event.button !== 0 || isReaderSessionActive(document) || isVideoSessionActive(document)) {
    return;
  }
  const fragmentClipperConfig = runtimeState.getFragmentClipperConfig();
  const selectionTrigger = runtimeState.getSelectionModifierTrigger();
  if (!selectionTrigger.canTrigger(fragmentClipperConfig, event)) {
    selectionTrigger.completePointerGesture();
    return;
  }

  const selectionInfo = selectionTracker.resolveActiveSelection();
  if (!selectionInfo) {
    selectionTrigger.completePointerGesture();
    return;
  }

  const selection = selectionInfo.selection;
  if (
    !selection ||
    !hasUsableSelection(selection) ||
    !selection.toString().trim() ||
    selectionTracker.isSelectionInsideUi(selection) ||
    selectionTracker.isSelectionEditable(selection)
  ) {
    selectionTrigger.completePointerGesture();
    return;
  }
  if (runtimeState.getAutoSelectionInFlight()) {
    return;
  }

  runtimeState.setAutoSelectionInFlight(true);
  runtimeState.setClipMode('selection');
  void runClip().finally(() => {
    runtimeState.setAutoSelectionInFlight(false);
    selectionTrigger.completePointerGesture();
  });
}
