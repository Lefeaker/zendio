import type { LangCode } from './config';

export type GlossarySeverity = 'error' | 'warning';

export interface GlossaryLocaleRule {
  /**
   * Substrings that must exist in the translated message.
   * Case-sensitive; use multiple entries when variants are acceptable.
   */
  required?: string[];
  /**
   * Substrings that must not exist in the translated message.
   */
  forbidden?: string[];
}

export interface GlossaryRule {
  id: string;
  description: string;
  keys: string[];
  locales: Partial<Record<LangCode, GlossaryLocaleRule>>;
  severity?: GlossarySeverity;
}

export type GlossaryViolationType = 'missing' | 'forbidden';

export interface GlossaryViolation {
  ruleId: string;
  key: string;
  language: string;
  term: string;
  type: GlossaryViolationType;
  severity: GlossarySeverity;
  message: string;
}

const DEFAULT_SEVERITY: GlossarySeverity = 'error';

export const GLOSSARY_RULES: GlossaryRule[] = [
  {
    id: 'vault-term',
    description: '确保 Vault 相关文案保持一致的术语表达。',
    keys: ['vaultNameLabel', 'connectionFailureHintCheckVault'],
    locales: {
      'zh-CN': {
        required: ['Vault']
      }
    }
  },
  {
    id: 'clip-term',
    description: '主流程的剪藏操作需要统一使用“剪藏”这一术语。',
    keys: [
      'clipButton',
      'clipButton_short',
      'clipFullPage',
      'clipSelection',
      'clipSelectionVideo',
      'clipperShortcutHintModifierEnter'
    ],
    locales: {
      'zh-CN': {
        required: ['剪藏']
      }
    }
  },
  {
    id: 'obsidian-local-rest-api',
    description: 'Obsidian Local REST API 属于产品名称，需要保持原文。',
    keys: ['apiConfigTitle', 'apiKeyHint'],
    locales: {
      'zh-CN': {
        required: ['Obsidian Local REST API']
      }
    }
  },
  {
    id: 'gemini-deep-research',
    description: 'Gemini Deep Research 相关文案需要保留 Gemini 品牌名。',
    keys: ['deepResearchConfigTitle', 'deepResearchConfigHint', 'multipleReportsInfo'],
    locales: {
      'zh-CN': {
        required: ['Gemini']
      }
    }
  }
];

function collectMissingTerms(value: string, required: string[]): string[] {
  if (!required || required.length === 0) {
    return [];
  }

  return required.filter((term) => !value.includes(term));
}

function collectForbiddenTerms(value: string, forbidden: string[]): string[] {
  if (!forbidden || forbidden.length === 0) {
    return [];
  }

  return forbidden.filter((term) => value.includes(term));
}

export function validateGlossary(
  messages: Record<string, string>,
  language: string,
  rules: GlossaryRule[] = GLOSSARY_RULES
): GlossaryViolation[] {
  const violations: GlossaryViolation[] = [];
  const languageKey = language;

  for (const rule of rules) {
    const localeRule = rule.locales[languageKey as LangCode];
    if (!localeRule) {
      continue;
    }

    const severity = rule.severity ?? DEFAULT_SEVERITY;
    const requiredTerms = localeRule.required ?? [];
    const forbiddenTerms = localeRule.forbidden ?? [];

    for (const key of rule.keys) {
      const value = messages[key];
      if (typeof value !== 'string') {
        continue;
      }

      const missingTerms = collectMissingTerms(value, requiredTerms);
      for (const term of missingTerms) {
        violations.push({
          ruleId: rule.id,
          key,
          language: languageKey,
          term,
          type: 'missing',
          severity,
          message: `[${languageKey}] "${key}" 缺少术语 "${term}" （规则：${rule.id}）`
        });
      }

      const invalidTerms = collectForbiddenTerms(value, forbiddenTerms);
      for (const term of invalidTerms) {
        violations.push({
          ruleId: rule.id,
          key,
          language: languageKey,
          term,
          type: 'forbidden',
          severity,
          message: `[${languageKey}] "${key}" 不允许包含术语 "${term}" （规则：${rule.id}）`
        });
      }
    }
  }

  return violations;
}
