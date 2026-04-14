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

export function resolveCommonAncestor(a: Node, b: Node): Element | null {
  const ancestors = new Set<Node>();
  let current: Node | null = a;
  while (current) {
    ancestors.add(current);
    current = current.parentNode;
  }
  current = b;
  while (current) {
    if (ancestors.has(current)) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        return current as Element;
      }
      return current.parentElement;
    }
    current = current.parentNode;
  }
  return null;
}

export function findBlockContainer(segment: HTMLElement): Element | null {
  let current: HTMLElement | null = segment.parentElement;
  while (current) {
    if (BLOCK_LEVEL_TAGS.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function liftToAncestorChild(ancestor: Element, node: Node): Node {
  let current: Node = node;
  while (current.parentNode && current.parentNode !== ancestor) {
    current = current.parentNode;
  }
  return current;
}
