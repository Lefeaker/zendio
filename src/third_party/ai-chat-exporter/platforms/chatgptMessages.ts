import { chatElementToMarkdown } from '../shared/markdown';
import { normalizeChatGPTCodeBlocks } from '../shared/chatgptCodeBlocks';
import type { ParsedMessage, ParsedResult, ParseConfig } from '../types';
import {
  cloneMessageWithImages,
  collectMessageImages,
  queryMessageElements,
  removePreservingMessageImages
} from '../shared/messageImages';

const ROLE_HEADING = 'h4[data-conversation-role]';
const LEGACY_HEADING = 'h5, .sr-only';
const LEGACY_ROLE = '[data-message-author-role]';
const SEMANTIC_CONTENT =
  '[data-user-message-bubble], [data-markdown-text-style="assistant-message"]';
const HIDDEN = '[hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"]';
const CONTENT_SELECTORS = [
  '[data-message-content-part="text"]',
  '.markdown.prose',
  '.markdown',
  '[class*="markdown"]',
  '.whitespace-pre-wrap',
  '[class*="whitespace-pre-wrap"]'
] as const;
const IMAGE_EXCLUSIONS = `${ROLE_HEADING}, [data-testid*="toolbar" i], [class*="toolbar" i]`;
const CHROME = '[data-testid*="toolbar" i], [class*="toolbar" i], button, [role="button"]';
// These labels belong to the source website, not extension UI.
const USER_LABELS = ['You said', 'You', '您说', '您', '你说', '你'] as const;
const ASSISTANT_LABELS = ['ChatGPT said', 'ChatGPT 说', 'ChatGPT'] as const;
const ROLE_PREFIX = new RegExp(
  `^(${[...USER_LABELS, ...ASSISTANT_LABELS].join('|')})[：:]\\s*`,
  'iu'
);

type MessageRoot = {
  element: HTMLElement;
  role: 'user' | 'assistant';
  modern: boolean;
  stripPrefix: boolean;
  content: HTMLElement[];
  roleHeader: boolean;
};
type MessageExtraction = Pick<ParsedResult, 'messages' | 'diagnostics'>;

function roleFromLabel(label: string): MessageRoot['role'] | null {
  const normalized = label
    .trim()
    .replace(/[：:]$/, '')
    .trim()
    .toLowerCase();
  if (USER_LABELS.some((native) => native.toLowerCase() === normalized)) return 'user';
  if (ASSISTANT_LABELS.some((native) => native.toLowerCase() === normalized)) return 'assistant';
  return null;
}

function failure(code: string): MessageExtraction {
  return { messages: [], diagnostics: [{ code, severity: 'error' }] };
}

function visibleDescendants(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.closest(HIDDEN)
  );
}

function visibleText(root: HTMLElement): string {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement?.closest(HIDDEN))
      text += walker.currentNode.textContent ?? '';
  }
  return text;
}

function topLevelMatches(root: HTMLElement, selector: string): HTMLElement[] {
  return visibleDescendants(root, selector).filter((element) => {
    const matchingParent = element.parentElement?.closest(selector);
    return !matchingParent || !root.contains(matchingParent);
  });
}

function selectContent(element: HTMLElement): HTMLElement[] {
  const selectors = [SEMANTIC_CONTENT, ...CONTENT_SELECTORS];
  if (element.matches(selectors.join(','))) return [element];
  for (const selector of selectors) {
    const content = topLevelMatches(element, selector);
    if (content.length > 0) return content;
  }
  return [];
}

function nativeRoleHeaders(element: HTMLElement): HTMLElement[] {
  return visibleDescendants(element, LEGACY_HEADING).filter(
    (heading) => !heading.closest(CHROME) && roleFromLabel(visibleText(heading))
  );
}

function findRoleHeader(element: HTMLElement, content: HTMLElement[]): HTMLElement | undefined {
  const siblings = Array.from(element.children).filter(
    (child) => !child.matches(`${HIDDEN}, ${CHROME}`)
  );
  return nativeRoleHeaders(element).find((heading) =>
    content.length > 0
      ? !content.some((body) => body.contains(heading) || heading.contains(body))
      : heading === siblings[0] && siblings.length > 1
  );
}

function legacyPrefix(element: HTMLElement): RegExpMatchArray | null {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (parent?.closest(HIDDEN) || !walker.currentNode.textContent?.trim()) continue;
    if (parent?.closest('h1, h2, h3, h4, h5, h6, .sr-only, p, blockquote, pre, code, a'))
      return null;
    const text = visibleText(element).trim();
    const prefix = text.match(ROLE_PREFIX);
    return prefix && text.slice(prefix[0].length).trim() ? prefix : null;
  }
  return null;
}

