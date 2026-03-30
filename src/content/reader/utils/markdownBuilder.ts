import { Readability } from '@mozilla/readability';
import { preprocessDocument } from '@third-party/obsidian-clipper/domPrep';
import { createClipperTurndown } from '../../clipper/shared/turndownFactory';
import {
  highlightMarkdownBlock,
  normalizeListBullets,
  cleanBulletArtifacts,
  ensureLeadingBullet,
  appendFootnoteRef,
  appendLocatorLink,
  buildFootnote,
  ensureListWrapped
} from '../../clipper/utils/markdown';
import { generateClipperTitle, formatDateTime } from '../../clipper/utils/datetime';
import type { ClipPayload } from '@shared/types/clip';
import { generateYamlFrontMatter } from '@shared/utils/yamlGenerator';

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

export interface ReaderHighlightInput {
  id?: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  footnoteIndex?: number;
}

export interface ReaderMarkdownParams {
  pageTitle: string;
  pageUrl: string;
  highlights: ReaderHighlightInput[];
}

export interface ReaderFullMarkdownParams extends ReaderMarkdownParams {
  documentClone: Document;
}

export interface ReaderMarkdownPayload extends ClipPayload {}

interface HighlightSectionResult {
  body: string;
  footnotes: string[];
}

export function buildReaderHighlightsMarkdown(params: ReaderMarkdownParams): ReaderMarkdownPayload {
  const { pageTitle, pageUrl, highlights } = params;
  const now = new Date();
  const clippedAt = formatDateTime(now);
  const clipTitle = generateClipperTitle(pageTitle, now);

  const { body, footnotes } = buildHighlightSection(pageUrl, highlights, {
    includeFragmentLinks: true
  });
  const domain = deriveDomain(pageUrl);
  const normalizedDomain = domain === 'unknown' ? undefined : domain;
  const frontMatter = generateYamlFrontMatter(
    'clipper',
    {
      type: 'clipper',
      title: pageTitle,
      url: pageUrl,
      clipped_at: clippedAt,
      highlight_count: highlights.length,
      export_mode: 'highlights',
      tags: ['clipping', 'reading'],
      ...(normalizedDomain !== undefined && { domain: normalizedDomain })
    },
    {
      ...(normalizedDomain !== undefined && { domain: normalizedDomain })
    }
  );

  let markdown = `${frontMatter}\n\n${body}`;

  if (footnotes.length) {
    markdown += `\n\n${footnotes.join('\n\n')}`;
  }

  const commentCount = highlights.filter((h) => h.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map((h) => h.fragmentUrl),
      clippedAtISO: clippedAt,
      readerMode: true,
      exportMode: 'highlights'
    }
  };
}

export function buildReaderFullMarkdown(params: ReaderFullMarkdownParams): ReaderMarkdownPayload {
  const { pageTitle, pageUrl, highlights, documentClone } = params;
  const now = new Date();
  const clippedAt = formatDateTime(now);
  const clipTitle = generateClipperTitle(pageTitle, now);

  const { footnotes } = buildHighlightSection(pageUrl, highlights);

  // Remove UI artifacts from clone before processing
  documentClone.getElementById('aiob-reader-panel')?.remove();
  documentClone.getElementById('obsidian-clipper-dialog')?.remove();

  const prepared = preprocessDocument(documentClone, pageUrl);
  const readable = new Readability(prepared).parse();
  const articleHost = documentClone.implementation.createHTMLDocument('');
  articleHost.body.innerHTML = readable?.content || documentClone.body.innerHTML;
  normalizeHighlightSegments(articleHost, highlights);
  const articleHtml = articleHost.body.innerHTML;

  const turndown = createClipperTurndown(pageUrl);
  turndown.addRule('readerHighlightMark', {
    filter: (node: HTMLElement) =>
      node.nodeName === 'MARK' && node.classList.contains('aiob-reader-highlight'),
    replacement: (content: string, node: Node) => {
      // Cast to HTMLElement to access dataset property
      const element = node as HTMLElement;
      const role = inferReaderSegmentRole(element);
      const index = element.dataset.readerFootnote;
      const inner = content.trim();
      if (!inner) {
        return content;
      }
      const leading = content.match(/^\s*/)?.[0] ?? '';
      const trailing = content.match(/\s*$/)?.[0] ?? '';
      let highlighted: string;
      switch (role) {
        case 'start':
          highlighted = `==${inner}`;
          break;
        case 'middle':
          highlighted = inner;
          break;
        case 'end':
          highlighted = `${inner}==`;
          if (index) {
            highlighted += `[^${index}]`;
          }
          break;
        default:
          highlighted = `==${inner}==`;
          if (index) {
            highlighted += `[^${index}]`;
          }
          break;
      }
      return `${leading}${highlighted}${trailing}`;
    }
  });

  let articleMarkdown = turndown.turndown(articleHtml).trim();
  articleMarkdown = applyHighlightTokens(articleMarkdown);

  const domain = deriveDomain(pageUrl);
  const normalizedDomain = domain === 'unknown' ? undefined : domain;
  const frontMatter = generateYamlFrontMatter(
    'clipper',
    {
      type: 'clipper',
      title: pageTitle,
      url: pageUrl,
      clipped_at: clippedAt,
      highlight_count: highlights.length,
      export_mode: 'full',
      tags: ['clipping', 'reading'],
      ...(normalizedDomain !== undefined && { domain: normalizedDomain })
    },
    {
      ...(normalizedDomain !== undefined && { domain: normalizedDomain })
    }
  );

  let markdown = `${frontMatter}\n\n${articleMarkdown}`;

  if (footnotes.length) {
    markdown += `\n\n${footnotes.join('\n\n')}`;
  }

  const commentCount = highlights.filter((h) => h.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map((h) => h.fragmentUrl),
      clippedAtISO: clippedAt,
      readerMode: true,
      exportMode: 'full'
    }
  };
}

