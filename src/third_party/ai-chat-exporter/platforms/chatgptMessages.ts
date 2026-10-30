import { chatElementToMarkdown } from '../shared/markdown';
import type { ParsedMessage, ParsedResult } from '../types';

const ROLE_HEADING = 'h4[data-conversation-role]';
const LEGACY_ROLE = '[data-message-author-role]';
const HIDDEN = '[hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"]';
const CONTENT_SELECTORS = [
  '[data-message-content-part="text"]',
  '.markdown.prose',
  '.markdown',
  '[class*="markdown"]',
  '.whitespace-pre-wrap',
  '[class*="whitespace-pre-wrap"]'
] as const;
const CHROME = '[data-testid*="toolbar" i], [class*="toolbar" i], button, [role="button"]';
// These labels belong to the source website, not extension UI.
const USER_LABELS = ['You said', 'You', '您说', '您', '你说', '你'] as const;
const ASSISTANT_LABELS = ['ChatGPT said', 'ChatGPT 说', 'ChatGPT'] as const;
const ROLE_PREFIX = new RegExp(
  `^(${[...USER_LABELS, ...ASSISTANT_LABELS].join('|')})[：:]\\s*`,
  'iu'
);

type MessageRoot = { element: HTMLElement; role: 'user' | 'assistant'; stripPrefix: boolean };
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

function legacyRole(element: HTMLElement): MessageRoot['role'] | null {
  const headingRole = roleFromLabel(element.querySelector('h5')?.textContent ?? '');
  if (headingRole) return headingRole;
  if (element.classList.contains('user')) return 'user';
  const prefix = element.textContent?.trim().match(ROLE_PREFIX);
  return prefix ? roleFromLabel(prefix[1]) : null;
}

function failure(code: string): MessageExtraction {
  return { messages: [], diagnostics: [{ code, severity: 'error' }] };
}

function topLevelMatches(root: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    const matchingParent = element.parentElement?.closest(selector);
    return !matchingParent || !root.contains(matchingParent);
  });
}

function cloneMessageContent(root: MessageRoot): HTMLElement {
  const container = root.element.ownerDocument.createElement('div');
  const semanticSelector =
    root.role === 'user'
      ? '[data-user-message-bubble]'
      : '[data-markdown-text-style="assistant-message"]';
  let content = topLevelMatches(root.element, semanticSelector);
  for (const selector of CONTENT_SELECTORS) {
    if (content.length > 0) break;
    content = topLevelMatches(root.element, selector);
  }
  for (const element of content.length > 0 ? content : [root.element]) {
    container.append(element.cloneNode(true));
  }
  container.querySelectorAll(`${CHROME}, ${ROLE_HEADING}`).forEach((node) => node.remove());
  container.querySelectorAll('h5').forEach((heading) => {
    if (roleFromLabel(heading.textContent ?? '')) heading.remove();
  });
  return container;
}

export function extractChatGPTMessages(doc: Document): MessageExtraction {
  const roots: MessageRoot[] = [];
  for (const candidate of Array.from(
    doc.querySelectorAll<HTMLElement>(`article, ${LEGACY_ROLE}, ${ROLE_HEADING}`)
  )) {
    if (candidate.closest(HIDDEN)) continue;
    const modern = candidate.matches(ROLE_HEADING);
    const explicitRole = candidate.getAttribute(
      modern ? 'data-conversation-role' : 'data-message-author-role'
    );
    if (explicitRole !== null && explicitRole !== 'user' && explicitRole !== 'assistant') {
      return failure('chatgpt_role_unrecognized');
    }
    const element = modern ? candidate.parentElement : candidate;
    if (!element || roots.some((root) => root.element.contains(element))) continue;
    // A turn can contain both roles. Its article/legacy wrapper must not merge them.
    if (!modern && candidate.querySelector(ROLE_HEADING)) continue;
    if (!modern && !candidate.matches(LEGACY_ROLE) && candidate.querySelector(LEGACY_ROLE))
      continue;
    if (modern && element.querySelectorAll(ROLE_HEADING).length !== 1) {
      return failure('chatgpt_message_boundary_ambiguous');
    }
    if (
      explicitRole &&
      !modern &&
      Array.from(element.querySelectorAll(LEGACY_ROLE)).some(
        (nested) =>
          !nested.closest(HIDDEN) &&
          nested.getAttribute('data-message-author-role') !== explicitRole
      )
    ) {
      return failure('chatgpt_message_boundary_ambiguous');
    }
    const role = explicitRole ?? legacyRole(element);
    if (!role) continue;
    roots.push({
      element,
      role,
      stripPrefix: !modern && explicitRole === null && !element.querySelector('h5')
    });
  }

  for (const content of Array.from(
    doc.querySelectorAll(
      '[data-user-message-bubble], [data-markdown-text-style="assistant-message"]'
    )
  )) {
    if (!content.closest(HIDDEN) && !roots.some((root) => root.element.contains(content))) {
      return failure('chatgpt_role_missing');
    }
  }

  const messages: ParsedMessage[] = [];
  for (const root of roots) {
    const fragment = cloneMessageContent(root);
    const rendered = chatElementToMarkdown(fragment);
    const markdown = (root.stripPrefix ? rendered.replace(ROLE_PREFIX, '') : rendered).trim();
    if (!markdown) continue;
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
