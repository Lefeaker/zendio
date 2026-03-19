import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const CLAUDE_MAIN_CONTAINER_SELECTOR = '.flex-1.flex.flex-col.gap-3.px-4.max-w-3xl.mx-auto.w-full.pt-1';
const CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = '.font-claude-response';

function extractClaudeChatData(doc: Document): ParsedResult {
  const mainContainer = doc.querySelector(CLAUDE_MAIN_CONTAINER_SELECTOR);
  if (!mainContainer) {
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

  Array.from(mainContainer.children).forEach((child) => {
    const element = child as HTMLElement;

    const userMessage = element.querySelector(CLAUDE_USER_MESSAGE_SELECTOR);
    if (userMessage) {
      const html = userMessage.innerHTML;
      const markdown = chatHtmlToMarkdown(html);

      if (markdown.trim()) {
        messages.push({
          id: `msg-${chatIndex++}`,
          role: 'user',
          html,
          md: markdown,
          text: markdown
        });
      }
      return;
    }

    const assistantMessage = element.querySelector(CLAUDE_ASSISTANT_MESSAGE_SELECTOR);
    if (assistantMessage) {
      const markdownContainer = assistantMessage.querySelector('.standard-markdown, .progressive-markdown');
      if (markdownContainer) {
        const html = markdownContainer.innerHTML;
        const markdown = chatHtmlToMarkdown(html);

        if (markdown.trim()) {
          const message: ParsedMessage = {
            id: `msg-${chatIndex++}`,
            role: 'assistant',
            md: markdown,
            text: markdown
          };

          if (html) {
            message.html = html;
          }

          messages.push(message);
        }
      }
    }
  });

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