function buildHighlightSection(
  pageUrl: string,
  highlights: ReaderHighlightInput[],
  options: { includeFragmentLinks?: boolean } = {}
): HighlightSectionResult {
  const highlightBlocks: string[] = [];
  const footnotes: string[] = [];
  const { includeFragmentLinks = false } = options;
  const turndown = createClipperTurndown(pageUrl);

  for (const highlight of highlights) {
    const normalizedText = highlight.selectedText.replace(/\s+/g, ' ').trim();
    let highlighted: string;

    if (normalizedText) {
      highlighted = `- ==${normalizedText}==`;
    } else {
      const markdown = turndown.turndown(ensureListWrapped(highlight.selectedHtml));
      highlighted = highlightMarkdownBlock(markdown);
      highlighted = ensureLeadingBullet(cleanBulletArtifacts(normalizeListBullets(highlighted)));
    }

    if (highlight.comment && highlight.footnoteIndex) {
      const footnote = buildFootnote(highlight.comment, highlight.footnoteIndex);
      highlighted = appendFootnoteRef(highlighted, footnote.ref);
      if (footnote.definition) {
        footnotes.push(footnote.definition);
      }
    }

    if (includeFragmentLinks && highlight.fragmentUrl) {
      highlighted = appendLocatorLink(highlighted, highlight.fragmentUrl);
    }

    highlighted = applyHighlightTokens(highlighted);
    highlightBlocks.push(highlighted);
  }

  return {
    body: highlightBlocks.join('\n\n'),
    footnotes
  };
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function normalizeHighlightSegments(doc: Document, highlights: ReaderHighlightInput[]): void {
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

function resolveCommonAncestor(a: Node, b: Node): Element | null {
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

function findBlockContainer(segment: HTMLElement): Element | null {
  let current: HTMLElement | null = segment.parentElement;
  while (current) {
    if (BLOCK_LEVEL_TAGS.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function liftToAncestorChild(ancestor: Element, node: Node): Node {
  let current: Node = node;
  while (current.parentNode && current.parentNode !== ancestor) {
    current = current.parentNode;
  }
  return current;
}

function unwrapNode(node: HTMLElement): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function applyHighlightTokens(markdown: string): string {
  const unescaped = markdown.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\_/g, '_');

  const processedStart = unescaped.replace(/\[\[AIIOB_HL:[^\]:]+:S\]\]\s*/g, '==');

  const processedEnd = processedStart.replace(
    /\s*\[\[AIIOB_HL:[^\]:]+:E(?::(\d+))?\]\]/g,
    (_match, footnote?: string) => {
      return footnote ? `==[^${footnote}]` : '==';
    }
  );

  return processedEnd;
}

function stripInlineFormattingBetweenTokens(startToken: Node, endToken: Node): void {
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

function shouldUnwrapInlineElement(element: HTMLElement): boolean {
  if (element.tagName === 'MARK') {
    return true;
  }
  if (element.tagName === 'SPAN' && !element.getAttributeNames().length) {
    return true;
  }
  return false;
}

function inferReaderSegmentRole(element: HTMLElement): 'single' | 'start' | 'middle' | 'end' {
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

export const __readerMarkdownBuilderTestUtils = {
  deriveDomain,
  normalizeHighlightSegments,
  resolveCommonAncestor,
  findBlockContainer,
  liftToAncestorChild,
  unwrapNode,
  applyHighlightTokens,
  stripInlineFormattingBetweenTokens,
  shouldUnwrapInlineElement,
  inferReaderSegmentRole
};
