import type { VideoSessionState } from './sessionState';
import type { VideoHintState } from './videoHintManager';

export function getVideoDocumentSelection(doc: Document): Selection | null {
  if (typeof doc.getSelection === 'function') {
    const selection = doc.getSelection();
    if (selection) {
      return selection;
    }
  }
  const view = doc.defaultView ?? window;
  if (typeof view.getSelection === 'function') {
    return view.getSelection();
  }
  return null;
}

export function getSelectionForVideoNode(doc: Document, node: Node | null): Selection | null {
  const selection = getVideoDocumentSelection(doc);
  if (!selection || !node || typeof node.getRootNode !== 'function') {
    return selection;
  }
  const selectionRoot = selection.anchorNode?.getRootNode?.();
  const targetRoot = node.getRootNode();
  if (selectionRoot && targetRoot && selectionRoot !== targetRoot) {
    return selection;
  }
  return selection;
}

export function highlightVideoFragmentText(params: {
  doc: Document;
  state: VideoSessionState;
  text: string;
}): void {
  const { doc, state, text } = params;
  const range = state.platformAdapter?.findTextRange(text) ?? null;
  if (!range) {
    return;
  }
  const selection = getSelectionForVideoNode(doc, range.startContainer);
  if (!selection) {
    return;
  }
  state.suppressSelectionCapture = true;
  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } finally {
    window.setTimeout(() => {
      state.suppressSelectionCapture = false;
    }, 0);
  }
}

export function isVideoRangeInsideUi(range: Range | null): boolean {
  if (!range) {
    return false;
  }
  const container = range.commonAncestorContainer;
  const element =
    container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

  if (!element) {
    return false;
  }

  return Boolean(element.closest('#aiob-video-panel'));
}

export function resolveVideoHintState(
  hasVideoElement: boolean,
  captureCount: number
): VideoHintState {
  if (!hasVideoElement) {
    return 'noVideo';
  }
  return captureCount ? 'ready' : 'noCaptures';
}
