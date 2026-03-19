import { describe, expect, it } from 'vitest';
import { validateGlossary, GLOSSARY_RULES } from '../../../src/i18n/glossary';
import zhCN from '../../../src/i18n/locales/zh-CN';

function flattenMessages(record: unknown, prefix = '', output: Record<string, string> = {}): Record<string, string> {
  if (!record || typeof record !== 'object') {
    return output;
  }

  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      output[nextKey] = value;
    } else if (value && typeof value === 'object') {
      flattenMessages(value, nextKey, output);
    }
  }

  return output;
}

describe('i18n glossary validation', () => {
  it('passes for zh-CN locale runtime messages', () => {
    const messages = flattenMessages(zhCN.runtime);
    const violations = validateGlossary(messages, 'zh-CN', GLOSSARY_RULES);
    expect(violations.length).toBe(0);
  });

  it('detects missing required term', () => {
    const altered = {
      ...zhCN.runtime,
      clipButton: '保存'
    };
    const messages = flattenMessages(altered);
    const violations = validateGlossary(messages, 'zh-CN', GLOSSARY_RULES);
    expect(violations.some((violation) => violation.key === 'clipButton' && violation.term === '剪藏')).toBe(true);
  });
});
