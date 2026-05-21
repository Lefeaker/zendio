import type { Messages } from '../../i18n/messages';
import type { I18nResource } from '../../i18n/types';
import { getTextBudget, type TextBudget } from './budgets';
import { logTextOverflowEvent } from './overflowLogger';
import type { AdaptiveTextResult } from './textAdaptationTypes';

export type { AdaptiveTextResult } from './textAdaptationTypes';

const PLACEHOLDER_PATTERN = /\{[^}]+\}/g;

interface AdaptationOptions {
  viewportWidth?: number;
}

function stripPlaceholders(value: string): string {
  return value.replace(PLACEHOLDER_PATTERN, '');
}

function measureLength(value: string): number {
  return [...value].length;
}

function resolveLimit(budget: TextBudget, options?: AdaptationOptions): number {
  if (options?.viewportWidth !== undefined) {
    return options.viewportWidth < 768 ? budget.mobile : budget.desktop;
  }

  if (typeof window !== 'undefined') {
    return window.innerWidth < 768 ? budget.mobile : budget.desktop;
  }

  return budget.desktop;
}

function resolveShortKey(key: keyof Messages, budget?: TextBudget): keyof Messages {
  const override = budget?.shortKey;
  const suffix = override ?? `${String(key)}_short`;
  return suffix as keyof Messages;
}

export function resolveAdaptiveText(
  key: keyof Messages,
  resource: I18nResource,
  options?: AdaptationOptions
): AdaptiveTextResult {
  const raw = resource.get(key);
  const value = typeof raw === 'string' ? raw : String(raw ?? '');
  const budget = getTextBudget(String(key), resource.language);
  const language = resource.language;
  const length = measureLength(stripPlaceholders(value));

  if (!budget) {
    return {
      value,
      usedShort: false,
      language,
      length
    };
  }

  const limit = resolveLimit(budget, options);
  const shortKey = resolveShortKey(key, budget);
  const shortRaw = resource.get(shortKey);
  const shortValue = typeof shortRaw === 'string' ? shortRaw : undefined;

  if (shortValue) {
    const shortLength = measureLength(stripPlaceholders(shortValue));
    if (length > limit && shortLength <= limit) {
      return {
        value: shortValue,
        usedShort: true,
        original: value,
        budget,
        overLimit: false,
        language,
        length: shortLength,
        limit
      };
    }
  }

  return {
    value,
    usedShort: false,
    budget,
    overLimit: length > limit,
    language,
    length,
    limit
  };
}

export function annotateBudgetMetadata(
  element: HTMLElement,
  key: string,
  budget?: TextBudget
): void {
  if (!budget) {
    delete element.dataset.budgetKey;
    delete element.dataset.component;
    delete element.dataset.priority;
    return;
  }

  element.dataset.budgetKey = key;
  if (!element.dataset.component) {
    element.dataset.component = budget.component;
  }
  if (!element.dataset.priority) {
    element.dataset.priority = budget.priority;
  }
}

export function applyAdaptiveState(element: HTMLElement, result: AdaptiveTextResult): void {
  if (!result.budget) {
    delete element.dataset.adapted;
    delete element.dataset.originalText;
    return;
  }

  if (result.usedShort) {
    element.dataset.adapted = 'short';
    if (result.original) {
      if (!element.dataset.originalText) {
        element.dataset.originalText = result.original;
      } else {
        element.dataset.originalText = result.original;
      }
      if (!element.hasAttribute('title')) {
        element.setAttribute('title', result.original);
      }
    }
    return;
  }

  if (result.overLimit) {
    element.dataset.adapted = 'overflow';
    element.dataset.originalText = result.value;
    logTextOverflowEvent(element, result);
    return;
  }

  element.dataset.adapted = 'full';
  const existingTitle = element.getAttribute('title');
  if (element.dataset.originalText && existingTitle === element.dataset.originalText) {
    element.removeAttribute('title');
  }
  delete element.dataset.originalText;
}
