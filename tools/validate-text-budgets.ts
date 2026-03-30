import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Messages } from '../src/i18n/messages';
import { messages as localeMessages } from '../src/i18n/locales';
import { TEXT_BUDGETS, getTextBudget, type TextBudget } from '../src/shared/i18n/budgets';

interface BudgetViolation {
  key: string;
  language: string;
  currentLength: number;
  budgetLimit: number;
  severity: 'warning' | 'error';
}

const PLACEHOLDER_PATTERN = /\{[^}]+\}/g;

function stripPlaceholders(value: string): string {
  return value.replace(PLACEHOLDER_PATTERN, '');
}

function measureLength(value: string): number {
  return [...value].length;
}

function resolveLimit(budget: TextBudget, target: 'mobile' | 'desktop'): number {
  return budget[target];
}

function resolveMessages(language: string): Messages {
  const normalized = (localeMessages as Record<string, Messages>)[language];
  if (!normalized) {
    throw new Error(`Unsupported language "${language}" in TEXT_BUDGETS validation.`);
  }
  return normalized;
}

function getShortVariantKey(key: string, budget?: TextBudget): string {
  return budget?.shortKey ?? `${key}_short`;
}

function validateBudgetForLanguage(language: string, budgetKey: string): BudgetViolation[] {
  const result: BudgetViolation[] = [];
  const budget = getTextBudget(budgetKey, language);
  if (!budget) {
    return result;
  }
  const messages = resolveMessages(language);
  const value = messages[budgetKey as keyof Messages];

  if (typeof value !== 'string') {
    return result;
  }

  const clean = stripPlaceholders(value);
  const length = measureLength(clean);
  const desktopLimit = resolveLimit(budget, 'desktop');
  const mobileLimit = resolveLimit(budget, 'mobile');

  if (length <= desktopLimit) {
    // Length already within desktop limit, no need to check short variant.
    if (length > mobileLimit) {
      result.push({
        key: budgetKey,
        language,
        currentLength: length,
        budgetLimit: mobileLimit,
        severity: 'warning'
      });
    }
    return result;
  }

  const shortKey = getShortVariantKey(budgetKey, budget);
  const shortValue = messages[shortKey as keyof Messages];
  const shortClean = typeof shortValue === 'string' ? stripPlaceholders(shortValue) : undefined;
  const shortLength = shortClean ? measureLength(shortClean) : undefined;

  if (shortLength !== undefined && shortLength <= desktopLimit) {
    // Short copy exists and fits within desktop limit; still flag as warning to highlight switch.
    result.push({
      key: `${budgetKey} (uses ${String(shortKey)})`,
      language,
      currentLength: length,
      budgetLimit: desktopLimit,
      severity: 'warning'
    });
    return result;
  }

  result.push({
    key: budgetKey,
    language,
    currentLength: length,
    budgetLimit: desktopLimit,
    severity: 'error'
  });
  return result;
}

async function main(): Promise<void> {
  const languages = Object.keys(localeMessages).filter((code) => code !== 'qps-ploc');
  const violations: BudgetViolation[] = [];

  for (const budgetKey of Object.keys(TEXT_BUDGETS)) {
    for (const language of languages) {
      try {
        violations.push(...validateBudgetForLanguage(language, budgetKey));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to validate budget "${budgetKey}" for "${language}": ${message}`);
      }
    }
  }

  if (violations.length === 0) {
    console.log('✅ All budgeted messages satisfy mobile and desktop limits.');
    return;
  }

  const summary = violations.reduce<Record<'warning' | 'error', number>>(
    (acc, violation) => {
      acc[violation.severity] += 1;
      return acc;
    },
    { warning: 0, error: 0 }
  );

  console.log(`❌ Detected ${violations.length} budget violation(s).`);
  for (const violation of violations) {
    const icon = violation.severity === 'error' ? '🚨' : '⚠️';
    console.log(
      `${icon} ${violation.language}.${violation.key}: ${violation.currentLength} > ${violation.budgetLimit}`
    );
  }

  if (summary.error > 0) {
    process.exitCode = 1;
  }
}

// Ensure the script is executed from repository root when run via tsx
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (process.cwd() !== path.join(__dirname, '..')) {
  process.chdir(path.join(__dirname, '..'));
}

main().catch((error) => {
  console.error('Failed to validate text budgets.');
  console.error(error);
  process.exitCode = 1;
});
