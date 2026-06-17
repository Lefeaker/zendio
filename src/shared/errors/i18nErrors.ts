import { AppError, ErrorSeverity } from './types';

interface LanguageContext extends Record<string, unknown> {
  language?: string;
  storageKey?: string;
}

export const i18nErrors = {
  languageLoadFailed(cause: unknown, context: LanguageContext = {}): AppError {
    return {
      code: 'I18N_LANGUAGE_LOAD_FAILED',
      domain: 'i18n',
      message: 'I18N_LANGUAGE_LOAD_FAILED',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorI18nLanguageLoadFailed' },
      context,
      cause
    };
  },

  languagePersistFailed(language: string, cause: unknown, context: LanguageContext = {}): AppError {
    return {
      code: 'I18N_LANGUAGE_SAVE_FAILED',
      domain: 'i18n',
      message: `Failed to persist language preference (${language}).`,
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorI18nLanguageSaveFailed' },
      context: {
        ...context,
        language
      },
      cause
    };
  }
} as const;

export type I18nErrorCode = ReturnType<(typeof i18nErrors)[keyof typeof i18nErrors]>['code'];
