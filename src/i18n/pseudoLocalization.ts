import type { LocaleStaticMessages } from './localeDefinition';
import type { Messages } from './messages';

const ACCENT_MAP: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ď',
  e: 'è',
  f: 'ƒ',
  g: 'ğ',
  h: 'ĥ',
  i: 'ì',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  m: 'ṁ',
  n: 'ñ',
  o: 'ò',
  p: 'ṕ',
  q: 'ʠ',
  r: 'ř',
  s: 'š',
  t: 'ť',
  u: 'ù',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž'
};

function accentChar(char: string): string {
  const lowercase = char.toLowerCase();
  const mapped = ACCENT_MAP[lowercase];
  if (!mapped) {
    return char;
  }
  return char === lowercase ? mapped : mapped.toUpperCase();
}

function transformSegment(segment: string): string {
  let result = '';
  for (const char of segment) {
    const accented = accentChar(char);
    result += accented;
    if (/[aeiou]/i.test(char)) {
      result += 'ː';
    }
  }
  return result;
}

function findMatchingBrace(source: string, startIndex: number): number {
  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findTopLevelComma(source: string): number {
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      return index;
    }
  }

  return -1;
}

function isLikelyHtmlTagStart(source: string, index: number): boolean {
  const nextChar = source[index + 1];
  return nextChar !== undefined && /[A-Za-z!/]/.test(nextChar);
}

function pseudoLocalizeFormatterBranches(source: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = source.indexOf('{', cursor);
    if (openIndex === -1) {
      result += source.slice(cursor);
      break;
    }

    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex === -1) {
      result += source.slice(cursor);
      break;
    }

    result += source.slice(cursor, openIndex + 1);
    result += pseudoLocalizeSegments(source.slice(openIndex + 1, closeIndex));
    result += '}';
    cursor = closeIndex + 1;
  }

  return result;
}

function pseudoLocalizeBraceToken(token: string): string {
  const content = token.slice(1, -1);
  const firstComma = findTopLevelComma(content);
  if (firstComma === -1) {
    return token;
  }

  const remainder = content.slice(firstComma + 1);
  const secondComma = findTopLevelComma(remainder);
  if (secondComma === -1) {
    return token;
  }

  const formatterType = remainder.slice(0, secondComma).trim();
  if (!['plural', 'select', 'selectordinal'].includes(formatterType)) {
    return token;
  }

  const formatterBranches = remainder.slice(secondComma + 1);
  return `{${content.slice(0, firstComma + 1)}${remainder.slice(
    0,
    secondComma + 1
  )}${pseudoLocalizeFormatterBranches(formatterBranches)}}`;
}

function pseudoLocalizeSegments(source: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < source.length) {
    const nextBrace = source.indexOf('{', cursor);
    const nextTag = source.indexOf('<', cursor);

    const nextTokenIndex =
      nextBrace === -1
        ? nextTag
        : nextTag === -1
          ? nextBrace
          : Math.min(nextBrace, nextTag);

    if (nextTokenIndex === -1) {
      result += transformSegment(source.slice(cursor));
      break;
    }

    if (nextTokenIndex > cursor) {
      result += transformSegment(source.slice(cursor, nextTokenIndex));
    }

    if (nextTokenIndex === nextBrace) {
      const closeIndex = findMatchingBrace(source, nextBrace);
      if (closeIndex === -1) {
        result += transformSegment(source.slice(nextBrace));
        break;
      }

      result += pseudoLocalizeBraceToken(source.slice(nextBrace, closeIndex + 1));
      cursor = closeIndex + 1;
      continue;
    }

    if (!isLikelyHtmlTagStart(source, nextTag)) {
      result += transformSegment(source[nextTag]);
      cursor = nextTag + 1;
      continue;
    }

    const closeIndex = source.indexOf('>', nextTag + 1);
    if (closeIndex === -1) {
      result += transformSegment(source.slice(nextTag));
      break;
    }

    result += source.slice(nextTag, closeIndex + 1);
    cursor = closeIndex + 1;
  }

  return result;
}

export function pseudoLocalizeString(text: string): string {
  if (!text) {
    return text;
  }

  const transformed = pseudoLocalizeSegments(text);

  if (!transformed.trim()) {
    return transformed;
  }

  return `[${transformed}·${text.length}]`;
}

type StringRecordShape<T> = { [Key in keyof T]: string };

export function pseudoLocalizeRecord<T extends StringRecordShape<T>>(base: T): T {
  const entries = Object.keys(base).map((key) => {
    const typedKey = key as keyof T;
    return [typedKey, pseudoLocalizeString(base[typedKey])];
  });
  return Object.fromEntries(entries) as T;
}

export function pseudoLocalizeMessages(base: Messages): Messages {
  const entries = Object.keys(base).map((key) => {
    const typedKey = key as keyof Messages;
    const value = base[typedKey];
    return [typedKey, pseudoLocalizeString(value ?? '')];
  });
  return Object.fromEntries(entries) as Messages;
}

export function pseudoLocalizeStatic(base: LocaleStaticMessages): LocaleStaticMessages {
  return pseudoLocalizeRecord(base);
}
