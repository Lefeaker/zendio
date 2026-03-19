import type { LocaleStaticMessages } from './localeDefinition';
import type { Messages } from './messages';

const TOKEN_PATTERN = /(\{[^}]+\}|<[^>]+>|[^{}<]+)/g;

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

export function pseudoLocalizeString(text: string): string {
  if (!text) {
    return text;
  }

  const tokens = text.match(TOKEN_PATTERN) ?? [text];
  const transformed = tokens
    .map((token) => {
      const trimmed = token.trim();
      const isPlaceholder = trimmed.startsWith('{') && trimmed.endsWith('}');
      const isHtmlTag = trimmed.startsWith('<') && trimmed.endsWith('>');
      return isPlaceholder || isHtmlTag ? token : transformSegment(token);
    })
    .join('');

  if (!transformed.trim()) {
    return transformed;
  }

  return `[${transformed}·${text.length}]`;
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
  return {
    extName: pseudoLocalizeString(base.extName),
    extDescription: pseudoLocalizeString(base.extDescription)
  };
}
