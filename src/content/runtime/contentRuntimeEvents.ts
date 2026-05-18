import {
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../clipper/services/fragmentConfig';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';

export interface CreateContentRuntimeEventsOptions {
  document: Document;
  window: Window;
  runtimeState: ContentRuntimeState;
  selectionTracker: ContentSelectionTracker;
  isReaderSessionActive: (doc: Document) => boolean;
  runClip: () => Promise<void>;
}

export interface ContentRuntimeEvents {
  attach(): () => void;
}

export function createContentRuntimeEvents(
  options: CreateContentRuntimeEventsOptions
): ContentRuntimeEvents {
  const { document, window, runtimeState, selectionTracker, isReaderSessionActive, runClip } =
    options;

  const handleModifierKey = (event: KeyboardEvent): void => {
    syncModifierState(runtimeState.getModifierState(), event);
  };

  const handleWindowBlur = (): void => {
    runtimeState.resetSelectionTracking();
  };

  const handlePrimaryMouseDown = (event: MouseEvent): void => {
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
  };

  const handleAutoSelectionClip = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }
    if (isReaderSessionActive(document)) {
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
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    if (!selection.toString().trim()) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    if (
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
  };

  const handleSelectionChange = (): void => {
    selectionTracker.handleSelectionChange();
  };

  const handleSelectStart = (): void => {
    selectionTracker.handleSelectStart();
  };

  function attach(): () => void {
    document.addEventListener('keydown', handleModifierKey, true);
    document.addEventListener('keyup', handleModifierKey, true);
    window.addEventListener('blur', handleWindowBlur, true);
    document.addEventListener('mousedown', handlePrimaryMouseDown, true);
    document.addEventListener('mouseup', handleAutoSelectionClip, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('selectstart', handleSelectStart, true);

    return () => {
      document.removeEventListener('keydown', handleModifierKey, true);
      document.removeEventListener('keyup', handleModifierKey, true);
      window.removeEventListener('blur', handleWindowBlur, true);
      document.removeEventListener('mousedown', handlePrimaryMouseDown, true);
      document.removeEventListener('mouseup', handleAutoSelectionClip, true);
      document.removeEventListener('selectionchange', handleSelectionChange, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
    };
  }

  return {
    attach
  };
}
