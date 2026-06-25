import { cloneHTMLElement } from '../shared/dom';

const PERPLEXITY_LEGACY_MESSAGE_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-testid="assistant-message"]',
  '[data-message-author]',
  '[data-role="message"]'
].join(',');

const PERPLEXITY_CURRENT_USER_SELECTORS = [
  '[data-testid*="question" i]',
  '[data-testid*="query" i]',
  '[aria-label*="question" i]',
  '[aria-label*="query" i]',
  '[class*="query"]'
].join(',');

const PERPLEXITY_CURRENT_ASSISTANT_SELECTORS = [
  '[data-testid*="answer" i]',
  '[data-testid*="response" i]',
  '[aria-label*="answer" i]',
  '[aria-label*="response" i]',
  '[class*="answer"]',
  '[class*="response"]',
  '[class~="prose"]'
].join(',');

const PERPLEXITY_CURRENT_ASSISTANT_ROOT_SELECTORS = [
  '[data-testid*="answer" i]',
  '[data-testid*="response" i]',
  '[aria-label*="answer" i]',
  '[aria-label*="response" i]',
  '[class*="answer"]',
  '[class*="response"]',
  '[class*="group/query"]',
  '[class*="max-w-threadContentWidth"]'
].join(',');

const PERPLEXITY_SUPPRESSED_CONTAINER_SELECTOR = [
  'aside',
  'nav',
  'footer',
  '[role="navigation"]',
  '[aria-label*="source" i]',
  '[aria-label*="citation" i]',
  '[aria-label*="related" i]',
  '[class*="source"]',
  '[class*="citation"]',
  '[class*="sidebar"]',
  '[class*="toolbar"]',
  '[class*="action"]',
  '[data-pplx-citation]',
  '[data-testid*="source" i]',
  '[data-testid*="citation" i]',
  '[data-testid*="toolbar" i]'
].join(',');

const PERPLEXITY_CLEANUP_SELECTORS = [
  'button',
  'svg',
  'aside',
  'nav',
  'footer',
  '[role="navigation"]',
  '[aria-label*="copy" i]',
  '[aria-label*="share" i]',
  '[aria-label*="edit" i]',
  '[aria-label*="source" i]',
  '[aria-label*="citation" i]',
  '[aria-label*="related" i]',
  '[data-testid*="toolbar" i]',
  '[class*="toolbar"]',
  '[class*="action"]',
  '[class*="source"]',
  '[class*="citation"]',
  '[class*="sidebar"]',
  '[data-pplx-citation]',
  '[data-testid*="source" i]',
  '[data-testid*="citation" i]'
].join(',');

export type PerplexityMessageCandidate = {
  node: HTMLElement;
  role: 'user' | 'assistant';
};

function detectPerplexityRole(node: HTMLElement): PerplexityMessageCandidate['role'] {
  const author = (
    node.dataset.messageAuthor ??
    node.dataset.role ??
    node.getAttribute('data-testid') ??
    node.className
  ).toLowerCase();
  return /(user|query|prompt|human)/.test(author) ? 'user' : 'assistant';
}

export function pickPerplexityMessageBody(node: HTMLElement): HTMLElement | null {
  const selectors = [
    '[data-testid="message-content"]',
    '[class~="prose"]',
    '[class*="markdown"]',
    'article',
    'main',
    'p'
  ];
  for (const selector of selectors) {
    if (node.matches(selector)) return node;
    const match = node.querySelector<HTMLElement>(selector);
    if (match) return match;
  }
  return node;
}

export function cleanupPerplexityBody(fragment: HTMLElement): void {
  fragment.querySelectorAll(PERPLEXITY_CLEANUP_SELECTORS).forEach((element) => element.remove());
}

function isPerplexitySuppressedContainer(node: HTMLElement): boolean {
  return Boolean(
    node.matches(PERPLEXITY_SUPPRESSED_CONTAINER_SELECTOR) ||
    node.closest(PERPLEXITY_SUPPRESSED_CONTAINER_SELECTOR)
  );
}

function hasPerplexityMessageText(node: HTMLElement): boolean {
  const body = pickPerplexityMessageBody(node);
  if (!body) return false;

  const clone = cloneHTMLElement(body);
  if (!clone) return false;

  cleanupPerplexityBody(clone);
  return Boolean(clone.textContent?.trim());
}

