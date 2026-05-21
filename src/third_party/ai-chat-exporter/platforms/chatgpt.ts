import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const CHATGPT_ARTICLE_SELECTOR = 'article';
const CHATGPT_HEADER_SELECTOR = 'h5';
const CHATGPT_TITLE_REPLACE_TEXT = ' - ChatGPT';

function extractChatGPTChatData(doc: Document): ParsedResult {
  const articles = Array.from(doc.querySelectorAll(CHATGPT_ARTICLE_SELECTOR));
  if (articles.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const title = doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, '').trim() || DEFAULT_CHAT_TITLE;
  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  let model = '';

  const modelButtons = Array.from(doc.querySelectorAll('button, [role="button"]'));
  for (const btn of modelButtons) {
    const text = btn.textContent?.trim() || '';
    const match = text.match(
      /^(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)$/i
    );
    if (match) {
      model = match[1];
      break;
    }
  }

  if (!model) {
    const selectors = [
      '[class*="model"]',
      '[class*="Model"]',
      '[data-testid*="model"]',
      '.text-token-text-secondary',
      'select option[selected]'
    ];

    for (const selector of selectors) {
      const elements = Array.from(doc.querySelectorAll(selector));
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        const match = text.match(
          /(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i
        );
        if (match) {
          model = match[1];
          break;
        }
      }
      if (model) break;
    }
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(
      /(?:Model|模型)[:\s]*(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i
    );
    if (modelMatch) {
      model = modelMatch[1];
    }
  }

  if (model) {
    model = model.trim();
  }

  for (const article of articles) {
    const header = article.querySelector(CHATGPT_HEADER_SELECTOR)?.textContent?.trim() || '';
    const html = article.innerHTML;
    let markdown = chatHtmlToMarkdown(html);

    if (!markdown.trim()) continue;

    const headerLower = header.toLowerCase();
    const isUser =
      headerLower.includes('you said') ||
      headerLower.includes('you') ||
      headerLower.includes('您说') ||
      headerLower.includes('您') ||
      article.classList.contains('user') ||
      article.getAttribute('data-message-author-role') === 'user' ||
      article.querySelector('[data-message-author-role="user"]') !== null;

    const role = isUser ? 'user' : 'assistant';

    markdown = markdown
      .replace(/^您说[：:]\s*/gm, '')
      .replace(/^ChatGPT\s*说[：:]\s*/gm, '')
      .replace(/^You\s+said[：:]\s*/gim, '')
      .replace(/^ChatGPT\s+said[：:]\s*/gim, '')
      .replace(/您说[：:]\s*/g, '')
      .replace(/ChatGPT\s*说[：:]\s*/g, '')
      .replace(/You\s+said[：:]\s*/gi, '')
      .replace(/ChatGPT\s+said[：:]\s*/gi, '')
      .trim();

    messages.push({
      id: `msg-${chatIndex++}`,
      role,
      html,
      md: markdown,
      text: markdown
    });
  }

  const parsedResult: ParsedResult = { title, messages, assets: [] };

  const resolvedModel = model || undefined;
  if (resolvedModel) {
    parsedResult.model = resolvedModel;
  }

  return parsedResult;
}

export const chatgptParser: ChatPlatformParser = {
  id: 'chatgpt',
  parse: (doc) => extractChatGPTChatData(doc)
};
