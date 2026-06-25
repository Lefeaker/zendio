import {
  removeChineseFamilyChrome,
  resolveChineseFamilyRoleFromAttributes
} from './chineseFamilyHelpers';
import type { ChineseFamilyMessageRole } from './chineseFamilyHelpers';

export function resolveDoubaoMessageRole(
  container: HTMLElement,
  assistantAvatarSelector: string,
  markdownClassHint: string
): ChineseFamilyMessageRole {
  const explicitRole = resolveChineseFamilyRoleFromAttributes(container, [
    'data-role',
    'data-testid',
    'aria-label',
    'data-message-id',
    'class'
  ]);
  if (explicitRole) {
    return explicitRole;
  }

  const roleAttr = [
    container.getAttribute('data-role'),
    container.getAttribute('data-testid'),
    container.getAttribute('aria-label'),
    container.getAttribute('data-render-engine'),
    container.className
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  if (/assistant|message_assistant|bot|doubao/.test(roleAttr)) {
    return 'assistant';
  }
  if (/user|message_user|human/.test(roleAttr)) {
    return 'user';
  }

  const renderEngine = container.getAttribute('data-render-engine')?.toLowerCase();
  if (renderEngine === 'markdown') {
    return 'assistant';
  }
  if (renderEngine === 'text' || renderEngine === 'plain') {
    return 'user';
  }

  if (container.querySelector('[class*="whitespace-pre-wrap"], [class*="wrap-anywhere"]')) {
    return 'user';
  }
  if (container.className.includes('justify-end')) {
    return 'user';
  }
  if (container.className.includes('grid-cols') || container.querySelector('[data-thinking-box]')) {
    return 'assistant';
  }
  if (container.querySelector(assistantAvatarSelector)) {
    return 'assistant';
  }
  if (
    container.querySelector(
      '[data-render-engine="markdown"]:not([data-thinking-box]), [class*="flow-markdown-body"], [class*="content-"]'
    )
  ) {
    return 'assistant';
  }
  if (container.querySelector('[class*="send-text"]')) {
    return 'user';
  }
  const bubble = container.querySelector<HTMLElement>('[class*="container-"]');
  const className = bubble?.className || '';
  return className.includes(markdownClassHint) ? 'assistant' : 'user';
}

export function pickDoubaoContentElement(container: HTMLElement): HTMLElement | null {
  const order = [
    '[class*="flow-markdown-body"]',
    '[data-render-engine="markdown"]:not([data-thinking-box])',
    '[data-lexical-editor]',
    '[data-slate-editor]',
    '[class*="send-text"]',
    '[class*="whitespace-pre-wrap"]',
    '[class*="wrap-anywhere"]',
    '[class*="content-"]',
    '[class*="markdown"]',
    'article',
    'pre',
    'code'
  ];

  for (const selector of order) {
    const el = container.querySelector<HTMLElement>(selector);
    if (el) return el;
  }

  const nodeRenderers = Array.from(
    container.querySelectorAll<HTMLElement>('[data-render-engine="node"]:not([data-thinking-box])')
  )
    .filter(
      (element) =>
        !element.closest('[data-thinking-box]') &&
        !element.querySelector('[data-thinking-box]') &&
        Boolean(element.textContent?.trim())
    )
    .sort((left, right) => (right.textContent?.length ?? 0) - (left.textContent?.length ?? 0));

  return nodeRenderers[0] ?? container.querySelector<HTMLElement>('[class*="container-"]');
}

export function cleanupDoubaoContent(fragment: HTMLElement): void {
  removeChineseFamilyChrome(fragment, [
    '[data-thinking-box]',
    '[data-container-type="suggestion"]',
    '[class*="toolbar"]',
    '[class*="message-action-bar"]',
    '[class*="message-action"]',
    '[class*="suggest-message"]',
    'button',
    'svg'
  ]);
}
