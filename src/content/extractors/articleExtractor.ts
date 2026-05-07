import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import { applyObsidianRules } from '../../third_party/obsidian-clipper/markdownRules';
import { preprocessDocument } from '../../third_party/obsidian-clipper/domPrep';
import { formatDateTime } from '../clipper/utils/datetime';
import { DISALLOWED_URL_PROTOCOLS, hasDisallowedProtocol, tryParseUrl } from '../../shared/url';
import { generateYamlFrontMatter } from '../../shared/utils/yamlGenerator';
import type { ContentExtractor, ExtractionContext } from './types';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ARTICLE_ROOT_SELECTORS = [
  '#js_content.rich_media_content',
  '#js_content',
  'article',
  'main article',
  'main',
  '[role="main"]',
  '.article',
  '.post',
  '.entry-content',
  '.rich_media_content'
] as const;

function resolveArticleRoot(doc: Document): Element | null {
  for (const selector of ARTICLE_ROOT_SELECTORS) {
    const element = doc.querySelector(selector);
    if (!element) {
      continue;
    }
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text.length >= 120 || selector.includes('js_content')) {
      return element;
    }
  }
  return null;
}

function createFocusedArticleDocument(doc: Document, url: string): Document {
  const focusedRoot = resolveArticleRoot(doc);
  if (!focusedRoot) {
    return doc.cloneNode(true) as Document;
  }

  const nextDoc = doc.implementation.createHTMLDocument(doc.title || '');
  const base = nextDoc.createElement('base');
  base.href = doc.baseURI || url;
  nextDoc.head.append(base);

  const title = nextDoc.createElement('title');
  title.textContent = doc.title || '';
  nextDoc.head.append(title);

  nextDoc.body.append(focusedRoot.cloneNode(true));
  return nextDoc;
}

function sanitizeFallbackHtml(preparedDoc: Document): string {
  const removeSelectors = ['script', 'style', 'noscript', 'template'];
  removeSelectors.forEach((selector) => {
    preparedDoc.querySelectorAll(selector).forEach((node) => node.remove());
  });

  const elements = preparedDoc.querySelectorAll<HTMLElement>('*');
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attr.name);
        return;
      }

      if ((name === 'href' || name === 'src') && attr.value) {
        if (
          hasDisallowedProtocol(
            attr.value,
            preparedDoc.baseURI ?? undefined,
            DISALLOWED_URL_PROTOCOLS
          )
        ) {
          element.removeAttribute(attr.name);
        }
      }
    });
  });

  return preparedDoc.body?.innerHTML?.trim() ?? '';
}

function resolveMarkdown(context: ExtractionContext, timestamp: Date) {
  const { document: doc, url } = context;
  const originalBaseUri = doc.baseURI ?? undefined;
  const extractionDoc = createFocusedArticleDocument(doc, url);
  const cloned = preprocessDocument(extractionDoc, url);
  const baseUrl = tryParseUrl(url, originalBaseUri);
  const rd = new Readability(cloned).parse();

  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });
  applyObsidianRules(turndown);

  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content: string, node: Node) => {
      // Cast to Element to access getAttribute method
      const element = node as Element;
      const src = element.getAttribute('src');
      if (!src) return '';

      const resolvedSrc = (() => {
        if (baseUrl) {
          try {
            const next = new URL(src, baseUrl.href);
            if (DISALLOWED_URL_PROTOCOLS.has(next.protocol)) {
              return '';
            }
            return next.toString();
          } catch {
            // fall through to raw src
          }
        }
        return hasDisallowedProtocol(
          src,
          baseUrl?.href ?? originalBaseUri,
          DISALLOWED_URL_PROTOCOLS
        )
          ? ''
          : src;
      })();

      if (!resolvedSrc) {
        return '';
      }

      const alt = (element.getAttribute('alt') || '').replace(/\|/g, '-');
      return `![${alt}](${resolvedSrc})`;
    }
  });

  const fallbackText = cloned.body?.textContent?.trim() ?? '';
  const contentHtml = rd?.content?.trim() || sanitizeFallbackHtml(cloned);
  const markdownSource =
    contentHtml ||
    (fallbackText ? `<p>${escapeHtml(fallbackText)}</p>` : `<p>${escapeHtml(url)}</p>`);
  const bodyMd = turndown.turndown(markdownSource);

  const rawTitle = rd?.title || doc.title || baseUrl?.hostname || 'Untitled';
  const title = rawTitle.trim();

  const clippedAt = formatDateTime(timestamp);
  const resolvedUrl = baseUrl?.href ?? originalBaseUri ?? '';
  const sourceUrl = url;
  const preferredUrl = resolvedUrl || sourceUrl;
  const domain = baseUrl?.hostname ?? '';
  const frontMatter = generateYamlFrontMatter(
    'article',
    {
      type: 'article',
      title,
      url: preferredUrl,
      sourceUrl,
      resolvedUrl,
      clipped_at: clippedAt,
      tags: ['clipping'],
      domain
    },
    { domain }
  );

  return {
    title,
    markdown: `${frontMatter}\n\n${bodyMd}\n`,
    meta: {
      url: preferredUrl,
      domain,
      sourceUrl,
      resolvedUrl,
      clippedAtISO: clippedAt
    }
  };
}

export interface ArticleExtractorDeps {
  now(): Date;
}

export const createArticleExtractor = (deps?: Partial<ArticleExtractorDeps>): ContentExtractor => {
  const resolvedDeps: ArticleExtractorDeps = {
    now: deps?.now ?? (() => new Date())
  };

  return {
    id: 'article.default',
    priority: 0,
    canHandle(_context: ExtractionContext): Promise<boolean> {
      return Promise.resolve(true);
    },
    extract(context: ExtractionContext) {
      const timestamp = resolvedDeps.now();
      const { title, markdown, meta } = resolveMarkdown(context, timestamp);
      return Promise.resolve({
        type: 'article' as const,
        title,
        markdown,
        meta
      });
    }
  };
};

const defaultArticleExtractor = createArticleExtractor();

export async function extractArticle(doc: Document, url: string) {
  return defaultArticleExtractor.extract({ document: doc, url });
}
