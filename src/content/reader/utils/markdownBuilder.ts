import { Readability } from '@mozilla/readability';
import { preprocessDocument } from '../../../third_party/obsidian-clipper/domPrep';
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
import { escapeQuotes } from '../../shared/markdown';
import type { ClipPayload } from '../../../shared/types/clip';

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

  const { body, footnotes } = buildHighlightSection(pageUrl, highlights, { includeFragmentLinks: true });

  let markdown = `---\n` +
    `type: clipper\n` +
    `title: "${escapeQuotes(pageTitle)}"\n` +
    `url: "${pageUrl}"\n` +
    `clipped_at: "${clippedAt}"\n` +
    `highlight_count: ${highlights.length}\n` +
    `export_mode: highlights\n` +
    `tags: [clipping, reading]\n` +
    `---\n\n` +
    body;

  if (footnotes.length) {
    markdown += `\n\n${footnotes.join('\n\n')}`;
  }

  const domain = deriveDomain(pageUrl);
  const commentCount = highlights.filter(h => h.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map(h => h.fragmentUrl),
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
  const articleHtml = readable?.content || documentClone.body.innerHTML;

  const turndown = createClipperTurndown(pageUrl);
  turndown.addRule('readerHighlightMark', {
    filter: (node: HTMLElement) => node.nodeName === 'MARK' && node.classList.contains('aiob-reader-highlight'),
    replacement: (content: string, node: HTMLElement) => {
      const index = node.dataset.readerFootnote;
      const inner = content.trim();
      if (!inner) {
        return content;
      }
      const leading = content.match(/^\s*/)?.[0] ?? '';
      const trailing = content.match(/\s*$/)?.[0] ?? '';
      let highlighted = `==${inner}==`;
      if (index) {
        highlighted += `[^${index}]`;
      }
      return `${leading}${highlighted}${trailing}`;
    }
  });

  let articleMarkdown = turndown.turndown(articleHtml).trim();

  const footnoteOrder = highlights
    .filter((h) => typeof h.footnoteIndex === 'number')
    .map((h) => h.footnoteIndex as number);

  if (footnoteOrder.length) {
    let cursor = 0;
    articleMarkdown = articleMarkdown.replace(/==(.*?)==(\[\^\d+\])?/gs, (match, inner, existing) => {
      if (existing) {
        cursor += 1;
        return match;
      }
      if (cursor >= footnoteOrder.length) {
        return match;
      }
      const index = footnoteOrder[cursor++];
      return `==${inner}==[^${index}]`;
    });
  }

  let markdown = `---\n` +
    `type: clipper\n` +
    `title: "${escapeQuotes(pageTitle)}"\n` +
    `url: "${pageUrl}"\n` +
    `clipped_at: "${clippedAt}"\n` +
    `highlight_count: ${highlights.length}\n` +
    `export_mode: full\n` +
    `tags: [clipping, reading]\n` +
    `---\n\n`;

  markdown += articleMarkdown;

  if (footnotes.length) {
    markdown += `\n\n${footnotes.join('\n\n')}`;
  }

  const domain = deriveDomain(pageUrl);
  const commentCount = highlights.filter(h => h.comment).length;

  return {
    type: 'clipper',
    title: clipTitle,
    markdown,
    meta: {
      url: pageUrl,
      domain,
      highlightCount: highlights.length,
      commentCount,
      fragmentUrls: highlights.map(h => h.fragmentUrl),
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
  const turndown = createClipperTurndown(pageUrl);
  const highlightBlocks: string[] = [];
  const footnotes: string[] = [];
  const { includeFragmentLinks = false } = options;

  for (const highlight of highlights) {
    const markdown = turndown.turndown(ensureListWrapped(highlight.selectedHtml));
    let highlighted = highlightMarkdownBlock(markdown);
    highlighted = ensureLeadingBullet(cleanBulletArtifacts(normalizeListBullets(highlighted)));

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
