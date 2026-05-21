export function unwrapNode(node: HTMLElement): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

export function shouldUnwrapInlineElement(element: HTMLElement): boolean {
  if (element.tagName === 'MARK') {
    return true;
  }
  if (element.tagName === 'SPAN' && !element.getAttributeNames().length) {
    return true;
  }
  return false;
}

export function stripInlineFormattingBetweenTokens(startToken: Node, endToken: Node): void {
  let current: Node | null = startToken.nextSibling;
  while (current && current !== endToken) {
    const next = current.nextSibling;
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      shouldUnwrapInlineElement(current as HTMLElement)
    ) {
      unwrapNode(current as HTMLElement);
    }
    current = next;
  }
}

export function inferReaderSegmentRole(
  element: HTMLElement
): 'single' | 'start' | 'middle' | 'end' {
  const explicitRole = element.dataset.readerSegmentRole;
  if (
    explicitRole === 'single' ||
    explicitRole === 'start' ||
    explicitRole === 'middle' ||
    explicitRole === 'end'
  ) {
    return explicitRole;
  }

  const highlightId = element.dataset.readerHighlightId;
  const segmentIndex = Number.parseInt(element.dataset.segmentIndex ?? '', 10);
  if (!highlightId || Number.isNaN(segmentIndex)) {
    return 'single';
  }

  const hasMatchingSibling = (
    sibling: Element | null,
    direction: 'previousElementSibling' | 'nextElementSibling'
  ): boolean => {
    let current = sibling;
    while (current) {
      if (current instanceof HTMLElement && current.tagName === 'MARK') {
        return current.dataset.readerHighlightId === highlightId;
      }
      current = current[direction];
    }
    return false;
  };

  const hasPrevious = hasMatchingSibling(element.previousElementSibling, 'previousElementSibling');
  const hasNext = hasMatchingSibling(element.nextElementSibling, 'nextElementSibling');

  if (hasPrevious && hasNext) {
    return 'middle';
  }
  if (hasPrevious) {
    return 'end';
  }
  if (hasNext) {
    return 'start';
  }
  return 'single';
}
