import {
  AVAILABLE_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_CONFIG,
  PSEUDO_LOCALE_ENABLED,
  WEB_EXTENSION_LOCALE_FOLDERS,
  getConfiguredLanguageCodes,
  getWebExtensionLocaleFolder,
  type AvailableLanguage,
  type LangCode,
  type LanguageMetadata
} from './catalog/languages';
import { CHROME_STATIC_KEYS } from './catalog/static';

export type { AvailableLanguage, LangCode, LanguageMetadata };
export {
  AVAILABLE_LANGUAGES,
  CHROME_STATIC_KEYS,
  DEFAULT_LANGUAGE,
  LANGUAGE_CONFIG,
  PSEUDO_LOCALE_ENABLED,
  WEB_EXTENSION_LOCALE_FOLDERS,
  getConfiguredLanguageCodes,
  getWebExtensionLocaleFolder
};

function normalizeLanguageCandidate(value: string): string {
  return value.trim().replace(/_/g, '-');
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isSupportedLanguage(code: string): code is LangCode {
  return Reflect.has(LANGUAGE_CONFIG, code);
}

function resolveLanguageCandidates(input?: string): LangCode[] {
  const runtimeLanguageOrder = getConfiguredLanguageCodes();
  const candidates: LangCode[] = [];
  const seen = new Set<LangCode>();

  const addCandidate = (code?: string): void => {
    if (!code || !isSupportedLanguage(code)) {
      return;
    }
    if (seen.has(code)) {
      return;
    }
    seen.add(code);
    candidates.push(code);
  };

  if (input) {
    const normalized = normalizeLanguageCandidate(input);

    for (const code of runtimeLanguageOrder) {
      if (equalsIgnoreCase(code, normalized)) {
        addCandidate(code);
        break;
      }
    }

    for (const code of runtimeLanguageOrder) {
      const aliases = LANGUAGE_CONFIG[code]?.aliases ?? [];
      if (aliases.some((alias) => equalsIgnoreCase(alias, normalized))) {
        addCandidate(code);
      }
    }

    const base = normalized.split('-')[0];
    for (const code of runtimeLanguageOrder) {
      if (equalsIgnoreCase(code.split('-')[0], base)) {
        addCandidate(code);
      }
    }
  }

  if (candidates.length === 0) {
    addCandidate(DEFAULT_LANGUAGE);
  }

  for (let index = 0; index < candidates.length; index++) {
    const code = candidates[index];
    const fallbacks = LANGUAGE_CONFIG[code]?.fallbacks ?? [];
    for (const fallback of fallbacks) {
      addCandidate(fallback);
    }
  }

  addCandidate(DEFAULT_LANGUAGE);

  return candidates;
}

export function getLanguageFallbackChain(input?: string): LangCode[] {
  return resolveLanguageCandidates(input);
}

export function resolveLanguage(input?: string): LangCode {
  const [primary] = resolveLanguageCandidates(input);
  return primary ?? DEFAULT_LANGUAGE;
}
