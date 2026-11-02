import type { AIChatImageCandidate, PlatformId } from '../types';

export const OWNED_IMAGE_ATTRIBUTE = 'data-aiob-message-image';
export const OWNED_IMAGE_SELECTOR = '[data-aiob-image-token], [data-aiob-message-image]';
export const AI_CHAT_IMAGE_SOURCE_ATTRIBUTES: readonly string[] = [
  'src',
  'srcset',
  'data-src',
  'data-original',
  'data-original-src',
  'data-image-url',
  'data-url'
];
const IMAGE_SELECTOR = 'img, image-query, uploaded-image, .uploaded-image, .image-container';
const EXCLUDED_IMAGE_CONTEXT =
  '[hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"], nav, aside, footer, .navigation, .controls, .tooltip, .overlay, .popup, svg, pre, code, [class*="avatar" i], [data-testid*="avatar" i], [data-test-id*="avatar" i], [role="toolbar"], [class*="toolbar" i], [data-testid*="toolbar" i], sources-carousel, sources-carousel-inline, card-renderer, default-source-card, url-source-card';

function isElement(root: ParentNode): root is HTMLElement {
  return 'nodeType' in root && root.nodeType === 1;
}

export function queryMessageElements(root: ParentNode, selector: string): HTMLElement[] {
  return [
    ...(isElement(root) && root.matches(selector) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(selector))
  ];
}

function hasExcludedImageContext(
  node: Element,
  root: ParentNode | Node,
  exclude?: string
): boolean {
  for (let current: Element | null = node; current; current = current.parentElement) {
    if (current.matches(EXCLUDED_IMAGE_CONTEXT) || (exclude && current.matches(exclude)))
      return true;
    if (current === root) break;
  }
  return false;
}

export function messageImageElements(root: ParentNode, exclude?: string): HTMLElement[] {
  const images: HTMLElement[] = [];
  for (const node of queryMessageElements(root, IMAGE_SELECTOR)) {
    if (hasExcludedImageContext(node, root, exclude)) continue;
    // A gallery is one occurrence per image, not one occurrence for its wrapper.
    if (node.tagName.toLowerCase() !== 'img') {
      if (node.querySelector('img')) continue;
      if (images.some((image) => image.contains(node))) continue;
      const explicitSource = AI_CHAT_IMAGE_SOURCE_ATTRIBUTES.some((attribute) =>
        node.getAttribute(attribute)
      );
      if (!explicitSource && node.querySelector(IMAGE_SELECTOR)) continue;
    }
    images.push(node);
  }
  return images;
}

export function hasMessageContent(root: HTMLElement, exclude?: string): boolean {
  return Boolean(root.textContent?.trim() || messageImageElements(root, exclude).length);
}

function messageKey(message: HTMLElement, index: number): string {
  const role =
    message.getAttribute('data-message-author-role') ||
    message.getAttribute('data-message-role') ||
    message.getAttribute('data-role') ||
    message.querySelector('h4[data-conversation-role]')?.getAttribute('data-conversation-role') ||
    message.getAttribute('data-testid') ||
    message.getAttribute('data-content') ||
    '';
  for (const attribute of ['data-message-id', 'data-chatgpt-search-message-ids', 'id']) {
    const value = message.getAttribute(attribute);
    if (value) return `${attribute}:${value}:${role}`;
  }
  for (const attribute of ['data-turn-key', 'data-plane-row', 'data-virtual-list-item-key']) {
    const value = message.closest(`[${attribute}]`)?.getAttribute(attribute);
    if (value) return `${attribute}:${value}:${role}`;
  }
  return `message-${index}:${role}`;
}

