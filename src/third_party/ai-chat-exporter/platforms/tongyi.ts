import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParseConfig, ParsedMessage, ParsedResult } from '../types';
import { collectTongyiMessageContainers, pickTongyiContentElement } from './tongyiDomSelection';

import { cloneMessageWithImages, collectMessageImages } from '../shared/messageImages';

const TONGYI_USER_MESSAGE_SELECTOR =
  '[class*="user-message"], [class*="userMessage"], [class*="questionItem--"], [class*="message-select-wrapper-question"], [class*="chat-question-wrap"], [class*="qwen-chat-question"], [data-chat-question-wrap="true"], [data-role="user"]';
const TONGYI_ASSISTANT_MESSAGE_SELECTOR =
  '[class*="assistant-message"], [class*="assistantMessage"], [class*="bot-message"], [class*="message-select-wrapper-answer"], [class*="answerItem"], [class*="longTextAnswer"], [class*="contentBox--"], [class*="qwen-chat-answer"], [data-chat-answers-wrap="true"], [data-role="assistant"]';
// Native Tongyi browser-title suffixes/placeholders. These are source-site parser tokens.
const TONGYI_NATIVE_TITLE_SUFFIXES = [' - 通义', ' - 你的超级个人助理', ' - 通义千问'] as const;
const TONGYI_NATIVE_TITLE_PLACEHOLDERS = new Set(['通义', '通义千问']);
const TONGYI_CODE_CONTAINER_SELECTOR = '[class*="contain-layout-style"]';
const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  csharp: 'cs',
  shell: 'bash'
};

function stripTongyiNativeTitle(rawTitle: string): string {
  return TONGYI_NATIVE_TITLE_SUFFIXES.reduce(
    (title, suffix) => title.replace(suffix, ''),
    rawTitle
  ).trim();
}

function extractTongyiModel(doc: Document, messages: HTMLElement[]): string {
  const outsideConversation = (element: Element) =>
    !element.closest('aside, nav, [role="navigation"]') &&
    !messages.some((message) => message.contains(element));
  const normalizeModel = (text: string): string => {
    const match = text.trim().match(/^Qwen[\s-]?(\d+(?:\.\d+)?)[\s-]*(max|plus|turbo|pro)?$/i);
    if (!match) return '';
    const variant = match[2];
    return `Qwen${match[1]}${variant ? '-' + variant[0].toUpperCase() + variant.slice(1).toLowerCase() : ''}`;
  };
  const controls = doc.querySelectorAll<HTMLElement>(
    '[data-testid*="model" i], [data-test-id*="model" i], [data-model], [class*="model" i], select[name*="model" i]'
  );
  for (const control of Array.from(controls)) {
    if (!outsideConversation(control)) continue;
    const selected = control.matches('select') ? control.querySelector('option:checked') : control;
    const model = normalizeModel(control.getAttribute('data-model') || selected?.textContent || '');
    if (model) return model;
  }
  // Legacy pages expose a plain, explicitly labelled current-model header.
  // Keep that source without interpreting account names or conversation prose.
  for (const element of Array.from(doc.querySelectorAll('span, p, div'))) {
    if (element.childElementCount > 0 || !outsideConversation(element)) continue;
    const label = element.textContent?.trim().match(/^(?:当前模型|Current model)\s*[：:]\s*(.+)$/i);
    const model = label ? normalizeModel(label[1]) : '';
    if (model) return model;
  }
  return '';
}

function extractTongyiChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const questionItems = Array.from(doc.querySelectorAll('[class*="questionItem"]'));
  const messageContainers = collectTongyiMessageContainers(doc);

  if (messageContainers.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = stripTongyiNativeTitle(doc.title);

  if (!title || TONGYI_NATIVE_TITLE_PLACEHOLDERS.has(title)) {
    if (questionItems.length > 0) {
      const firstQuestion = questionItems[0].textContent?.trim() || '';
      title = firstQuestion.substring(0, 50) + (firstQuestion.length > 50 ? '...' : '');
    } else {
      const fallbackTitle = config?.fallbackTitle?.trim();
      if (!fallbackTitle) {
        throw new Error('Missing fallback title for tongyi export');
      }
      title = fallbackTitle;
    }
  }

  const model = extractTongyiModel(doc, messageContainers);

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  for (const messageElem of messageContainers) {
    const element = messageElem as HTMLElement;
    let role: 'user' | 'assistant' = 'assistant';

    if (element.matches(TONGYI_USER_MESSAGE_SELECTOR)) {
      role = 'user';
    } else if (element.matches(TONGYI_ASSISTANT_MESSAGE_SELECTOR)) {
      role = 'assistant';
    }

    const contentElem = pickTongyiContentElement(element, role);
    const sanitized = sanitizeTongyiContent(cloneMessageWithImages(element, [contentElem]));
    const markdown = chatElementToMarkdown(sanitized, config?.imageResolver);

    if (markdown.trim()) {
      const html = sanitized.innerHTML;
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

    const lineNumberNodes = Array.from(
      container.querySelectorAll('[class*="line-number"], [class*="linenumber"]')
    );
    const hadLineNumbers = lineNumberNodes.length > 0;

    lineNumberNodes.forEach((node) => node.remove());

    Array.from(container.querySelectorAll('[class*="cursor-pointer"], [role="img"]')).forEach(
      (node) => node.remove()
    );
    container.querySelector('span.font-medium')?.remove();

    const pre = container.querySelector('pre');
    if (!pre) return;

    const normalisedLanguage = languageLabel
      ? LANGUAGE_ALIASES[languageLabel] || languageLabel
      : undefined;

    const preClone = pre.cloneNode(true) as HTMLElement;
    preClone.removeAttribute('style');

    const code = preClone.querySelector('code');
    if (code && normalisedLanguage) {
      const languageClass = `language-${normalisedLanguage}`;
      Array.from(code.classList)
        .filter((cls) => cls.startsWith('language-'))
        .forEach((cls) => code.classList.remove(cls));
      code.classList.add(languageClass);
    }

    if (code && rawLanguageLabel) {
      code.setAttribute('data-language', rawLanguageLabel);
    }

    if (code) {
      const textContent = (code.textContent || '').replace(/\u00a0/g, ' ');

      const lines = textContent.split('\n');

      const numericPrefixes = lines
        .map((line) => {
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
        ? lines.map((line) => {
            const leadingWhitespaceMatch = line.match(/^\s*/);
            const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
            const withoutLeading = line.slice(leadingWhitespace.length);
            const numberMatch = withoutLeading.match(/^(\d{1,5})(\s*)/);

            if (!numberMatch) {
              return line;
            }

            const preservedIndent = numberMatch[2];
            return (
              leadingWhitespace + preservedIndent + withoutLeading.slice(numberMatch[0].length)
            );
          })
        : lines;

      const nonEmptyLines = processedLines.filter((line) => line.trim().length > 0);
      const minIndent = nonEmptyLines.reduce((min, line) => {
        const match = line.match(/^\s*/);
        const indent = match ? match[0].length : 0;
        return Math.min(min, indent);
      }, Number.POSITIVE_INFINITY);

      const normalisedLines = processedLines.map((line) => {
        if (minIndent === Number.POSITIVE_INFINITY) return line;
        return line.slice(Math.min(minIndent, line.length));
      });

      code.textContent = normalisedLines
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n')
        .replace(/[\s\u00a0]+$/g, '');
    }

    container.replaceWith(preClone);
  });

  return clone;
}

export const tongyiParser: ChatPlatformParser = {
  id: 'tongyi',
  collectImages: (root) => collectMessageImages('tongyi', collectTongyiMessageContainers(root)),
  parse: (doc, config) => extractTongyiChatData(doc, config)
};
