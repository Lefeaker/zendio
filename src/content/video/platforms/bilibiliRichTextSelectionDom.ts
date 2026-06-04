import {
  parseBilibiliDataContent,
  resolveBilibiliRichTextContainer,
  serializeBilibiliRichTextFragment
} from './bilibiliRichText';
import type { BilibiliSelectionHelpers } from './bilibiliSelectionTypes';

export function resolveBilibiliRichTextHosts(range: Range): HTMLElement[] {
  const ordered: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const consider = (node: Node | null) => {
    const rich = findContainingBilibiliRichTextHost(node);
    if (rich && !seen.has(rich)) {
      seen.add(rich);
      ordered.push(rich);
    }
  };

  consider(range.startContainer);
  consider(range.endContainer);
  consider(range.commonAncestorContainer);

  return ordered;
}

export function findContainingBilibiliRichTextHost(node: Node | null): HTMLElement | null {
  const visited = new Set<Node>();
  let current: Node | null = node;

  while (current && !visited.has(current)) {
    visited.add(current);

    if (current instanceof HTMLElement && current.tagName.toLowerCase() === 'bili-rich-text') {
      return current;
    }

    const root =
      current instanceof Element
        ? current.getRootNode()
        : current instanceof Text
          ? (current.parentElement?.getRootNode() ?? null)
          : null;

    if (root instanceof ShadowRoot) {
      const host = root.host as HTMLElement | null;
      if (host?.tagName.toLowerCase() === 'bili-rich-text') {
        return host;
      }
      if (host && !visited.has(host)) {
        current = host;
        continue;
      }
    }

    if (current instanceof Text) {
      current = current.parentElement;
    } else if (current instanceof HTMLElement) {
      current = current.parentElement;
    } else {
      current = null;
    }
  }

  return null;
}

export function extractTextFromBilibiliRichTextHost(
  host: HTMLElement,
  helpers: BilibiliSelectionHelpers
): { text: string; html: string } | null {
  const dataContent = host.getAttribute('data-content');
  if (dataContent && dataContent.trim()) {
    const parsed = parseBilibiliDataContent(dataContent, (value) => helpers.escapeHtml(value));
    if (parsed) {
      return parsed;
    }
  }

  if (host.shadowRoot) {
    const container = resolveBilibiliRichTextContainer(host.shadowRoot);
    const target = container ?? host.shadowRoot;
    const serialized = serializeBilibiliRichTextFragment(target, (value) =>
      helpers.escapeHtml(value)
    );
    if (serialized.text) {
      return serialized;
    }
  }

  const fallback = host.textContent?.trim();
  if (fallback) {
    return {
      text: fallback,
      html: helpers.escapeHtml(fallback)
    };
  }

  return null;
}

export function buildRangeCoveringBilibiliRichTextHost(
  host: HTMLElement,
  helpers: BilibiliSelectionHelpers
): Range | null {
  const target = resolveBilibiliRichTextSearchRoot(host);
  if (!target) {
    return null;
  }

  const textNodes: Text[] = [];
  const walker = helpers.document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (helpers.shouldSkipTextNode(node as Text)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent && node.textContent.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current.textContent && current.textContent.trim()) {
      textNodes.push(current);
    }
    current = walker.nextNode() as Text | null;
  }

  if (!textNodes.length) {
    return null;
  }

  const range = helpers.document.createRange();
  range.setStart(textNodes[0], 0);
  const lastNode = textNodes[textNodes.length - 1];
  range.setEnd(lastNode, lastNode.textContent?.length ?? 0);
  return range;
}

export function resolveBilibiliRichTextSearchRoot(host: HTMLElement): Node {
  const container = host.shadowRoot ? resolveBilibiliRichTextContainer(host.shadowRoot) : null;
  return container ?? host.shadowRoot ?? host;
}
