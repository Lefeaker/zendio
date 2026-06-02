import { findBilibiliTextRangeAcrossShadowRoots } from './bilibiliShadowSearch';
import {
  buildRangeCoveringBilibiliRichTextHost,
  extractTextFromBilibiliRichTextHost,
  findContainingBilibiliRichTextHost,
  resolveBilibiliRichTextHosts
} from './bilibiliRichTextSelectionDom';
import type { BilibiliSelectionHelpers } from './bilibiliSelectionTypes';

const BILIBILI_SHADOW_HOST_SELECTOR = [
  'bili-comments',
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text',
  'bili-emoji',
  'bili-avatar',
  'bili-at',
  'bili-link',
  'bili-dyn-content'
].join(',');

export function buildBilibiliSearchCandidates(normalized: string): string[] {
  const variants = new Set<string>();
  if (!normalized) {
    return [];
  }
  variants.add(normalized);

  const strippedEmoji = normalized
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (strippedEmoji && !variants.has(strippedEmoji)) {
    variants.add(strippedEmoji);
  }

  return Array.from(variants);
}

export function findBilibiliTextRangeInShadowDOM(
  text: string,
  helpers: BilibiliSelectionHelpers
): Range | null {
  const normalized = helpers.normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }
  return findBilibiliTextRangeAcrossShadowRoots(normalized, helpers);
}

export function extractBilibiliSelection(
  range: Range,
  helpers: BilibiliSelectionHelpers
): { text: string; html: string } | null {
  const hosts = resolveBilibiliRichTextHosts(range);
  if (!hosts.length) {
    return null;
  }

  const textSegments: string[] = [];
  const htmlSegments: string[] = [];

  hosts.forEach((host) => {
    const extracted = extractTextFromBilibiliRichTextHost(host, helpers);
    if (!extracted) {
      return;
    }

    const text = extracted.text.trim();
    const html = extracted.html.trim();
    if (text) {
      textSegments.push(text);
    }
    if (html) {
      htmlSegments.push(html);
    }
  });

  if (!textSegments.length) {
    return null;
  }

  const combinedText = textSegments.join(' ').replace(/\s+/g, ' ').trim();
  const combinedHtml = htmlSegments.length
    ? htmlSegments.map((segment) => `<p>${segment}</p>`).join('')
    : helpers.wrapPlainTextAsHtml(combinedText);

  return {
    text: combinedText,
    html: combinedHtml
  };
}

export function extractBilibiliSelectionFromEvent(
  event: MouseEvent,
  existingRange: Range | null,
  helpers: BilibiliSelectionHelpers
): { text: string; html: string; range?: Range } | null {
  const path = event.composedPath();
  for (const target of path) {
    if (!(target instanceof Node)) {
      continue;
    }
    const host = findContainingBilibiliRichTextHost(target);
    if (!host) {
      continue;
    }
    const extracted = extractTextFromBilibiliRichTextHost(host, helpers);
    if (!extracted || !extracted.text.trim()) {
      continue;
    }
    const range = existingRange ?? buildRangeCoveringBilibiliRichTextHost(host, helpers);
    return range
      ? { text: extracted.text, html: extracted.html, range }
      : { text: extracted.text, html: extracted.html };
  }
  return null;
}

export function queryBilibiliShadowHosts(doc: Document): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  const rootHosts = doc.querySelectorAll<HTMLElement>('bili-comments');
  rootHosts.forEach((host) => {
    hosts.push(host);
    host.shadowRoot
      ?.querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR)
      .forEach((nestedHost) => hosts.push(nestedHost));
  });
  doc
    .querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR)
    .forEach((host) => hosts.push(host));
  return dedupeByIdentity(hosts);
}

export function buildRangeCoveringBilibiliRichText(
  host: HTMLElement,
  helpers: BilibiliSelectionHelpers
): Range | null {
  return buildRangeCoveringBilibiliRichTextHost(host, helpers);
}

function dedupeByIdentity<T extends object>(items: T[]): T[] {
  const seen = new WeakSet<T>();
  return items.filter((item) => {
    if (seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}
