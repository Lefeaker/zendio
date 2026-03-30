import { describe, it, expect } from 'vitest';
import { getTextBudget } from '@shared/i18n/budgets';

describe('text budgets with language metadata', () => {
  it('applies text expansion multiplier for languages with fallback resolution', () => {
    const budget = getTextBudget('clipButton', 'es-MX');
    expect(budget).toBeDefined();
    expect(budget?.mobile).toBe(13);
    expect(budget?.desktop).toBe(18);
  });

  it('keeps manual overrides when present', () => {
    const budget = getTextBudget('clipButton', 'de');
    expect(budget).toBeDefined();
    expect(budget?.mobile).toBe(12);
    expect(budget?.desktop).toBe(16);
  });
});
