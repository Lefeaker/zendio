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
import {
  findBlockContainer,
  inferReaderSegmentRole,
  liftToAncestorChild,
  normalizeHighlightSegments,
  resolveCommonAncestor,
  shouldUnwrapInlineElement,
  stripInlineFormattingBetweenTokens,
  unwrapNode
} from './readerMarkdownDom';

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

  const commentCount = highlights.filter((highlight) => highlight.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map((highlight) => highlight.fragmentUrl),
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

  const commentCount = highlights.filter((highlight) => highlight.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map((highlight) => highlight.fragmentUrl),
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

function applyHighlightTokens(markdown: string): string {
  const unescaped = markdown.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\_/g, '_');

  const processedStart = unescaped.replace(/\[\[AIIOB_HL:[^\]:]+:S\]\]\s*/g, '==');

  return processedStart.replace(
    /\s*\[\[AIIOB_HL:[^\]:]+:E(?::(\d+))?\]\]/g,
    (_match, footnote?: string) => {
      return footnote ? `==[^${footnote}]` : '==';
    }
  );
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
