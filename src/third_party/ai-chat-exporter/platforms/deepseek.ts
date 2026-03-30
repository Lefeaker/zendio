import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const DEEPSEEK_MESSAGE_CONTAINER_SELECTOR = '[class*="message"], [class*="Message"]';
const DEEPSEEK_USER_MESSAGE_SELECTOR = '[class*="user"], [class*="User"]';
const DEEPSEEK_ASSISTANT_MESSAGE_SELECTOR = '[class*="assistant"], [class*="Assistant"], [class*="bot"]';
const DEEPSEEK_TITLE_REPLACE_TEXT = ' - DeepSeek';

function extractDeepSeekChatData(doc: Document): ParsedResult {
  const messageContainers = Array.from(doc.querySelectorAll(DEEPSEEK_MESSAGE_CONTAINER_SELECTOR));
  if (messageContainers.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = doc.title.replace(DEEPSEEK_TITLE_REPLACE_TEXT, '').trim();
  if (!title) {
    const sidebarTitle = doc.querySelector('[class*="conversation-title"], [class*="chat-title"]');
    if (sidebarTitle?.textContent) {
      title = sidebarTitle.textContent.trim();
    }
  }
  if (!title) {
    title = 'DeepSeek 对话';
  }

  let model = '';
  const modelSelectors = [
    '[class*="model"], [class*="Model"]',
    '[data-testid*="model"]',
    'select option[selected]'
  ];
  for (const selector of modelSelectors) {
    const elements = Array.from(doc.querySelectorAll(selector));
    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.match(/DeepSeek|R1|Chat/i)) {
        model = text;
        break;
      }
    }
    if (model) break;
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(/DeepSeek[\s-]*(?:V3|R1|Coder|Chat|General|Math|Reasoning|Vision|Coder|Turbo|Pro)/i);
    if (modelMatch) {
      model = modelMatch[0];
    }
  }

  if (!model) {
    model = 'DeepSeek';
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  for (const container of messageContainers) {
    const element = container as HTMLElement;
    let role: 'user' | 'assistant' = 'assistant';
    let contentElem: HTMLElement | null = null;

    if (element.matches(DEEPSEEK_USER_MESSAGE_SELECTOR)) {
      role = 'user';
      contentElem = element.querySelector('[class*="content"], [class*="text"], article, div, p');
    } else if (element.matches(DEEPSEEK_ASSISTANT_MESSAGE_SELECTOR)) {
      role = 'assistant';
      contentElem = element.querySelector('[class*="content"], [class*="markdown"], article, div, p');
    }

    if (!contentElem) {
      contentElem = element;
    }

    const html = contentElem.innerHTML;
    const markdown = chatHtmlToMarkdown(html);

    if (markdown.trim()) {
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html,
        md: markdown,
        text: markdown
      });
    }
  }

  const parsedResult: ParsedResult = { title, messages, assets: [] };

  if (model.trim()) {
    parsedResult.model = model.trim();
  }

  return parsedResult;
}

export const deepseekParser: ChatPlatformParser = {
  id: 'deepseek',
  parse: (doc) => extractDeepSeekChatData(doc)
};
