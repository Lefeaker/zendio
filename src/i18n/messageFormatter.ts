import { DEFAULT_LANGUAGE } from './config';

type MessageValue = string | number | boolean | Date | null | undefined;
type MessageValues = Record<string, MessageValue>;

interface FormatOptions {
  language?: string;
  values?: MessageValues;
}

function normalizeLanguage(language?: string): string {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }
  return language;
}

function legacyInterpolate(template: string, values: MessageValues): string {
  const valueMap = new Map<string, MessageValue>(Object.entries(values));
  return template.replace(/\{(\w+)\}/g, (match: string, token: string) => {
    if (!valueMap.has(token)) {
      return match;
    }
    const value = valueMap.get(token);
    return value === undefined || value === null ? match : String(value);
  });
}

function findMatchingBrace(template: string, startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < template.length; index += 1) {
    const char = template[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error('Unbalanced ICU braces.');
}

function readIdentifier(source: string, startIndex: number): { value: string; nextIndex: number } {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }

  const begin = index;
  while (index < source.length && !/\s|\{/.test(source[index])) {
    index += 1;
  }

  const value = source.slice(begin, index);
  if (!value) {
    throw new Error('Missing ICU plural selector.');
  }
  return { value, nextIndex: index };
}

function readBlock(source: string, startIndex: number): { value: string; nextIndex: number } {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  if (source[index] !== '{') {
    throw new Error('Expected ICU plural block.');
  }

  const endIndex = findMatchingBrace(source, index);
  return {
    value: source.slice(index + 1, endIndex),
    nextIndex: endIndex + 1
  };
}

function parsePluralBranches(source: string): Map<string, string> {
  const branches = new Map<string, string>();
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }
    if (index >= source.length) {
      break;
    }

    const selector = readIdentifier(source, index);
    const block = readBlock(source, selector.nextIndex);
    branches.set(selector.value, block.value);
    index = block.nextIndex;
  }

  if (!branches.size) {
    throw new Error('Missing ICU plural branches.');
  }

  return branches;
}

function formatPluralToken(content: string, values: MessageValues, language: string): string {
  const firstComma = content.indexOf(',');
  const secondComma = content.indexOf(',', firstComma + 1);
  if (firstComma <= 0 || secondComma <= firstComma) {
    throw new Error('Malformed ICU plural token.');
  }

  const variableName = content.slice(0, firstComma).trim();
  const formatterType = content.slice(firstComma + 1, secondComma).trim();
  if (formatterType !== 'plural') {
    throw new Error(`Unsupported ICU formatter: ${formatterType}`);
  }

  const rawValue = values[variableName];
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    throw new Error(`Plural variable "${variableName}" must be a finite number.`);
  }

  const branches = parsePluralBranches(content.slice(secondComma + 1));
  const exactBranch = branches.get(`=${rawValue}`);
  const pluralRules = new Intl.PluralRules(normalizeLanguage(language));
  const categoryBranch = branches.get(pluralRules.select(rawValue));
  const otherBranch = branches.get('other');
  const selectedBranch = exactBranch ?? categoryBranch ?? otherBranch;

  if (!selectedBranch) {
    throw new Error(`No ICU plural branch matched "${variableName}".`);
  }

  return formatTemplate(selectedBranch.replaceAll('#', String(rawValue)), values, language);
}

function formatToken(token: string, values: MessageValues, language: string): string {
  if (token.includes(', plural,')) {
    return formatPluralToken(token, values, language);
  }
  if (token.includes(',')) {
    throw new Error(`Unsupported ICU token: ${token}`);
  }

  const key = token.trim();
  if (!key) {
    throw new Error('Empty ICU token.');
  }

  const value = values[key];
  if (value === undefined || value === null) {
    return `{${token}}`;
  }
  return String(value);
}

function formatTemplate(template: string, values: MessageValues, language: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < template.length) {
    const openIndex = template.indexOf('{', cursor);
    if (openIndex === -1) {
      output += template.slice(cursor);
      break;
    }

    output += template.slice(cursor, openIndex);
    const closeIndex = findMatchingBrace(template, openIndex);
    const token = template.slice(openIndex + 1, closeIndex);
    output += formatToken(token, values, language);
    cursor = closeIndex + 1;
  }

  return output;
}

export function formatWithICU(template: string, options: FormatOptions = {}): string {
  const { language, values } = options;
  const selectedValues: MessageValues = values ?? {};
  if (!template) {
    return '';
  }

  try {
    return formatTemplate(template, selectedValues, normalizeLanguage(language));
  } catch {
    // 兼容：若 ICU 解析失败，退回原有的简单插值逻辑，避免因单个文案阻断流程
    return legacyInterpolate(template, selectedValues);
  }
}
