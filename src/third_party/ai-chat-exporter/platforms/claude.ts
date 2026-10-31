import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult, ParseConfig } from '../types';

import {
  cloneMessageWithImages,
  collectMessageImages,
  queryMessageElements
} from '../shared/messageImages';

const CLAUDE_USER_BODY_SELECTOR = '[data-testid="user-message"]';
const CLAUDE_SEMANTIC_USER_SELECTOR = '[data-cds="UserMessage"][data-turn-key]';
const CLAUDE_USER_MESSAGE_SELECTOR = `${CLAUDE_SEMANTIC_USER_SELECTOR}, ${CLAUDE_USER_BODY_SELECTOR}`;
const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = '.font-claude-response';
const CLAUDE_MARKDOWN_SELECTOR = '.standard-markdown, .progressive-markdown';
const CLAUDE_MESSAGE_ROOT_SELECTOR = [
  CLAUDE_USER_MESSAGE_SELECTOR,
  CLAUDE_ASSISTANT_MESSAGE_SELECTOR,
  '.standard-markdown',
  '.progressive-markdown'
].join(', ');

function collectClaudeMessageRoots(doc: ParentNode): HTMLElement[] {
  const candidates = queryMessageElements(doc, CLAUDE_MESSAGE_ROOT_SELECTOR);
  const roots: HTMLElement[] = [];

  for (const candidate of candidates) {
    if (roots.some((root) => root !== candidate && root.contains(candidate))) {
      continue;
    }

    roots.push(candidate);
  }

  return roots;
}

function isClaudeUserMessage(element: HTMLElement): boolean {
  return element.matches(CLAUDE_USER_MESSAGE_SELECTOR);
}

function hasFailedClaudeMessage(roots: readonly HTMLElement[]): boolean {
  return roots.some(
    (root) =>
      root.matches('[data-state="failed"]') ||
      root.querySelector('[data-cds="MessageAttachmentsImage"][data-state="failed"]')
  );
}

function pickClaudeMessageContent(element: HTMLElement): HTMLElement | null {
  if (isClaudeUserMessage(element)) {
    return element.matches(CLAUDE_USER_BODY_SELECTOR)
      ? element
      : element.querySelector<HTMLElement>(CLAUDE_USER_BODY_SELECTOR);
  }

  if (element.matches(CLAUDE_MARKDOWN_SELECTOR)) {
    return element;
  }

  return element.querySelector<HTMLElement>(CLAUDE_MARKDOWN_SELECTOR);
}

function extractClaudeChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const messageRoots = collectClaudeMessageRoots(doc);
  if (messageRoots.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  const title = doc.title.replace(/ - Claude$/, '').trim() || DEFAULT_CHAT_TITLE;
  if (hasFailedClaudeMessage(messageRoots)) {
    return {
      title,
      messages: [],
      assets: [],
      diagnostics: [{ code: 'claude_message_failed', severity: 'error' }]
    };
  }

  let model = '';
  const buttons = Array.from(doc.querySelectorAll('button'));
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (text.match(/^(Sonnet|Opus|Haiku)\s+[\d.]+$/i)) {
      model = 'Claude ' + text;
      break;
    }
  }

  for (const element of messageRoots) {
    const content = pickClaudeMessageContent(element);
    const fragment = cloneMessageWithImages(element, content ? [content] : []);
    const markdown = chatElementToMarkdown(fragment, config?.imageResolver);
    if (!markdown.trim()) {
      continue;
    }

    const message: ParsedMessage = {
      id: `msg-${chatIndex++}`,
      role: isClaudeUserMessage(element) ? 'user' : 'assistant',
      md: markdown,
      text: markdown
    };

    const html = fragment.innerHTML;
    if (html) {
      message.html = html;
    }

    messages.push(message);
  }

  const parsedResult: ParsedResult = { title, messages, assets: [] };

  if (model.trim()) {
    parsedResult.model = model.trim();
  }

  return parsedResult;
}

export const claudeParser: ChatPlatformParser = {
  id: 'claude',
  collectImages: (root) => {
    const messages = collectClaudeMessageRoots(root);
    return hasFailedClaudeMessage(messages) ? [] : collectMessageImages('claude', messages);
  },
  parse: (doc, config) => extractClaudeChatData(doc, config)
};
