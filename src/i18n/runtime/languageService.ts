import { DEFAULT_LANGUAGE, type LangCode } from '../config';
import { resolveRuntimeLanguage } from './fallback';
import type { RuntimeStorageAdapter } from './storageAdapter';

export const LANGUAGE_STORAGE_KEY = 'language';

export interface NavigatorLike {
  language?: string;
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
  resolveLanguage?: (input?: string) => LangCode;
  onReadError?: (cause: unknown) => Promise<void>;
  onWriteError?: (language: string, cause: unknown) => Promise<void>;
}

export function createLanguageService(options: LanguageServiceOptions = {}): LanguageService {
  const storage = options.storage ?? null;
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY;
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_LANGUAGE;
  const resolveLanguage = options.resolveLanguage ?? resolveRuntimeLanguage;
  const getNavigator = options.getNavigator ?? (() => undefined);

  const resolveFromNavigator = (): LangCode => {
    const navigatorLike = getNavigator();
    if (!navigatorLike?.language) {
      return defaultLanguage;
    }
    return resolveLanguage(navigatorLike.language);
  };

  return {
    async getCurrentLanguage() {
      if (!storage) {
        return resolveFromNavigator();
      }

      try {
        const value = await storage.get<string>(storageKey);
        if (value) {
          return resolveLanguage(value);
        }
        return resolveFromNavigator();
      } catch (cause) {
        await options.onReadError?.(cause);
        return resolveFromNavigator();
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
