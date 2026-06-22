import type { ReaderHighlightRecord } from './services/highlightManager';

export function createDetachedReaderHighlight(
  doc: Document,
  id: string,
  selectedHtml: string,
  selectedText: string,
  comment: string,
  fragmentUrl: string,
  createdAt = Date.now()
): ReaderHighlightRecord {
  const wrapper = doc.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = id;
  const trimmedComment = comment.trim();
  if (trimmedComment) {
    wrapper.dataset.readerComment = trimmedComment;
  }
  wrapper.textContent = selectedText;

  return {
    id,
    selectedHtml,
    selectedText,
    comment: trimmedComment,
    fragmentUrl,
    wrapper,
    wrapperSegments: [wrapper],
    createdAt
  };
}

export function snapshotSelection(doc: Document): Range[] {
  const selection = doc.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return [];
  }
  return Array.from({ length: selection.rangeCount }, (_value, index) =>
    selection.getRangeAt(index).cloneRange()
  );
}

export function restoreSelection(doc: Document, ranges: Range[]): void {
  const selection = doc.defaultView?.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
}
