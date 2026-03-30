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

function sanitizeFallbackHtml(doc: Document): string {
  const clone = doc.cloneNode(true) as Document;
  const removeSelectors = ['script', 'style', 'noscript', 'template'];
  removeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  });

  const elements = clone.querySelectorAll<HTMLElement>('*');
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attr.name);
        return;
      }

      if ((name === 'href' || name === 'src') && attr.value) {
        if (hasDisallowedProtocol(attr.value, doc.baseURI ?? undefined, DISALLOWED_URL_PROTOCOLS)) {
          element.removeAttribute(attr.name);
        }
      }
    });
  });

  return clone.body?.innerHTML?.trim() ?? '';
}

function resolveMarkdown(context: ExtractionContext, timestamp: Date) {
  const { document: doc, url } = context;
  const originalBaseUri = doc.baseURI ?? undefined;
  const cloned = preprocessDocument(doc.cloneNode(true) as Document, url);
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

  const fallbackText = doc.body?.textContent?.trim() ?? '';
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
