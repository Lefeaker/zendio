import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult, ParseConfig } from '../types';

import {
  cloneMessageWithImages,
  collectMessageImages,
  queryMessageElements
} from '../shared/messageImages';

const COPILOT_MESSAGE_SELECTOR = '[data-content="user-message"], [data-content="ai-message"]';
const COPILOT_USER_MESSAGE_SELECTOR = '[data-content="user-message"]';

function extractCopilotChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const messageItems = queryMessageElements(doc, COPILOT_MESSAGE_SELECTOR);
  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  let rawTitle = '';
  const selected = doc.querySelector('[role="option"][aria-selected="true"]');
  if (selected) {
    rawTitle =
      selected.querySelector('p')?.textContent?.trim() ||
      (selected.getAttribute('aria-label') || '').split(',').slice(1).join(',').trim();
  }
  if (!rawTitle) {
    rawTitle = (doc.title || '')
      .replace(/^\s*Microsoft[_\s-]*Copilot.*$/i, '')
      .replace(/\s*[-–|]\s*Copilot.*$/i, '')
      .trim();
  }
  if (!rawTitle) rawTitle = 'Copilot Conversation';

  for (const item of messageItems) {
    const isUser = (item as HTMLElement).matches(COPILOT_USER_MESSAGE_SELECTOR);
    const role = isUser ? 'user' : 'assistant';

    const fragment = cloneMessageWithImages(item, [item]);
    const markdown = chatElementToMarkdown(fragment, config?.imageResolver);

    if (markdown.trim()) {
      const html = fragment.innerHTML;
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html,
        md: markdown,
        text: markdown
      });
    }
  }

  return { title: rawTitle, messages, assets: [] };
}

export const copilotParser: ChatPlatformParser = {
  id: 'copilot',
  collectImages: (root) =>
    collectMessageImages('copilot', queryMessageElements(root, COPILOT_MESSAGE_SELECTOR)),
  parse: (doc, config) => extractCopilotChatData(doc, config)
};
