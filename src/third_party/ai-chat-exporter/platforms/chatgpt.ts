import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { extractChatGPTMessages, collectChatGPTImages } from './chatgptMessages';
import type { ChatPlatformParser, ParsedResult, ParseConfig } from '../types';

const CHATGPT_TITLE_REPLACE_TEXT = ' - ChatGPT';

function extractChatGPTChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const extraction = extractChatGPTMessages(doc, config);
  if (extraction.messages.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, ...extraction, assets: [] };
  }

  const title = doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, '').trim() || DEFAULT_CHAT_TITLE;
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

  const parsedResult: ParsedResult = { title, ...extraction, assets: [] };

  const resolvedModel = model || undefined;
  if (resolvedModel) {
    parsedResult.model = resolvedModel;
  }

  return parsedResult;
}

export const chatgptParser: ChatPlatformParser = {
  id: 'chatgpt',
  collectImages: collectChatGPTImages,
  parse: (doc, config) => extractChatGPTChatData(doc, config)
};
