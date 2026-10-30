import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const GROK_MESSAGE_SELECTOR =
  '[role="article"][data-testid="user-message"], [role="article"][data-testid="assistant-message"]';
const GROK_CONTENT_SELECTOR = '.response-content-markdown';
const GROK_CHROME_SELECTOR = '[data-no-copy="true"], .thinking-container, button, [role="button"]';

function collectMessageContent(message: HTMLElement): HTMLElement {
  const fragment = message.ownerDocument.createElement('div');
  const blocks = Array.from(message.querySelectorAll<HTMLElement>(GROK_CONTENT_SELECTOR)).filter(
    (block) =>
      !block.parentElement?.closest(GROK_CONTENT_SELECTOR) && !block.closest(GROK_CHROME_SELECTOR)
  );

  // The submitted user turn can render as a direct paragraph before Markdown hydration.
  const content = blocks.length > 0 ? blocks : [message];
  for (const block of content) {
    fragment.appendChild(block.cloneNode(true));
  }
  fragment.querySelectorAll(GROK_CHROME_SELECTOR).forEach((element) => element.remove());
  return fragment;
}

function extractGrokChatData(doc: Document): ParsedResult {
  const scope = doc.querySelector<HTMLElement>('#grok-content-area, #grok-page-content');
  const title =
    doc.title
      .replace(/\s*\|\s*Shared Grok Conversation$/u, '')
      .replace(/\s+-\s+Grok$/u, '')
      .trim() || DEFAULT_CHAT_TITLE;
  const messages: ParsedMessage[] = [];
  const result: ParsedResult = { title, messages, assets: [] };
  if (!scope) return result;
  if (scope.querySelector('[data-transcript-renderer][aria-busy="true"]')) {
    result.diagnostics = [{ code: 'grok_transcript_loading', severity: 'warning' }];
    return result;
  }

  const roots = Array.from(scope.querySelectorAll<HTMLElement>(GROK_MESSAGE_SELECTOR)).filter(
    (message) => !message.parentElement?.closest(GROK_MESSAGE_SELECTOR)
  );

  for (const root of roots) {
    const role = root.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
    // Assistant labels, thinking steps and action controls are not a completed answer.
    if (role === 'assistant' && !root.querySelector(GROK_CONTENT_SELECTOR)) continue;
    const fragment = collectMessageContent(root);
    const markdown = chatElementToMarkdown(fragment).trim();
    if (!markdown) continue;
    messages.push({
      id: `msg-${messages.length + 1}`,
      role,
      html: fragment.innerHTML,
      md: markdown,
      text: markdown
    });
  }

  return result;
}

export const grokParser: ChatPlatformParser = {
  id: 'grok',
  parse: (doc) => extractGrokChatData(doc)
};
