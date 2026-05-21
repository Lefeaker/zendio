export function resolveContextRange(selectionOrRange?: Selection | Range | null): Range | null {
  if (!selectionOrRange) {
    return null;
  }

  if ('rangeCount' in selectionOrRange) {
    if (selectionOrRange.rangeCount === 0) {
      return null;
    }
    return selectionOrRange.getRangeAt(0).cloneRange();
  }

  return selectionOrRange.cloneRange ? selectionOrRange.cloneRange() : selectionOrRange;
}

export function collectListPath(range: Range): Element[] {
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement || node;
  }

  if (!(node instanceof Element)) {
    return [];
  }

  const currentLi = node.closest('li');
  if (!currentLi) {
    return [];
  }

  const path: Element[] = [];
  let cursor: Element | null = currentLi;
  while (cursor) {
    path.unshift(cursor);
    const parentLi: Element | null = cursor.parentElement
      ? cursor.parentElement.closest('li')
      : null;
    cursor = parentLi || null;
  }
  return path;
}

export function findPreviousBlockElement(range: Range): Element | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  if (!(node instanceof Element)) {
    return null;
  }

  let cursor: Element | null = node;
  while (cursor && cursor !== document.body) {
    if (cursor.previousElementSibling) {
      return cursor.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return null;
}

export function getCleanTextContent(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove());
  return clone.textContent || '';
}