function cloneMessageContent(root: MessageRoot): HTMLElement {
  const container = cloneMessageWithImages(
    root.element,
    root.content.length > 0 ? root.content : [root.element],
    IMAGE_EXCLUSIONS
  );
  if (root.roleHeader && root.content.length === 0) {
    const cloneRoot = container.querySelector<HTMLElement>(':scope > *');
    if (cloneRoot) findRoleHeader(cloneRoot, [])?.remove();
  }
  normalizeChatGPTCodeBlocks(container);
  container.querySelectorAll(`${CHROME}, ${ROLE_HEADING}`).forEach(removePreservingMessageImages);
  return container;
}

function resolveMessageRoots(doc: ParentNode): MessageRoot[] | string {
  const roots: MessageRoot[] = [];
  for (const candidate of queryMessageElements(doc, `article, ${LEGACY_ROLE}, ${ROLE_HEADING}`)) {
    if (candidate.closest(HIDDEN)) continue;
    const modern = candidate.matches(ROLE_HEADING);
    const explicitRole = candidate.getAttribute(
      modern ? 'data-conversation-role' : 'data-message-author-role'
    );
    if (explicitRole !== null && explicitRole !== 'user' && explicitRole !== 'assistant') {
      return 'chatgpt_role_unrecognized';
    }
    const element = modern ? candidate.parentElement : candidate;
    if (!element || roots.some((root) => root.element.contains(element))) continue;
    // A turn can contain both roles. Its article/legacy wrapper must not merge them.
    if (!modern && visibleDescendants(candidate, ROLE_HEADING).length > 0) continue;
    if (
      !modern &&
      !candidate.matches(LEGACY_ROLE) &&
      visibleDescendants(candidate, LEGACY_ROLE).length > 0
    )
      continue;
    if (modern && visibleDescendants(element, ROLE_HEADING).length !== 1) {
      return 'chatgpt_message_boundary_ambiguous';
    }
    if (
      explicitRole &&
      !modern &&
      visibleDescendants(element, LEGACY_ROLE).some(
        (nested) => nested.getAttribute('data-message-author-role') !== explicitRole
      )
    ) {
      return 'chatgpt_message_boundary_ambiguous';
    }
    const content = selectContent(element);
    const header = findRoleHeader(element, content);
    const prefix = content.length === 0 && !header ? legacyPrefix(element) : null;
    const classRole = element.classList.contains('user') ? 'user' : null;
    const role =
      explicitRole ??
      roleFromLabel(header ? visibleText(header) : '') ??
      classRole ??
      (prefix ? roleFromLabel(prefix[1]) : null);
    if (!role) {
      if (content.length > 0 || nativeRoleHeaders(element).length > 0)
        return 'chatgpt_role_missing';
      continue;
    }
    roots.push({
      element,
      role,
      modern,
      content,
      roleHeader: Boolean(header),
      stripPrefix: !modern && explicitRole === null && !classRole && prefix !== null
    });
  }

  for (const content of Array.from(doc.querySelectorAll(SEMANTIC_CONTENT))) {
    if (!content.closest(HIDDEN) && !roots.some((root) => root.element.contains(content))) {
      return 'chatgpt_role_missing';
    }
  }

  return roots;
}

export function collectChatGPTImages(root: ParentNode) {
  const roots = resolveMessageRoots(root);
  return typeof roots === 'string'
    ? []
    : collectMessageImages(
        'chatgpt',
        roots.map((message) => message.element),
        IMAGE_EXCLUSIONS
      );
}

export function extractChatGPTMessages(doc: Document, config?: ParseConfig): MessageExtraction {
  // The source turn remains in_progress after partial assistant text is mounted.
  // A complete role pair therefore does not yet make a complete export.
  if (
    Array.from(
      doc.querySelectorAll(
        '[data-talvt-turn-state="in_progress"], [data-thread-user-message-navigation-content] [role="status"][aria-busy="true"]'
      )
    ).some((turn) => !turn.closest(HIDDEN))
  ) {
    return failure('chatgpt_generation_in_progress');
  }
  const roots = resolveMessageRoots(doc);
  if (typeof roots === 'string') return failure(roots);

  if (roots[roots.length - 1]?.role === 'user') {
    return failure('chatgpt_message_content_incomplete');
  }

  const messages: ParsedMessage[] = [];
  for (const root of roots) {
    const fragment = cloneMessageContent(root);
    const rendered = chatElementToMarkdown(fragment, config?.imageResolver);
    const markdown = (root.stripPrefix ? rendered.replace(ROLE_PREFIX, '') : rendered).trim();
    if (!markdown) {
      if (root.modern) return failure('chatgpt_message_content_incomplete');
      continue;
    }
    messages.push({
      id: `msg-${messages.length + 1}`,
      role: root.role,
      html: fragment.innerHTML,
      md: markdown,
      text: markdown
    });
  }
  return { messages };
}
