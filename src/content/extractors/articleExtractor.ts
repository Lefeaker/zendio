import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import { applyObsidianRules } from '../../third_party/obsidian-clipper/markdownRules';
import { preprocessDocument } from '../../third_party/obsidian-clipper/domPrep';
import { escapeQuotes } from '../shared/markdown';
import { formatDateTime } from '../clipper/utils/datetime';

interface ParsedUrl {
  href: string;
  hostname: string;
}

function tryParseUrl(rawUrl: string, fallback?: string): ParsedUrl | undefined {
  const candidates = [rawUrl, fallback].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      return { href: parsed.href, hostname: parsed.hostname };
    } catch {
      // ignore and continue trying
    }
  }
  return undefined;
}

function sanitizeFallbackHtml(doc: Document): string {
  const clone = doc.cloneNode(true) as Document;
  const removeSelectors = ['script', 'style', 'noscript', 'template'];
  removeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  });
  return clone.body?.innerHTML?.trim() ?? '';
}

export async function extractArticle(doc: Document, url: string) {
  const cloned = preprocessDocument(doc.cloneNode(true) as Document, url);
  const baseUrl = tryParseUrl(url, doc.baseURI ?? undefined);
  const rd = new Readability(cloned).parse();

  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });
  applyObsidianRules(turndown);

  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content, node: any) => {
      const src = node.getAttribute('src');
      if (!src) return '';

      let abs = src;
      if (baseUrl) {
        try {
          abs = new URL(src, baseUrl.href).toString();
        } catch {
          abs = src;
        }
      }

      const alt = (node.getAttribute('alt') || '').replace(/\|/g, '-');
      return `![${alt}](${abs})`;
    }
  });

  const fallbackHtml = sanitizeFallbackHtml(cloned);
  const contentHtml = rd?.content?.trim() || fallbackHtml;
  const bodyMd = turndown.turndown(contentHtml);

  const rawTitle = rd?.title || doc.title || baseUrl?.hostname || 'Untitled';
  const title = rawTitle.trim();

  const clippedAt = formatDateTime(new Date());
  const frontMatter = `---\ntype: article\ntitle: "${escapeQuotes(title)}"\nurl: "${url}"\nclipped_at: "${clippedAt}"\ntags: [clipping]\n---`;

  return {
    type: 'article',
    title,
    markdown: `${frontMatter}\n\n${bodyMd}\n`,
    meta: {
      url,
      domain: baseUrl?.hostname ?? '',
      clippedAtISO: clippedAt
    }
  };
}
