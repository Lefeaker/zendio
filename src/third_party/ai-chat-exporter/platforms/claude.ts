import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = '.font-claude-response';
const CLAUDE_MARKDOWN_SELECTOR = '.standard-markdown, .progressive-markdown';
const CLAUDE_MESSAGE_ROOT_SELECTOR = [
  CLAUDE_USER_MESSAGE_SELECTOR,
  CLAUDE_ASSISTANT_MESSAGE_SELECTOR,
  '.standard-markdown',
  '.progressive-markdown'
].join(', ');

function collectClaudeMessageRoots(doc: Document): HTMLElement[] {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(CLAUDE_MESSAGE_ROOT_SELECTOR));
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

function pickClaudeMessageContent(element: HTMLElement): HTMLElement | null {
  if (isClaudeUserMessage(element)) {
    return element;
  }

  if (element.matches(CLAUDE_MARKDOWN_SELECTOR)) {
    return element;
  }

  return element.querySelector<HTMLElement>(CLAUDE_MARKDOWN_SELECTOR);
}

function extractClaudeChatData(doc: Document): ParsedResult {
  const messageRoots = collectClaudeMessageRoots(doc);
  if (messageRoots.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  const title = doc.title.replace(/ - Claude$/, '').trim() || DEFAULT_CHAT_TITLE;

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
    if (!content) {
      continue;
    }

    const html = content.innerHTML;
    const markdown = chatHtmlToMarkdown(html);
    if (!markdown.trim()) {
      continue;
    }

    const message: ParsedMessage = {
      id: `msg-${chatIndex++}`,
      role: isClaudeUserMessage(element) ? 'user' : 'assistant',
      md: markdown,
      text: markdown
    };

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
  parse: (doc) => extractClaudeChatData(doc)
};
