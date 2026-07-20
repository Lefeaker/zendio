import {
  modifierSourceFromEvent,
  SelectionModifierTrigger
} from '../clipper/services/selectionModifierTrigger';
import { isSelectionTriggerConfigured } from '../../shared/config/selectionTriggerMode';
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
  private readonly selectionTrigger = new SelectionModifierTrigger();

  constructor(
    private readonly deps: FragmentSelectionDependencies,
    private readonly callbacks: FragmentSelectionCallbacks
  ) {}

  handleMouseDown(event: MouseEvent): void {
    const fragmentConfig = this.deps.getFragmentConfig();
    if (!fragmentConfig) {
      this.selectionTrigger.reset();
      return;
    }
    this.selectionTrigger.beginPointerGesture(fragmentConfig, event);
  }

  handleKeyDown(event: KeyboardEvent): void {
    this.selectionTrigger.updateModifierState(event);
  }

  handleKeyUp(event: KeyboardEvent): void {
    this.selectionTrigger.updateModifierState(event);
  }

  handleWindowBlur(): void {
    this.selectionTrigger.reset();
    this.deps.pendingSelection.reset();
  }

  isSelectionTriggerConfigured(): boolean {
    const fragmentConfig = this.deps.getFragmentConfig();
    return Boolean(fragmentConfig && isSelectionTriggerConfigured(fragmentConfig));
  }

  shouldTrackSelection(): boolean {
    const fragmentConfig = this.deps.getFragmentConfig();
    return Boolean(fragmentConfig && this.selectionTrigger.shouldTrackSelection(fragmentConfig));
  }

  canActivateSelection(event: Event): boolean {
    const fragmentConfig = this.deps.getFragmentConfig();
    return Boolean(
      fragmentConfig &&
      this.selectionTrigger.canTrigger(fragmentConfig, modifierSourceFromEvent(event))
    );
  }

  processActivatedSelection({ range, selection, event }: SelectionActivationPayload): void {
    if (!this.canActivateSelection(event)) {
      this.selectionTrigger.completePointerGesture();
      return;
    }
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
      this.selectionTrigger.completePointerGesture();
      return;
    }

    selectedText = platformSelection.text;
    selectedHtml = platformSelection.html;
    highlightRange = platformSelection.range
      ? platformSelection.range.cloneRange()
      : highlightRange;

    this.callbacks.onSelectionAccepted({ selectedHtml, selectedText, range: highlightRange });
    selection?.removeAllRanges();
    this.selectionTrigger.completePointerGesture();
  }
}
