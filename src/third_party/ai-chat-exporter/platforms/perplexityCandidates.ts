import {
  detectPerplexityRole,
  hasPerplexityMessageText,
  isLikelyCurrentAssistantSection,
  isLikelyCurrentUserSection,
  isPerplexitySuppressedContainer,
  PERPLEXITY_CURRENT_ASSISTANT_SELECTORS,
  PERPLEXITY_CURRENT_USER_SELECTORS,
  PERPLEXITY_LEGACY_MESSAGE_SELECTORS,
  resolveCurrentAssistantRoot,
  type PerplexityMessageRole
} from './perplexityDom';

const PERPLEXITY_CURRENT_TURN_PANEL_SELECTORS = '[role="tabpanel"]';
const PERPLEXITY_CONVERSATION_SELECTOR =
  'main [aria-label*="conversation" i], main [role="main"], main [class*="max-w-threadContentWidth"], main';
const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;

export type PerplexityMessageCandidate = {
  node: HTMLElement;
  role: PerplexityMessageRole;
};

function documentOrder(
  left: PerplexityMessageCandidate,
  right: PerplexityMessageCandidate
): number {
  if (left.node === right.node) return 0;
  const relation = left.node.compareDocumentPosition(right.node);
  if (relation & DOCUMENT_POSITION_PRECEDING) return 1;
  if (relation & DOCUMENT_POSITION_FOLLOWING) return -1;
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

function isUserFirstAlternating(candidates: readonly PerplexityMessageCandidate[]): boolean {
  return (
    candidates.length >= 2 &&
    candidates.every((candidate, index) =>
      index % 2 === 0 ? candidate.role === 'user' : candidate.role === 'assistant'
    )
  );
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

function resolveScopedCurrentAssistantRoot(
  node: HTMLElement,
  scope: HTMLElement,
  userNode: HTMLElement
): HTMLElement {
  const root = resolveCurrentAssistantRoot(node);
  if (root !== scope && scope.contains(root) && !root.contains(userNode)) return root;
  return node;
}

function findPanelUserNode(panel: HTMLElement): HTMLElement | null {
  const userNodes = Array.from(
    panel.querySelectorAll<HTMLElement>(PERPLEXITY_CURRENT_USER_SELECTORS)
  );
  return (
    userNodes.find(
      (node) =>
        !isPerplexitySuppressedContainer(node) &&
        isLikelyCurrentUserSection(node) &&
        hasPerplexityMessageText(node)
    ) ?? null
  );
}

function isBefore(left: HTMLElement, right: HTMLElement): boolean {
  if (left === right) return false;
  return Boolean(left.compareDocumentPosition(right) & DOCUMENT_POSITION_FOLLOWING);
}

function findPanelAssistantNode(panel: HTMLElement, userNode: HTMLElement): HTMLElement | null {
  const assistantNodes = Array.from(
    panel.querySelectorAll<HTMLElement>(PERPLEXITY_CURRENT_ASSISTANT_SELECTORS)
  );
  for (const node of assistantNodes) {
    if (userNode.contains(node) || node.contains(userNode)) continue;
    if (!isBefore(userNode, node)) continue;

    const root = resolveScopedCurrentAssistantRoot(node, panel, userNode);
    if (isPerplexitySuppressedContainer(root) || !hasPerplexityMessageText(root)) continue;
    return root;
  }
  return null;
}

function collectTurnPanelCandidates(doc: Document): PerplexityMessageCandidate[] {
  const conversation = doc.querySelector<HTMLElement>(PERPLEXITY_CONVERSATION_SELECTOR);
  if (!conversation) return [];

  const candidates: PerplexityMessageCandidate[] = [];
  for (const panel of Array.from(
    conversation.querySelectorAll<HTMLElement>(PERPLEXITY_CURRENT_TURN_PANEL_SELECTORS)
  )) {
    if (isPerplexitySuppressedContainer(panel)) continue;

    const userNode = findPanelUserNode(panel);
    if (!userNode) continue;

    const assistantNode = findPanelAssistantNode(panel, userNode);
    if (!assistantNode) continue;

    candidates.push({ node: userNode, role: 'user' }, { node: assistantNode, role: 'assistant' });
  }

  const unique = uniqueCandidates(candidates);
  return isUserFirstAlternating(unique) ? unique : [];
}

function collectOrderedSectionCandidates(doc: Document): PerplexityMessageCandidate[] {
  const conversation = doc.querySelector<HTMLElement>(PERPLEXITY_CONVERSATION_SELECTOR);
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
    if (isUserFirstAlternating(currentCandidates)) return currentCandidates;

    const turnPanelCandidates = collectTurnPanelCandidates(doc);
    if (turnPanelCandidates.length > 0) return turnPanelCandidates;

    const orderedSectionCandidates = collectOrderedSectionCandidates(doc);
    if (orderedSectionCandidates.length > 0) return orderedSectionCandidates;

    return [];
  }

  const turnPanelCandidates = collectTurnPanelCandidates(doc);
  if (turnPanelCandidates.length > 0) return turnPanelCandidates;

  return collectOrderedSectionCandidates(doc);
}
