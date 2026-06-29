import {
  collectPreferredChineseFamilyMessageContainers,
  pickFirstNonEmptyChineseFamilyElement
} from './chineseFamilyHelpers';

const TONGYI_MESSAGE_CONTAINER_SELECTORS: readonly string[] = [
  '[class*="chat-question-wrap"]',
  '[data-chat-question-wrap="true"]',
  '[class*="answerItem"]',
  '[class*="longTextAnswer"]',
  '[data-chat-answers-wrap="true"]',
  '[class*="contentBox--"]',
  '[class*="questionItem--"]',
  '[class*="qwen-chat-message"]',
  '[class*="message-select-wrapper-question"]',
  '[class*="message-select-wrapper-answer"]',
  '[class*="message-item"]'
];

const TONGYI_USER_CONTENT_SELECTORS: readonly string[] = [
  '[class*="qwen-message-bubble"]',
  '[class*="message-select-content-inner"]',
  '[class*="question-text-card"]',
  '[class*="content"]',
  '[class*="msgText"]',
  '.qk-md-text',
  'pre',
  'article',
  'p',
  'div'
];

const TONGYI_ASSISTANT_CONTENT_SELECTORS: readonly string[] = [
  '.tongyi-markdown',
  '[class*="qwen-content-box"]',
  '[class*="contentBox"]',
  '[class*="content-q"]',
  '[class*="markdown-pc-special-class"]',
  '[class*="qk-markdown"]',
  '[class*="message-select-content-inner"]',
  '[class*="content"]',
  '[class*="msgText"]',
  '[class*="markdown"]',
  '.qk-md-text',
  'pre',
  'article',
  'p',
  'div'
];

function getTongyiContainerPriority(element: HTMLElement): number {
  if (
    element.matches(
      '[class*="chat-question-wrap"], [data-chat-question-wrap="true"], [class*="answerItem"], [class*="longTextAnswer"], [data-chat-answers-wrap="true"]'
    )
  ) {
    return 0;
  }

  if (element.matches('[class*="contentBox--"], [class*="questionItem--"]')) {
    return 1;
  }

  if (
    element.matches(
      '[class*="message-select-wrapper-question"], [class*="message-select-wrapper-answer"], [class*="qwen-chat-message"]'
    )
  ) {
    return 2;
  }

  return 3;
}

export function collectTongyiMessageContainers(doc: Document): HTMLElement[] {
  return collectPreferredChineseFamilyMessageContainers(doc, TONGYI_MESSAGE_CONTAINER_SELECTORS, {
    getPriority: getTongyiContainerPriority
  });
}

export function pickTongyiContentElement(
  element: HTMLElement,
  role: 'user' | 'assistant'
): HTMLElement {
  const selectors =
    role === 'user' ? TONGYI_USER_CONTENT_SELECTORS : TONGYI_ASSISTANT_CONTENT_SELECTORS;

  return pickFirstNonEmptyChineseFamilyElement(element, selectors) ?? element;
}
