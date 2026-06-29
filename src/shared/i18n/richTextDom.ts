const ALLOWED_TAGS = new Set(['a', 'br', 'code', 'em', 'span', 'strong']);
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed']);
const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:']);

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"'
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

function stripUnsafeHrefCharacters(rawHref: string): string {
  let result = '';

  for (const character of rawHref.trim()) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x20 || codePoint === 0x7f) {
      continue;
    }
    result += character;
  }

  return result;
}

function sanitizeRichHref(rawHref: string): string | null {
  const normalised = stripUnsafeHrefCharacters(decodeHtmlEntities(rawHref));
  if (normalised.length === 0) {
    return null;
  }

  try {
    const url = new URL(normalised);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? normalised : null;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAttributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrPattern = /([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(source)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name || name.startsWith('on')) {
      continue;
    }
    attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attrs;
}

function appendText(parent: Node, ownerDocument: Document, value: string): void {
  if (value.length > 0) {
    parent.appendChild(ownerDocument.createTextNode(decodeHtmlEntities(value)));
  }
}

function appendAnchor(parent: Node, ownerDocument: Document, attrs: Map<string, string>): Node {
  const safeHref = attrs.has('href') ? sanitizeRichHref(attrs.get('href') ?? '') : null;
  if (!safeHref) {
    return parent;
  }

  const anchor = ownerDocument.createElement('a');
  anchor.href = safeHref;
  const target = attrs.get('target');
  if (target) {
    anchor.target = decodeHtmlEntities(target);
  }

  const relTokens = new Set((decodeHtmlEntities(attrs.get('rel') ?? '') || '').split(/\s+/));
  if ((target ?? '').toLowerCase() === '_blank') {
    relTokens.add('noopener');
    relTokens.add('noreferrer');
  }
  relTokens.delete('');
  if (relTokens.size > 0) {
    anchor.rel = Array.from(relTokens).join(' ');
  }

  parent.appendChild(anchor);
  return anchor;
}

function skipDroppedContent(input: string, tagName: string, tagEnd: number): number {
  const closePattern = new RegExp(`</\\s*${escapeRegExp(tagName)}\\s*>`, 'i');
  const remainder = input.slice(tagEnd + 1);
  const closeMatch = closePattern.exec(remainder);
  return closeMatch ? tagEnd + 1 + closeMatch.index + closeMatch[0].length : tagEnd + 1;
}

export function createSafeRichTextFragment(
  ownerDocument: Document,
  html: string
): DocumentFragment {
  const fragment = ownerDocument.createDocumentFragment();
  const stack: Array<{ node: Node; tagName: string }> = [{ node: fragment, tagName: '#root' }];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) {
      appendText(stack[stack.length - 1].node, ownerDocument, html.slice(index));
      break;
    }

    appendText(stack[stack.length - 1].node, ownerDocument, html.slice(index, tagStart));

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const tagEnd = html.indexOf('>', tagStart + 1);
    if (tagEnd === -1) {
      appendText(stack[stack.length - 1].node, ownerDocument, html.slice(tagStart));
      break;
    }

    const rawTag = html.slice(tagStart + 1, tagEnd).trim();
    const tagMatch = rawTag.match(/^\/?\s*([a-z][\w:-]*)/i);
    if (!tagMatch) {
      index = tagEnd + 1;
      continue;
    }

    const tagName = tagMatch[1].toLowerCase();
    const isClosing = rawTag.startsWith('/');
    const isSelfClosing = /\/\s*$/.test(rawTag);

    if (isClosing) {
      const openIndex = stack.map((item) => item.tagName).lastIndexOf(tagName);
      if (openIndex > 0) {
        stack.length = openIndex;
      }
      index = tagEnd + 1;
      continue;
    }

    if (DROP_CONTENT_TAGS.has(tagName)) {
      index = skipDroppedContent(html, tagName, tagEnd);
      continue;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      index = tagEnd + 1;
      continue;
    }

    const parent = stack[stack.length - 1].node;
    if (tagName === 'br') {
      parent.appendChild(ownerDocument.createElement('br'));
      index = tagEnd + 1;
      continue;
    }

    const attrsSource = rawTag.slice(tagMatch[0].length).replace(/\/\s*$/, '');
    const attrs = parseAttributes(attrsSource);
    const child =
      tagName === 'a'
        ? appendAnchor(parent, ownerDocument, attrs)
        : parent.appendChild(ownerDocument.createElement(tagName));

    if (!isSelfClosing) {
      stack.push({ node: child, tagName });
    }
    index = tagEnd + 1;
  }

  return fragment;
}

export function replaceChildrenWithSafeRichText(element: Element, html: string): void {
  const ownerDocument = element.ownerDocument ?? document;
  element.replaceChildren(createSafeRichTextFragment(ownerDocument, html));
}
