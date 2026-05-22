import {
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../clipper/services/fragmentConfig';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import { isReaderSessionActive } from './contentSessionRegistry';
import { hasUsableSelection } from './selectionSnapshot';

export function handleModifierKey(runtimeState: ContentRuntimeState, event: KeyboardEvent): void {
  syncModifierState(runtimeState.getModifierState(), event);
}

export function handleWindowBlur(runtimeState: ContentRuntimeState): void {
  runtimeState.resetSelectionTracking();
}

export function handlePrimaryMouseDown(runtimeState: ContentRuntimeState, event: MouseEvent): void {
  if (event.button !== 0) {
    runtimeState.setSelectionModifierActive(false);
    return;
  }
  syncModifierState(runtimeState.getModifierState(), event);
  const fragmentClipperConfig = runtimeState.getFragmentClipperConfig();
  if (!fragmentClipperConfig.selectionModifierEnabled) {
    runtimeState.setSelectionModifierActive(false);
    return;
  }
  runtimeState.setSelectionModifierActive(
    shouldTriggerSelectionWithModifiers(fragmentClipperConfig, runtimeState.getModifierState())
  );
}

export function handleAutoSelectionClip(
  document: Document,
  runtimeState: ContentRuntimeState,
  selectionTracker: ContentSelectionTracker,
  runClip: () => Promise<void>,
  event: MouseEvent
): void {
  if (event.button !== 0 || isReaderSessionActive(document)) {
    return;
  }
  syncModifierState(runtimeState.getModifierState(), event);
  const fragmentClipperConfig = runtimeState.getFragmentClipperConfig();
  const modifierRequired = fragmentClipperConfig.selectionModifierEnabled;
  const modifiersSatisfied =
    runtimeState.isSelectionModifierActive() ||
    shouldTriggerSelectionWithModifiers(fragmentClipperConfig, runtimeState.getModifierState());
  if (modifierRequired && !modifiersSatisfied) {
    runtimeState.setSelectionModifierActive(false);
    return;
  }

  const selectionInfo = selectionTracker.resolveActiveSelection();
  if (!selectionInfo) {
    runtimeState.setSelectionModifierActive(false);
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
    runtimeState.setSelectionModifierActive(false);
    return;
  }
  if (runtimeState.getAutoSelectionInFlight()) {
    return;
  }

  runtimeState.setAutoSelectionInFlight(true);
  runtimeState.setClipMode('selection');
  void runClip().finally(() => {
    runtimeState.setAutoSelectionInFlight(false);
    runtimeState.setSelectionModifierActive(false);
  });
}
