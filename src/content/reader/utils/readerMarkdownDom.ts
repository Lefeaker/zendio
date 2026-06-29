import {
  findBlockContainer,
  liftToAncestorChild,
  resolveCommonAncestor
} from './readerMarkdownBlockDom';
import {
  inferReaderSegmentRole,
  shouldUnwrapInlineElement,
  stripInlineFormattingBetweenTokens,
  unwrapNode
} from './readerMarkdownInlineDom';

interface ReaderHighlightSegmentInput {
  id?: string;
  footnoteIndex?: number;
  selectedHtml?: string;
  selectedText?: string;
  comment?: string;
  fragmentUrl?: string;
}

export function normalizeHighlightSegments(
  doc: Document,
  highlights: ReaderHighlightSegmentInput[]
): void {
  const processed = new Set<string>();
  for (const highlight of highlights) {
    const id = highlight.id;
    if (!id || processed.has(id)) {
      continue;
    }
    processed.add(id);
    const segments = Array.from(
      doc.querySelectorAll<HTMLElement>(
        `mark.aiob-reader-highlight[data-reader-highlight-id="${id}"]`
      )
    );
    if (!segments.length) {
      continue;
    }
    segments.sort((a, b) => {
      if (a === b) {
        return 0;
      }
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const container = resolveCommonAncestor(firstSegment, lastSegment) ?? doc.body;
    const groups: Array<{ container: Element; segments: HTMLElement[] }> = [];
    for (const segment of segments) {
      const block = findBlockContainer(segment) ?? container;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.container === block) {
        lastGroup.segments.push(segment);
      } else {
        groups.push({
          container: block,
          segments: [segment]
        });
      }
    }

    const tokenPairs: Array<{ start: Text; end: Text }> = [];

    groups.forEach((group, index) => {
      const tokenId = groups.length > 1 ? `${id}__${index}` : id;
      const groupFirst = group.segments[0];
      const groupLast = group.segments[group.segments.length - 1];
      const groupStartAnchor = liftToAncestorChild(group.container, groupFirst);
      const groupEndAnchor = liftToAncestorChild(group.container, groupLast);

      const startToken = doc.createTextNode(`[[AIIOB_HL:${tokenId}:S]]`);
      group.container.insertBefore(startToken, groupStartAnchor);

      const needsFootnote = highlight.footnoteIndex !== undefined && index === groups.length - 1;
      const endTokenValue = needsFootnote
        ? `[[AIIOB_HL:${tokenId}:E:${highlight.footnoteIndex}]]`
        : `[[AIIOB_HL:${tokenId}:E]]`;
      const endToken = doc.createTextNode(endTokenValue);
      if (groupEndAnchor.nextSibling) {
        group.container.insertBefore(endToken, groupEndAnchor.nextSibling);
      } else {
        group.container.appendChild(endToken);
      }

      tokenPairs.push({ start: startToken, end: endToken });
    });

    segments.forEach((segment, index) => {
      segment.dataset.segmentIndex = String(index);
      const role =
        segments.length === 1
          ? 'single'
          : index === 0
            ? 'start'
            : index === segments.length - 1
              ? 'end'
              : 'middle';
      segment.dataset.readerSegmentRole = role;
      if (highlight.footnoteIndex !== undefined && (role === 'end' || role === 'single')) {
        segment.dataset.readerFootnote = String(highlight.footnoteIndex);
      } else {
        delete segment.dataset.readerFootnote;
      }

      unwrapNode(segment);
    });

    for (const pair of tokenPairs) {
      stripInlineFormattingBetweenTokens(pair.start, pair.end);
    }
  }
}

export function replaceDocumentBodyWithParsedHtml(targetDocument: Document, html: string): void {
  const Parser = targetDocument.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(html, 'text/html');
  const nodes = Array.from(parsed.body.childNodes, (node) => targetDocument.importNode(node, true));
  targetDocument.body.replaceChildren(...nodes);
}

export {
  resolveCommonAncestor,
  findBlockContainer,
  liftToAncestorChild,
  unwrapNode,
  stripInlineFormattingBetweenTokens,
  shouldUnwrapInlineElement,
  inferReaderSegmentRole
};
