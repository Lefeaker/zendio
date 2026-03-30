export function resolveBilibiliRichTextContainer(root: ShadowRoot): HTMLElement | null {
  const selectors = [
    '.rich-text-content',
    '#contents',
    '[id="contents"]',
    '.content',
    '.rich-text'
  ];
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
  }

  const firstChild = Array.from(root.children).find((element) => {
    const tag = element.tagName.toLowerCase();
    return tag !== 'style' && tag !== 'script' && tag !== 'template';
  });
  return firstChild instanceof HTMLElement ? firstChild : null;
}

export function parseBilibiliDataContent(
  raw: string,
  escapeHtml: (value: string) => string
): { text: string; html: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const extractedFromJson = tryParseBilibiliContentJson(trimmed);
  const text = (extractedFromJson || trimmed).replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  return { text, html: escapeHtml(text) };
}

function tryParseBilibiliContentJson(raw: string): string | null {
  if (!raw || (raw[0] !== '{' && raw[0] !== '[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const flattened = flattenBilibiliContentNode(parsed).trim();
    return flattened || null;
  } catch {
    return null;
  }
}

export function flattenBilibiliContentNode(node: unknown): string {
  if (node == null) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => flattenBilibiliContentNode(item)).join('');
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) return record.text;
    if (typeof record.raw_text === 'string' && record.raw_text.trim()) return record.raw_text;
    if (typeof record.content === 'string' && record.content.trim()) return record.content;
    if (typeof record.display_text === 'string' && record.display_text.trim())
      return record.display_text;
    if (typeof record.name === 'string' && record.name.trim()) {
      const type = typeof record.type === 'string' ? record.type.toLowerCase() : '';
      if (type.includes('mention') || type === 'at') {
        return record.name.startsWith('@') ? record.name : `@${record.name}`;
      }
    }
    if (Array.isArray(record.rich_text_nodes)) {
      return (record.rich_text_nodes as unknown[])
        .map((item) => flattenBilibiliContentNode(item))
        .join('');
    }
    if (Array.isArray(record.ops)) {
      return (record.ops as unknown[])
        .map((item) => {
          if (item && typeof item === 'object' && 'insert' in (item as Record<string, unknown>)) {
            return flattenBilibiliContentNode((item as Record<string, unknown>).insert);
          }
          return flattenBilibiliContentNode(item);
        })
        .join('');
    }
  }
  return '';
}

export function serializeBilibiliRichTextFragment(
  root: Element | ShadowRoot,
  escapeHtml: (value: string) => string
): { text: string; html: string } {
  const textParts: string[] = [];
  const htmlParts: string[] = [];

  const append = (raw: string | null | undefined, htmlOverride?: string) => {
    if (raw == null) {
      return;
    }
    if (raw.trim().length === 0) {
      if (raw.length > 0) {
        textParts.push(' ');
        htmlParts.push(' ');
      }
      return;
    }
    textParts.push(raw);
    htmlParts.push(htmlOverride ?? escapeHtml(raw));
  };

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent);
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    if (tagName === 'style' || tagName === 'script' || tagName === 'template') {
      return;
    }

    if (tagName === 'bili-emoji') {
      const emojiText =
        node.getAttribute('data-emoji') ||
        node.getAttribute('alt') ||
        node.getAttribute('title') ||
        findNestedImageAlt(node) ||
        node.textContent ||
        '';
      if (emojiText) {
        const escaped = escapeHtml(emojiText);
        append(
          emojiText,
          `<span data-aiob-fragment="emoji" data-emoji="${escaped}">${escaped}</span>`
        );
      }
      return;
    }

    if (tagName === 'img') {
      const alt =
        node.getAttribute('data-emoji') ||
        node.getAttribute('alt') ||
        node.getAttribute('title') ||
        node.getAttribute('aria-label') ||
        '';
      if (alt) {
        const escaped = escapeHtml(alt);
        append(alt, `<span data-aiob-fragment="emoji" data-emoji="${escaped}">${escaped}</span>`);
        return;
      }
    }

    if (tagName === 'bili-at' || node.matches('.reply-target, .at-user')) {
      const mentionText =
        node.getAttribute('data-user-name') ||
        node.getAttribute('data-name') ||
        node.getAttribute('data-text') ||
        node.textContent ||
        '';
      if (mentionText) {
        const normalized = mentionText.startsWith('@') ? mentionText : `@${mentionText}`;
        append(normalized, `<span data-aiob-fragment="mention">${escapeHtml(normalized)}</span>`);
      }
      return;
    }

    if (tagName === 'bili-link' || tagName === 'a') {
      const hrefRaw =
        node.getAttribute('href') ||
        node.getAttribute('data-href') ||
        node.getAttribute('data-url') ||
        node.getAttribute('data-uri') ||
        '';
      const href = hrefRaw.trim();
      const linkText =
        node.getAttribute('data-title') || node.getAttribute('title') || node.textContent || href;
      if (linkText) {
        const normalized = linkText.trim();
        if (normalized) {
          const escapedText = escapeHtml(normalized);
          const html = href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapedText}</a>`
            : escapedText;
          append(normalized, html);
        }
      }
      return;
    }

    if (tagName === 'bili-dyn-content') {
      Array.from(node.childNodes).forEach((child) => walk(child));
      return;
    }

    if (node.matches('.text-node') || node.childNodes.length === 0) {
      append(node.textContent);
      return;
    }

    Array.from(node.childNodes).forEach((child) => walk(child));
  };

  Array.from(root.childNodes).forEach((child) => walk(child));

  const combined = textParts.join('');
  return {
    text: combined.replace(/\s+/g, ' ').trim(),
    html: htmlParts.join('')
  };
}

function findNestedImageAlt(node: Element): string | null {
  const shadowImage = node.shadowRoot?.querySelector('img');
  if (shadowImage?.getAttribute('alt')) {
    return shadowImage.getAttribute('alt');
  }

  const lightDomImage = node.getElementsByTagName('img')[0];
  if (lightDomImage?.getAttribute('alt')) {
    return lightDomImage.getAttribute('alt');
  }

  return null;
}
