import { collectOrderedElements, normalizeText } from '../shared/dom';
import type { ParsedMessage } from '../types';

export type ChineseFamilyMessageRole = Extract<ParsedMessage['role'], 'user' | 'assistant'>;

export type ChineseFamilyContainerOptions = {
  shouldSkip?: (element: HTMLElement) => boolean;
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
