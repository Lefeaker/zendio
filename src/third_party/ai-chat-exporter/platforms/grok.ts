import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult, ParseConfig } from '../types';

import {
  cloneMessageWithImages,
  collectMessageImages,
  messageImageElements,
  queryMessageElements,
  removePreservingMessageImages
} from '../shared/messageImages';

const GROK_MESSAGE_SELECTOR =
  '[role="article"][data-testid="user-message"], [role="article"][data-testid="assistant-message"]';
const GROK_CONTENT_SELECTOR = '.response-content-markdown';
const GROK_IMAGE_EXCLUSIONS = '[data-no-copy="true"], .thinking-container';
const GROK_CHROME_SELECTOR = '[data-no-copy="true"], .thinking-container, button, [role="button"]';

function collectGrokMessageRoots(root: ParentNode): HTMLElement[] {
  const scope =
    queryMessageElements(root, '#grok-content-area, #grok-page-content')[0] ??
    (queryMessageElements(root, GROK_MESSAGE_SELECTOR)[0] === root ? root : null);
  return scope
    ? queryMessageElements(scope, GROK_MESSAGE_SELECTOR).filter(
        (message) => !message.parentElement?.closest(GROK_MESSAGE_SELECTOR)
      )
    : [];
}

function collectMessageContent(message: HTMLElement): HTMLElement {
  const blocks = Array.from(message.querySelectorAll<HTMLElement>(GROK_CONTENT_SELECTOR)).filter(
    (block) =>
      !block.parentElement?.closest(GROK_CONTENT_SELECTOR) && !block.closest(GROK_CHROME_SELECTOR)
  );

  // The submitted user turn can render as a direct paragraph before Markdown hydration.
  const content = blocks.length > 0 ? blocks : [message];
  const fragment = cloneMessageWithImages(message, content, GROK_IMAGE_EXCLUSIONS);
  fragment.querySelectorAll(GROK_CHROME_SELECTOR).forEach(removePreservingMessageImages);
  return fragment;
}

function extractGrokChatData(doc: Document, config?: ParseConfig): ParsedResult {
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

  const roots = collectGrokMessageRoots(scope);
  const markIncompleteContent = () => {
    result.diagnostics = [{ code: 'grok_message_content_incomplete', severity: 'error' }];
  };

  for (const root of roots) {
    const role = root.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
    // Assistant labels, thinking steps and action controls are not a completed answer.
    if (
      role === 'assistant' &&
      !root.querySelector(GROK_CONTENT_SELECTOR) &&
      messageImageElements(root, GROK_IMAGE_EXCLUSIONS).length === 0
    ) {
      markIncompleteContent();
      continue;
    }
    const fragment = collectMessageContent(root);
    const markdown = chatElementToMarkdown(fragment, config?.imageResolver).trim();
    if (!markdown) {
      markIncompleteContent();
      continue;
    }
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
  collectImages: (root) =>
    collectMessageImages('grok', collectGrokMessageRoots(root), GROK_IMAGE_EXCLUSIONS),
  parse: (doc, config) => extractGrokChatData(doc, config)
};
