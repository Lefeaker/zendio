import type { FragmentClipperOptions } from '@shared/types/options';
import {
  createModifierState,
  resetModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../../clipper/services/fragmentConfig';

export interface ReaderSelectionPayload {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  event: MouseEvent;
}

export interface ReaderSelectionControllerOptions {
  doc: Document;
  fragmentConfig: FragmentClipperOptions;
  canHandleSelection: () => boolean;
  isNodeInsideUi: (node: Node | null) => boolean;
  onSelectionReady: (payload: ReaderSelectionPayload) => void;
  onSelectionCleared?: () => void;
}

export class ReaderSelectionController {
  private readonly doc: Document;
  private fragmentConfig: FragmentClipperOptions;
  private readonly canHandleSelection: () => boolean;
  private readonly isNodeInsideUi: (node: Node | null) => boolean;
  private readonly onSelectionReady: (payload: ReaderSelectionPayload) => void;
  private readonly onSelectionCleared: (() => void) | undefined;
  private modifierState = createModifierState();
  private selectionModifierActive = false;
  private cachedSelection: {
    range: Range;
    html: string;
    text: string;
  } | null = null;
  private started = false;

  constructor(options: ReaderSelectionControllerOptions) {
    this.doc = options.doc;
    this.fragmentConfig = options.fragmentConfig;
    this.canHandleSelection = options.canHandleSelection;
    this.isNodeInsideUi = options.isNodeInsideUi;
    this.onSelectionReady = options.onSelectionReady;
    this.onSelectionCleared = options.onSelectionCleared;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.doc.addEventListener('mousedown', this.handleMouseDown, true);
    this.doc.addEventListener('keydown', this.handleModifierKey, true);
    this.doc.addEventListener('keyup', this.handleModifierKey, true);
    this.doc.defaultView?.addEventListener('blur', this.handleWindowBlur, true);
    this.doc.addEventListener('mouseup', this.handleMouseUp, true);
    this.started = true;
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.doc.removeEventListener('mousedown', this.handleMouseDown, true);
    this.doc.removeEventListener('keydown', this.handleModifierKey, true);
    this.doc.removeEventListener('keyup', this.handleModifierKey, true);
    this.doc.defaultView?.removeEventListener('blur', this.handleWindowBlur, true);
    this.doc.removeEventListener('mouseup', this.handleMouseUp, true);
    this.started = false;
    this.resetModifierState();
  }

  updateFragmentConfig(config: FragmentClipperOptions): void {
    this.fragmentConfig = config;
    if (!this.fragmentConfig.selectionModifierEnabled) {
      this.selectionModifierActive = false;
      resetModifierState(this.modifierState);
    }
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      this.selectionModifierActive = false;
      return;
    }
    syncModifierState(this.modifierState, event);
    this.cacheSelectionSnapshot();
    if (!this.fragmentConfig.selectionModifierEnabled) {
      this.selectionModifierActive = false;
      return;
    }
    this.selectionModifierActive = shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);
  };

  private handleModifierKey = (event: KeyboardEvent): void => {
    syncModifierState(this.modifierState, event);
  };

  private handleWindowBlur = (): void => {
    this.resetModifierState();
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }
    if (!this.canHandleSelection()) {
      this.resetModifierState();
      return;
    }

    const selection = this.getSelection();

    let range: Range | null = null;
    let selectedHtml: string | null = null;
    let selectedText: string | null = null;

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const [anchorNode, focusNode] = [selection.anchorNode, selection.focusNode];
      if (this.isNodeInsideUi(anchorNode) || this.isNodeInsideUi(focusNode)) {
        selection.removeAllRanges();
        this.cachedSelection = null;
        this.onSelectionCleared?.();
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        selection.removeAllRanges();
        this.cachedSelection = null;
        return;
      }

      range = selection.getRangeAt(0).cloneRange();
      const container = this.doc.createElement('div');
      container.appendChild(range.cloneContents());
      selectedHtml = container.innerHTML;
      selectedText = text;
    } else if (this.cachedSelection) {
      range = this.cachedSelection.range.cloneRange();
      selectedHtml = this.cachedSelection.html;
      selectedText = this.cachedSelection.text;
    } else {
      return;
    }

    this.cachedSelection = null;

    syncModifierState(this.modifierState, event);
    const modifierRequired = this.fragmentConfig.selectionModifierEnabled;
    const modifiersSatisfied =
      this.selectionModifierActive ||
      shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);
    if (modifierRequired && !modifiersSatisfied) {
      this.selectionModifierActive = false;
      return;
    }

    const savedRange = range.cloneRange();

    this.onSelectionReady({
      range: savedRange,
      selectedHtml: selectedHtml ?? '',
      selectedText,
      event
    });
    selection?.removeAllRanges();
    this.selectionModifierActive = false;
  };

  private resetModifierState(): void {
    resetModifierState(this.modifierState);
    this.selectionModifierActive = false;
  }

  private getSelection(): Selection | null {
    return (
      this.doc.defaultView?.getSelection() ??
      this.doc.getSelection?.() ??
      window.getSelection()
    );
  }

  private cacheSelectionSnapshot(): void {
    const selection = this.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.cachedSelection = null;
      return;
    }

    const [anchorNode, focusNode] = [selection.anchorNode, selection.focusNode];
    if (this.isNodeInsideUi(anchorNode) || this.isNodeInsideUi(focusNode)) {
      this.cachedSelection = null;
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      this.cachedSelection = null;
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const container = this.doc.createElement('div');
    container.appendChild(range.cloneContents());
    this.cachedSelection = {
      range,
      html: container.innerHTML,
      text
    };
  }
}