function resolveCurrentAssistantRoot(node: HTMLElement): HTMLElement {
  return node.closest<HTMLElement>(PERPLEXITY_CURRENT_ASSISTANT_ROOT_SELECTORS) ?? node;
}

function isLikelyCurrentUserSection(node: HTMLElement): boolean {
  if (node.matches('[class*="answer"], [class*="response"], [class~="prose"]')) return false;
  if (node.querySelector('[class~="prose"], [class*="answer"], [class*="response"]')) return false;
  const marker = [
    node.getAttribute('data-testid'),
    node.getAttribute('aria-label'),
    node.className,
    node.textContent ?? ''
  ]
    .join(' ')
    .toLowerCase();
  return /(question|query|prompt|select-text|text-foreground)/.test(marker);
}

function isLikelyCurrentAssistantSection(node: HTMLElement): boolean {
  return (
    node.matches('[class~="prose"], [class*="answer"], [class*="response"]') ||
    Boolean(node.querySelector('[class~="prose"], [class*="answer"], [class*="response"]'))
  );
}

function documentOrder(
  left: PerplexityMessageCandidate,
  right: PerplexityMessageCandidate
): number {
  if (left.node === right.node) return 0;
  const relation = left.node.compareDocumentPosition(right.node);
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  return 0;
}

function uniqueCandidates(
  candidates: readonly PerplexityMessageCandidate[]
): PerplexityMessageCandidate[] {
  const byNode = new Map<HTMLElement, PerplexityMessageCandidate>();
  for (const candidate of candidates) {
    if (
      isPerplexitySuppressedContainer(candidate.node) ||
      !hasPerplexityMessageText(candidate.node)
    )
      continue;
    byNode.set(candidate.node, candidate);
  }
  return Array.from(byNode.values()).sort(documentOrder);
}

function collectCurrentCandidates(doc: Document): PerplexityMessageCandidate[] {
  const candidates: PerplexityMessageCandidate[] = [];
  for (const node of Array.from(
    doc.querySelectorAll<HTMLElement>(PERPLEXITY_CURRENT_USER_SELECTORS)
  )) {
    if (!isLikelyCurrentUserSection(node)) continue;
    candidates.push({ node, role: 'user' });
  }
  for (const node of Array.from(
    doc.querySelectorAll<HTMLElement>(PERPLEXITY_CURRENT_ASSISTANT_SELECTORS)
  )) {
    candidates.push({ node: resolveCurrentAssistantRoot(node), role: 'assistant' });
  }
  return uniqueCandidates(candidates);
}

function collectOrderedSectionCandidates(doc: Document): PerplexityMessageCandidate[] {
  const conversation = doc.querySelector<HTMLElement>(
    'main [aria-label*="conversation" i], main [role="main"], main [class*="max-w-threadContentWidth"], main'
  );
  if (!conversation) return [];

  const sections = Array.from(conversation.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !isPerplexitySuppressedContainer(child) &&
      hasPerplexityMessageText(child)
  );
  if (sections.length < 2 || sections.length % 2 !== 0) return [];

  for (let index = 0; index < sections.length; index += 2) {
    if (
      !isLikelyCurrentUserSection(sections[index]) ||
      !isLikelyCurrentAssistantSection(sections[index + 1])
    )
      return [];
  }
  return sections.map((node, index) => ({ node, role: index % 2 === 0 ? 'user' : 'assistant' }));
}

export function collectPerplexityMessageCandidates(doc: Document): PerplexityMessageCandidate[] {
  const legacyNodes = Array.from(
    doc.querySelectorAll<HTMLElement>(PERPLEXITY_LEGACY_MESSAGE_SELECTORS)
  );
  if (legacyNodes.length > 0) {
    return legacyNodes.map((node) => ({ node, role: detectPerplexityRole(node) }));
  }

  const currentCandidates = collectCurrentCandidates(doc);
  if (currentCandidates.length > 0) {
    const roles = new Set(currentCandidates.map((candidate) => candidate.role));
    if (!roles.has('assistant')) {
      const orderedSectionCandidates = collectOrderedSectionCandidates(doc);
      if (orderedSectionCandidates.length > 0) return orderedSectionCandidates;
    }
    return currentCandidates;
  }

  return collectOrderedSectionCandidates(doc);
}
