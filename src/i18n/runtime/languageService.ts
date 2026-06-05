import { DEFAULT_LANGUAGE, type LangCode } from '../config';
import { getRuntimeLanguageFallbackChain, resolveRuntimeLanguage } from './fallback';
import type { RuntimeStorageAdapter } from './storageAdapter';

export const LANGUAGE_STORAGE_KEY = 'language';

export interface NavigatorLike {
  language?: string;
  languages?: readonly string[];
}

export interface LanguageService {
  getCurrentLanguage(): Promise<LangCode>;
  setCurrentLanguage(language: string): Promise<void>;
}

export interface LanguageServiceOptions {
  storage?: RuntimeStorageAdapter | null;
  storageKey?: string;
  defaultLanguage?: LangCode;
  getNavigator?: () => NavigatorLike | null | undefined;
  getChromeI18nLanguage?: () => string | null | undefined;
  getLanguageFallbackChain?: (input?: string) => readonly LangCode[];
  resolveLanguage?: (input?: string) => LangCode;
  onReadError?: (cause: unknown) => Promise<void>;
  onWriteError?: (language: string, cause: unknown) => Promise<void>;
}

function normalizeLanguageCandidate(value: string): string {
  return value.trim().replace(/_/g, '-');
}

function getCandidateKey(value: string): string {
  return normalizeLanguageCandidate(value).toLowerCase();
}

export function createLanguageService(options: LanguageServiceOptions = {}): LanguageService {
  const storage = options.storage ?? null;
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY;
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_LANGUAGE;
  const getLanguageFallbackChain =
    options.getLanguageFallbackChain ?? getRuntimeLanguageFallbackChain;
  const resolveLanguage = options.resolveLanguage ?? resolveRuntimeLanguage;
  const getNavigator = options.getNavigator ?? (() => undefined);

  const collectAutomaticLanguageCandidates = (): string[] => {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const addCandidate = (language?: string | null): void => {
      if (!language) {
        return;
      }
      const normalized = normalizeLanguageCandidate(language);
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push(normalized);
    };

    const navigatorLike = getNavigator();
    for (const language of navigatorLike?.languages ?? []) {
      addCandidate(language);
    }
    addCandidate(navigatorLike?.language);

    try {
      addCandidate(options.getChromeI18nLanguage?.());
    } catch {
      // Treat unreadable extension i18n globals the same as missing ones.
    }

    return candidates;
  };

  const isDefaultLanguageCandidate = (candidate: string): boolean => {
    const candidateKey = getCandidateKey(candidate);
    const defaultKey = getCandidateKey(defaultLanguage);
    return candidateKey === defaultKey || candidateKey.split('-')[0] === defaultKey.split('-')[0];
  };

  const resolveAutomaticCandidate = (candidate: string): LangCode | null => {
    const resolvedLanguage = resolveLanguage(candidate);
    if (resolvedLanguage !== defaultLanguage) {
      return resolvedLanguage;
    }

    const [primaryFallback] = getLanguageFallbackChain(candidate);
    if (primaryFallback && primaryFallback !== defaultLanguage) {
      return primaryFallback;
    }

    return isDefaultLanguageCandidate(candidate) ? defaultLanguage : null;
  };

  const resolveFromAutomaticCandidates = (): LangCode => {
    for (const candidate of collectAutomaticLanguageCandidates()) {
      const resolvedLanguage = resolveAutomaticCandidate(candidate);
      if (resolvedLanguage) {
        return resolvedLanguage;
      }
    }

    return defaultLanguage;
  };

  return {
    async getCurrentLanguage() {
      if (!storage) {
        return resolveFromAutomaticCandidates();
      }

      try {
        const value = await storage.get<string>(storageKey);
        if (value) {
          return resolveLanguage(value);
        }
        return resolveFromAutomaticCandidates();
      } catch (cause) {
        await options.onReadError?.(cause);
        return resolveFromAutomaticCandidates();
      }
    },
    async setCurrentLanguage(language: string) {
      if (!storage) {
        return;
      }

      const resolvedLanguage = resolveLanguage(language);

      try {
        await storage.set(storageKey, resolvedLanguage);
      } catch (cause) {
        await options.onWriteError?.(language, cause);
      }
    }
  };
}
