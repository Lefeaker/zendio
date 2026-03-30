import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const TONGYI_MESSAGE_CONTAINER_SELECTOR =
  '[class*="message-item"], [class*="questionItem--"], [class*="answerItem"], [class*="contentBox--"]';
const TONGYI_USER_MESSAGE_SELECTOR =
  '[class*="user-message"], [class*="userMessage"], [class*="questionItem--"]';
const TONGYI_ASSISTANT_MESSAGE_SELECTOR =
  '[class*="assistant-message"], [class*="assistantMessage"], [class*="bot-message"], [class*="contentBox--"]';
const TONGYI_TITLE_REPLACE_TEXT = ' - 通义';

const TONGYI_CODE_CONTAINER_SELECTOR = '[class*="contain-layout-style"]';

const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  csharp: 'cs',
  shell: 'bash'
};

function extractTongyiChatData(doc: Document): ParsedResult {
  const questionItems = Array.from(doc.querySelectorAll('[class*="questionItem"]'));
  const answerItems = Array.from(doc.querySelectorAll('[class*="answerItem"]'));

  if (questionItems.length === 0 && answerItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = doc.title.replace(TONGYI_TITLE_REPLACE_TEXT, '').replace(' - 你的超级个人助理', '').replace(' - 通义千问', '').trim();

  if (!title || title === '通义') {
    if (questionItems.length > 0) {
      const firstQuestion = questionItems[0].textContent?.trim() || '';
      title = firstQuestion.substring(0, 50) + (firstQuestion.length > 50 ? '...' : '');
    } else {
      title = '通义千问对话';
    }
  }

  let model = '';

  try {
    const selectedModel = localStorage.getItem('selectedQwenModel');
    if (selectedModel) {
      const match = selectedModel.match(/qwen(\d+)[\s-]*(max|plus|turbo|pro)?/i);
      if (match) {
        const version = match[1];
        const variant = match[2] ? match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase() : '';
        model = `Qwen${version}${variant ? '-' + variant : ''}`;
      }
    }
  } catch (error) {
    console.debug('[Tongyi] Unable to read selected model from localStorage', error);
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const qwenMatch = bodyText.match(/Qwen[\s-]?(\d+)[\s-]*(max|plus|turbo|pro)?/i);
    if (qwenMatch) {
      const version = qwenMatch[1];
      const variant = qwenMatch[2] ? qwenMatch[2].charAt(0).toUpperCase() + qwenMatch[2].slice(1).toLowerCase() : '';
      model = `Qwen${version}${variant ? '-' + variant : ''}`;
    }
  }

  if (!model) {
    const buttons = Array.from(doc.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.match(/^(通义千问|Qwen|qwen)[\s-]*(\d+)?[\s-]*(max|plus|turbo)?$/i)) {
        model = text;
        break;
      }
    }
  }

  if (!model) {
    const modelElements = Array.from(doc.querySelectorAll('[class*="model"], [class*="Model"]'));
    for (const el of modelElements) {
      const text = el.textContent?.trim();
      if (text && text.match(/Qwen|通义|千问/i)) {
        model = text;
        break;
      }
    }
  }

  const messageContainers = Array.from(doc.querySelectorAll(TONGYI_MESSAGE_CONTAINER_SELECTOR));
  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  for (const messageElem of messageContainers) {
    const element = messageElem as HTMLElement;
    let role: 'user' | 'assistant' = 'assistant';
    let contentElem: HTMLElement | null = null;

    if (element.matches(TONGYI_USER_MESSAGE_SELECTOR)) {
      role = 'user';
      contentElem = element.querySelector('[class*="content"], [class*="msgText"], pre, article, div, p');
    } else if (element.matches(TONGYI_ASSISTANT_MESSAGE_SELECTOR)) {
      role = 'assistant';
      contentElem = element.querySelector(
        '.tongyi-markdown, pre, [class*="content"], [class*="msgText"], [class*="markdown"], article, div, p'
      );
    }

    if (!contentElem) {
      contentElem = element.querySelector(
        '.tongyi-markdown, pre, [class*="content"], [class*="msgText"], [class*="markdown"], article, div, p'
      );
    }

    if (!contentElem) {
      contentElem = element;
    }

    const sanitized = sanitizeTongyiContent(contentElem);
    const html = sanitized.innerHTML;
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

function sanitizeTongyiContent(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;

  // Normalise code containers with headers/actions
  Array.from(clone.querySelectorAll(TONGYI_CODE_CONTAINER_SELECTOR)).forEach((container) => {
    const rawLanguageLabel = container.querySelector('span.font-medium')?.textContent?.trim();
    const languageLabel = rawLanguageLabel?.toLowerCase();

    const lineNumberNodes = Array.from(container.querySelectorAll(
      '[class*="line-number"], [class*="linenumber"]'
    ));
    const hadLineNumbers = lineNumberNodes.length > 0;

    lineNumberNodes.forEach((node) => node.remove());

    Array.from(container.querySelectorAll('[class*="cursor-pointer"], [role="img"]')).forEach((node) => node.remove());
    container.querySelector('span.font-medium')?.remove();

    const pre = container.querySelector('pre');
    if (!pre) return;

    const normalisedLanguage = languageLabel
      ? (LANGUAGE_ALIASES[languageLabel] || languageLabel)
      : undefined;

    const preClone = pre.cloneNode(true) as HTMLElement;
    preClone.removeAttribute('style');

    const code = preClone.querySelector('code');
    if (code && normalisedLanguage) {
      const languageClass = `language-${normalisedLanguage}`;
      Array.from(code.classList)
        .filter(cls => cls.startsWith('language-'))
        .forEach(cls => code.classList.remove(cls));
      code.classList.add(languageClass);
    }

    if (code && rawLanguageLabel) {
      code.setAttribute('data-language', rawLanguageLabel);
    }

    if (code) {
      const textContent = (code.textContent || '').replace(/\u00a0/g, ' ');

      const lines = textContent.split('\n');

      const numericPrefixes = lines
        .map(line => {
          const trimmed = line.trimStart();
          const match = trimmed.match(/^(\d{1,4})(?=\D|$)/);
          if (!match) return null;
          const value = Number.parseInt(match[1], 10);
          if (!Number.isFinite(value) || value > 1000) return null;
          return value;
        })
        .filter((value): value is number => value !== null);

      const sequentialNumbering =
        numericPrefixes.length > 0 &&
        (numericPrefixes[0] === 0 || numericPrefixes[0] === 1) &&
        numericPrefixes.every((value, idx) => idx === 0 || numericPrefixes[idx - 1] + 1 === value);

      const coversMostLines = numericPrefixes.length >= Math.max(1, Math.ceil(lines.length * 0.5));
      const shouldStripLineNumbers = hadLineNumbers || (sequentialNumbering && coversMostLines);

      const processedLines = shouldStripLineNumbers
        ? lines.map(line => {
          const leadingWhitespaceMatch = line.match(/^\s*/);
          const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
          const withoutLeading = line.slice(leadingWhitespace.length);
          const numberMatch = withoutLeading.match(/^(\d{1,5})(\s*)/);

          if (!numberMatch) {
            return line;
          }

          const preservedIndent = numberMatch[2];
          return leadingWhitespace + preservedIndent + withoutLeading.slice(numberMatch[0].length);
        })
        : lines;

      const nonEmptyLines = processedLines.filter(line => line.trim().length > 0);
      const minIndent = nonEmptyLines.reduce((min, line) => {
        const match = line.match(/^\s*/);
        const indent = match ? match[0].length : 0;
        return Math.min(min, indent);
      }, Number.POSITIVE_INFINITY);

      const normalisedLines = processedLines.map(line => {
        if (minIndent === Number.POSITIVE_INFINITY) return line;
        return line.slice(Math.min(minIndent, line.length));
      });

      code.textContent = normalisedLines
        .map(line => line.replace(/\s+$/g, ''))
        .join('\n')
        .replace(/[\s\u00a0]+$/g, '');
    }

    container.replaceWith(preClone);
  });

  return clone;
}

export const tongyiParser: ChatPlatformParser = {
  id: 'tongyi',
  parse: (doc) => extractTongyiChatData(doc)
};
