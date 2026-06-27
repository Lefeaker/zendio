import { collectOrderedElements, normalizeText } from '../shared/dom';
import type { ParsedMessage } from '../types';

export type ChineseFamilyMessageRole = Extract<ParsedMessage['role'], 'user' | 'assistant'>;

export type ChineseFamilyContainerOptions = {
  shouldSkip?: (element: HTMLElement) => boolean;
};

export type ChineseFamilyPreferredContainerOptions = ChineseFamilyContainerOptions & {
  getPriority?: (element: HTMLElement) => number;
};

export function collectChineseFamilyMessageContainers(
  root: ParentNode,
  selectors: readonly string[],
  options: ChineseFamilyContainerOptions = {}
): HTMLElement[] {
  const containers: HTMLElement[] = [];

  for (const candidate of collectOrderedElements(root, selectors)) {
    if (options.shouldSkip?.(candidate)) continue;
    if (!normalizeText(candidate.textContent ?? '')) continue;
    if (containers.some((container) => container.contains(candidate))) continue;
    if (containers.some((container) => candidate.contains(container))) continue;
    containers.push(candidate);
  }

  return containers;
}

export function collectPreferredChineseFamilyMessageContainers(
  root: ParentNode,
  selectors: readonly string[],
  options: ChineseFamilyPreferredContainerOptions = {}
): HTMLElement[] {
  type ContainerRecord = {
    element: HTMLElement;
    priority: number;
  };

  const selector = selectors.join(', ');
  const containers: ContainerRecord[] = [];
  const getPriority = options.getPriority ?? (() => 0);

  for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (options.shouldSkip?.(candidate)) continue;
    if (!normalizeText(candidate.textContent ?? '')) continue;

    const priority = getPriority(candidate);
    const containingIndex = containers.findIndex((record) => record.element.contains(candidate));

    if (containingIndex >= 0) {
      if (priority < containers[containingIndex].priority) {
        containers[containingIndex] = { element: candidate, priority };
      }
      continue;
    }

    const containedIndexes = containers
      .map((record, index) => (candidate.contains(record.element) ? index : -1))
      .filter((index) => index >= 0);

    if (containedIndexes.length > 0) {
      const bestContainedPriority = Math.min(
        ...containedIndexes.map((index) => containers[index].priority)
      );

      if (priority <= bestContainedPriority) {
        for (const index of containedIndexes.slice().sort((left, right) => right - left)) {
          containers.splice(index, 1);
        }
        containers.push({ element: candidate, priority });
      }
      continue;
    }

    containers.push({ element: candidate, priority });
  }

  return containers
    .sort((left, right) => compareDocumentOrder(left.element, right.element))
    .map((record) => record.element);
}

export function pickFirstNonEmptyChineseFamilyElement(
  root: ParentNode,
  selectors: readonly string[]
): HTMLElement | null {
  for (const selector of selectors) {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (normalizeText(element.textContent ?? '')) {
        return element;
      }
    }
  }

  return null;
}

function compareDocumentOrder(left: HTMLElement, right: HTMLElement): number {
  if (left === right) return 0;

  const position = left.compareDocumentPosition(right);
  return position & 2 ? 1 : -1;
}

export function resolveChineseFamilyRoleFromToken(
  value: string | null | undefined
): ChineseFamilyMessageRole | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  if (/user|human|prompt|question|send/.test(normalized)) return 'user';
  if (/assistant|bot|answer|deepseek|doubao|qwen/.test(normalized)) return 'assistant';

  return undefined;
}

export function resolveChineseFamilyRoleFromAttributes(
  element: HTMLElement,
  attributes: readonly string[]
): ChineseFamilyMessageRole | undefined {
  for (const attribute of attributes) {
    const role = resolveChineseFamilyRoleFromToken(element.getAttribute(attribute));
    if (role) return role;
  }

  return undefined;
}

export function removeChineseFamilyChrome(
  fragment: HTMLElement,
  selectors: readonly string[]
): void {
  for (const selector of selectors) {
    fragment.querySelectorAll(selector).forEach((element) => element.remove());
  }
}
