import { LANGUAGE_CONFIG, resolveLanguage, type LangCode } from '../../i18n/config';

export type TextBudgetPriority = 'high' | 'medium' | 'low';

export interface TextBudget {
  mobile: number;
  desktop: number;
  component: 'button' | 'label' | 'hint' | 'title';
  priority: TextBudgetPriority;
  notes?: string;
  shortKey?: string;
}

/**
 * Centralised character budgets for high-visibility UI copy. These budgets
 * help us catch translations that are likely to overflow or break layout,
 * especially on compact breakpoints.
 */
export const TEXT_BUDGETS: Record<string, TextBudget> = {
  clipButton: {
    mobile: 10,
    desktop: 14,
    component: 'button',
    priority: 'high',
    notes: 'Primary action in clipper dialog',
    shortKey: 'clipButton_short'
  },
  cancelButton: {
    mobile: 10,
    desktop: 14,
    component: 'button',
    priority: 'high',
    notes: 'Secondary action in clipper dialog and confirm modal',
    shortKey: 'cancelButton_short'
  },
  testConnectionButton: {
    mobile: 20,
    desktop: 28,
    component: 'button',
    priority: 'medium',
    notes: 'Options connection test CTA with emoji prefix',
    shortKey: 'testConnectionButton_short'
  }
};

export type TextBudgetOverride = Partial<TextBudget>;

export const LANGUAGE_SPECIFIC_BUDGETS: Record<string, Record<string, TextBudgetOverride>> = {
  de: {
    clipButton: {
      mobile: 12,
      desktop: 16,
      notes: 'German compound nouns require additional space'
    }
  },
  fr: {
    testConnectionButton: {
      mobile: 24,
      desktop: 32,
      notes: 'French CTA copy includes emoji + longer verbs'
    }
  },
  ru: {
    testConnectionButton: {
      mobile: 24,
      desktop: 34,
      notes: 'Russian CTA strings tend to be longer; allow extra width'
    }
  }
};

export function getTextBudget(key: string, language?: string): TextBudget | undefined {
  const base = TEXT_BUDGETS[key];
  if (!base) {
    return undefined;
  }
  const resolvedLanguage: LangCode | undefined = language ? resolveLanguage(language) : undefined;
  const baseWithMultiplier = applyTextExpansion({ ...base }, resolvedLanguage);
  if (!resolvedLanguage) {
    return baseWithMultiplier;
  }
  const override = LANGUAGE_SPECIFIC_BUDGETS[resolvedLanguage]?.[key];
  if (!override) {
    return baseWithMultiplier;
  }
  return { ...baseWithMultiplier, ...override };
}

function applyTextExpansion(budget: TextBudget, language?: LangCode): TextBudget {
  if (!language) {
    return budget;
  }
  const meta = LANGUAGE_CONFIG[language];
  if (!meta?.textExpansion || meta.textExpansion === 1) {
    return budget;
  }
  const multiplier = meta.textExpansion;
  budget.mobile = Math.ceil(budget.mobile * multiplier);
  budget.desktop = Math.ceil(budget.desktop * multiplier);
  return budget;
}
