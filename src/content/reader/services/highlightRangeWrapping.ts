const BLOCK_LEVEL_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BODY',
  'CAPTION',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL'
]);

export function createHighlightWrappers(
  doc: Document,
  range: Range,
  highlightId: string
): HTMLElement[] {
  const baseRange = range.cloneRange();
  const textNodes: Text[] = [];
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!range.intersectsNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  const wrappers: HTMLElement[] = [];
  for (const node of textNodes) {
    const highlightRange = doc.createRange();
    try {
      const maxOffset = node.textContent?.length ?? 0;
      const startOffset = node === range.startContainer ? range.startOffset : 0;
      const endOffset = node === range.endContainer ? range.endOffset : maxOffset;

      if (endOffset <= startOffset) {
        highlightRange.detach?.();
        continue;
      }

      highlightRange.setStart(node, startOffset);
      highlightRange.setEnd(node, endOffset);
    } catch {
      highlightRange.setStart(node, 0);
      highlightRange.setEnd(node, node.textContent?.length ?? 0);
    }

    const wrapper = doc.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = highlightId;

    try {
      highlightRange.surroundContents(wrapper);
      wrappers.push(wrapper);
    } catch {
      const fragment = highlightRange.extractContents();
      if (!fragment.childNodes.length) {
        highlightRange.detach?.();
        continue;
      }
      wrapper.appendChild(fragment);
      flattenNestedHighlightMarks(wrapper);
      highlightRange.insertNode(wrapper);
      wrappers.push(wrapper);
    }

    highlightRange.detach?.();
  }

  if (!wrappers.length) {
    const fallbackWrapper = doc.createElement('mark');
    fallbackWrapper.className = 'aiob-reader-highlight';
    fallbackWrapper.dataset.readerHighlightId = highlightId;

    const fragment = baseRange.extractContents();
    if (!fragment.childNodes.length) {
      baseRange.detach?.();
      return wrappers;
    }
    fallbackWrapper.appendChild(fragment);
    flattenNestedHighlightMarks(fallbackWrapper);
    baseRange.insertNode(fallbackWrapper);
    wrappers.push(fallbackWrapper);
  }

  baseRange.detach?.();
  return mergeWrapperSegments(doc, wrappers, highlightId);
}

export function mergeWrapperSegments(
  doc: Document,
  segments: HTMLElement[],
  highlightId: string
): HTMLElement[] {
  const connectedSegments = segments.filter((segment) => segment.isConnected);
  if (connectedSegments.length <= 1) {
    return connectedSegments.length ? connectedSegments : segments;
  }

  const referenceBlock = findBlockContainer(connectedSegments[0]);
  const canMerge =
    !!referenceBlock &&
    connectedSegments.every((segment) => findBlockContainer(segment) === referenceBlock) &&
    isSafeToMergeSegments(doc, connectedSegments);

  if (!canMerge) {
    return connectedSegments;
  }

  const mergeRange = doc.createRange();
  mergeRange.setStartBefore(connectedSegments[0]);
  mergeRange.setEndAfter(connectedSegments[connectedSegments.length - 1]);

  const wrapper = doc.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = highlightId;

  try {
    const fragment = mergeRange.extractContents();
    wrapper.appendChild(fragment);
    flattenNestedHighlightMarks(wrapper);
    mergeRange.insertNode(wrapper);
    mergeRange.detach?.();
    return [wrapper];
  } catch (error) {
    console.warn('[ReaderHighlightManager] Failed to merge highlight segments:', error);
    mergeRange.detach?.();
    return connectedSegments;
  }
}

function isSafeToMergeSegments(doc: Document, segments: HTMLElement[]): boolean {
  const probeRange = doc.createRange();
  probeRange.setStartBefore(segments[0]);
  probeRange.setEndAfter(segments[segments.length - 1]);
  const fragment = probeRange.cloneContents();
  probeRange.detach?.();

  return !hasMeaningfulNonHighlightContent(fragment);
}

function hasMeaningfulNonHighlightContent(node: Node, insideHighlight = false): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return !insideHighlight && Boolean(node.textContent?.trim());
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return false;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
  const nextInsideHighlight =
    insideHighlight ||
    (element?.tagName === 'MARK' && element.classList.contains('aiob-reader-highlight'));

  if (
    element &&
    !nextInsideHighlight &&
    !element.childNodes.length &&
    ['IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'BR', 'HR', 'IFRAME'].includes(element.tagName)
  ) {
    return true;
  }

  for (const child of Array.from(node.childNodes)) {
    if (hasMeaningfulNonHighlightContent(child, nextInsideHighlight)) {
      return true;
    }
  }

  return false;
}

function findBlockContainer(element: HTMLElement | null): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current) {
    if (BLOCK_LEVEL_TAGS.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function flattenNestedHighlightMarks(wrapper: HTMLElement): void {
  const nestedMarks = Array.from(
    wrapper.querySelectorAll<HTMLElement>('mark.aiob-reader-highlight')
  );
  for (const nested of nestedMarks) {
    if (nested === wrapper) {
      continue;
    }
    const parent = nested.parentNode;
    if (!parent) {
      continue;
    }
    while (nested.firstChild) {
      parent.insertBefore(nested.firstChild, nested);
    }
    parent.removeChild(nested);
  }
}