export function collectMessageImages(
  platform: PlatformId,
  messages: readonly HTMLElement[],
  exclude?: string
): AIChatImageCandidate[] {
  const seen = new Set<HTMLElement>();
  const candidates: AIChatImageCandidate[] = [];
  messages.forEach((message, messageIndex) => {
    messageImageElements(message, exclude).forEach((node, imageIndex) => {
      if (seen.has(node)) return;
      seen.add(node);
      const sourceUrl =
        node.tagName.toLowerCase() === 'img'
          ? undefined
          : node.getAttribute('data-image-url') ||
            node.getAttribute('data-original') ||
            node.getAttribute('data-original-src') ||
            node.getAttribute('data-src') ||
            node.getAttribute('data-url') ||
            node.getAttribute('src') ||
            undefined;
      const alt = node.getAttribute('alt') || undefined;
      candidates.push({
        node,
        messageRoot: message,
        slotKey: `${platform}:${messageKey(message, messageIndex)}:image-${imageIndex}`,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(alt ? { alt } : {})
      });
    });
  });
  return candidates;
}

export function cloneMessageWithImages(
  message: HTMLElement,
  contents: readonly HTMLElement[],
  exclude?: string
): HTMLElement {
  const container = message.ownerDocument.createElement('div');
  const images = messageImageElements(message, exclude);
  const nodes = [
    ...contents,
    ...images.filter((image) => !contents.some((body) => body.contains(image)))
  ];
  const unique = Array.from(new Set(nodes)).filter(
    (node, index, all) =>
      !all.some((other, otherIndex) => otherIndex !== index && other.contains(node))
  );
  unique.sort((left, right) => (left.compareDocumentPosition(right) & 2 ? 1 : -1));
  for (const node of unique) {
    const clone = message.ownerDocument.importNode(node, true);
    const sourceImages = queryMessageElements(node, IMAGE_SELECTOR);
    const clonedImages = queryMessageElements(clone, IMAGE_SELECTOR);
    container.append(clone);
    // A selected body clone may omit its message owner's attributes. Evaluate
    // exclusions in the original bounded context before those ancestors vanish.
    sourceImages.forEach((image, index) => {
      if (hasExcludedImageContext(image, message, exclude)) clonedImages[index]?.remove();
    });
  }
  messageImageElements(container, exclude).forEach((image) =>
    image.setAttribute(OWNED_IMAGE_ATTRIBUTE, '')
  );
  return container;
}

export function removePreservingMessageImages(element: Element): void {
  // UI cleanup receives detached cloned content, so its root is the clone boundary.
  const root = element.getRootNode();
  if (
    element.matches(OWNED_IMAGE_SELECTOR) &&
    element.matches(IMAGE_SELECTOR) &&
    !hasExcludedImageContext(element, root)
  ) {
    const image = element.ownerDocument.createElement('img');
    for (const attribute of [
      'data-aiob-image-token',
      OWNED_IMAGE_ATTRIBUTE,
      ...AI_CHAT_IMAGE_SOURCE_ATTRIBUTES,
      'alt'
    ]) {
      const value = element.getAttribute(attribute);
      if (value !== null) image.setAttribute(attribute, value);
    }
    element.replaceWith(image);
    return;
  }
  const images = Array.from(element.querySelectorAll<HTMLElement>(OWNED_IMAGE_SELECTOR)).filter(
    (image) =>
      image.matches(IMAGE_SELECTOR) &&
      !hasExcludedImageContext(image, root) &&
      !image.parentElement?.closest(OWNED_IMAGE_SELECTOR)
  );
  if (images.length > 0) element.replaceWith(...images);
  else element.remove();
}

// Used by virtual transcript owners; no network, cloning or Markdown conversion.
export function imageContentSignature(root: ParentNode): string {
  return JSON.stringify(
    messageImageElements(root).map((node) => [
      node.tagName,
      'currentSrc' in node ? node.currentSrc : '',
      Array.from(node.closest('picture')?.querySelectorAll('source') ?? []).map((source) => [
        source.getAttribute('srcset'),
        source.getAttribute('media'),
        source.getAttribute('type')
      ]),
      ...[...AI_CHAT_IMAGE_SOURCE_ATTRIBUTES, 'alt'].map(
        (attribute) => node.getAttribute(attribute) || ''
      )
    ])
  );
}
