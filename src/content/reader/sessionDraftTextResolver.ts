type TextSegment = { node: Text; start: number; end: number };

export function createExactTextRangeResolver(
  doc: Document
): (selectedText: string) => Range | null {
  const { fullText, segments } = collectTextSegments(doc);
  const claimedSpans: Array<{ start: number; end: number }> = [];

  return (selectedText: string): Range | null => {
    if (!selectedText) {
      return null;
    }

    let searchIndex = 0;
    while (searchIndex <= fullText.length) {
      const start = fullText.indexOf(selectedText, searchIndex);
      if (start === -1) {
        return null;
      }
      const end = start + selectedText.length;
      searchIndex = start + Math.max(selectedText.length, 1);

      if (claimedSpans.some((span) => start < span.end && end > span.start)) {
        continue;
      }

      const range = createRangeFromOffsets(doc, segments, start, end);
      if (!range) {
        continue;
      }
      if (range.toString() !== selectedText) {
        range.detach?.();
        continue;
      }

      claimedSpans.push({ start, end });
      return range;
    }

    return null;
  };
}

export function collectTextSegments(doc: Document): { fullText: string; segments: TextSegment[] } {
  const root = doc.body ?? doc.documentElement;
  if (!root) {
    return { fullText: '', segments: [] };
  }

  const segments: TextSegment[] = [];
  let fullText = '';
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || node.data.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const start = fullText.length;
    fullText += node.data;
    segments.push({ node, start, end: fullText.length });
    current = walker.nextNode();
  }

  return { fullText, segments };
}

export function createRangeFromOffsets(
  doc: Document,
  segments: TextSegment[],
  start: number,
  end: number
): Range | null {
  const startPosition = locateTextPosition(segments, start);
  const endPosition = locateTextPosition(segments, end);
  if (!startPosition || !endPosition) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return range;
}

export function locateTextPosition(
  segments: TextSegment[],
  absoluteOffset: number
): { node: Text; offset: number } | null {
  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    if (absoluteOffset < segment.end) {
      return {
        node: segment.node,
        offset: absoluteOffset - segment.start
      };
    }
    if (absoluteOffset === segment.end) {
      return {
        node: segment.node,
        offset: segment.node.data.length
      };
    }
  }

  return null;
}
