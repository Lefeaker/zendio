import {
  createModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState,
  type ModifierState
} from '../clipper/services/fragmentConfig';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { SelectionActivationPayload } from './selectionCaptureController';
import type { VideoPlatformAdapter, PlatformSelectionResult } from './platforms';
import type { PendingSelectionTracker } from './pendingSelectionTracker';

interface FragmentSelectionDependencies {
  doc: Document;
  pendingSelection: PendingSelectionTracker;
  getFragmentConfig(): FragmentClipperOptions | null;
  getPlatformAdapter(): VideoPlatformAdapter | null;
}

interface FragmentSelectionCallbacks {
  onSelectionAccepted(data: {
    selectedHtml: string;
    selectedText: string;
    range: Range | null;
  }): void;
}

export class VideoFragmentSelectionController {
  private modifierState: ModifierState = createModifierState();
  private selectionModifierActive = false;

  constructor(
    private readonly deps: FragmentSelectionDependencies,
    private readonly callbacks: FragmentSelectionCallbacks
  ) {}

  handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      this.selectionModifierActive = false;
      return;
    }

    syncModifierState(this.modifierState, event);

    const fragmentConfig = this.deps.getFragmentConfig();
    if (!fragmentConfig?.selectionModifierEnabled) {
      this.selectionModifierActive = false;
      return;
    }

    this.selectionModifierActive = shouldTriggerSelectionWithModifiers(
      fragmentConfig,
      this.modifierState
    );
  }

  handleKeyDown(event: KeyboardEvent): void {
    syncModifierState(this.modifierState, event);
  }

  handleKeyUp(event: KeyboardEvent): void {
    syncModifierState(this.modifierState, event);
  }

  handleWindowBlur(): void {
    this.modifierState = createModifierState();
    this.selectionModifierActive = false;
    this.deps.pendingSelection.reset();
  }

  shouldTrackSelection(): boolean {
    const fragmentConfig = this.deps.getFragmentConfig();
    if (!fragmentConfig) {
      return false;
    }
    if (!fragmentConfig.selectionModifierEnabled) {
      return true;
    }
    return (
      shouldTriggerSelectionWithModifiers(fragmentConfig, this.modifierState) ||
      this.selectionModifierActive
    );
  }

  processActivatedSelection({ range, selection, event }: SelectionActivationPayload): void {
    let highlightRange: Range | null = range ? range.cloneRange() : null;
    const container = this.deps.doc.createElement('div');
    if (highlightRange) {
      container.appendChild(highlightRange.cloneContents());
    }
    let selectedHtml = container.innerHTML;
    const selectionText = selection?.toString().trim() ?? '';
    let selectedText = selectionText || highlightRange?.toString().trim() || '';

    const platformAdapter = this.deps.getPlatformAdapter();
    const platformSelection: PlatformSelectionResult | null =
      platformAdapter?.resolveSelection({
        range: highlightRange,
        selectedText,
        selectedHtml,
        event
      }) ?? null;

    if (!platformSelection) {
      selection?.removeAllRanges();
      return;
    }

    selectedText = platformSelection.text;
    selectedHtml = platformSelection.html;
    highlightRange = platformSelection.range
      ? platformSelection.range.cloneRange()
      : highlightRange;

    const fragmentConfig = this.deps.getFragmentConfig();
    if (!fragmentConfig) {
      return;
    }

    syncModifierState(this.modifierState, readModifierSource(event));
    const modifierRequired = fragmentConfig.selectionModifierEnabled;
    const modifiersSatisfied =
      this.selectionModifierActive ||
      shouldTriggerSelectionWithModifiers(fragmentConfig, this.modifierState);

    if (modifierRequired && !modifiersSatisfied) {
      this.selectionModifierActive = false;
      return;
    }

    this.callbacks.onSelectionAccepted({ selectedHtml, selectedText, range: highlightRange });
    selection?.removeAllRanges();
    this.selectionModifierActive = false;
  }
}

function readModifierSource(event: Event): Partial<ModifierState> {
  const source: Partial<ModifierState> = {};
  if ('altKey' in event) {
    source.altKey = Boolean(event.altKey);
  }
  if ('metaKey' in event) {
    source.metaKey = Boolean(event.metaKey);
  }
  if ('ctrlKey' in event) {
    source.ctrlKey = Boolean(event.ctrlKey);
  }
  if ('shiftKey' in event) {
    source.shiftKey = Boolean(event.shiftKey);
  }
  return source;
}
