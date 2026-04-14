import type { Language } from '@i18n';
import type { IOptionsRepository } from '@shared/repositories';

export interface LanguagePreferenceActionOptions {
  persist?: boolean;
}

export async function runLanguagePreferenceAction(
  language: Language,
  dependencies: {
    changeLanguage: (language: Language) => Promise<void>;
    optionsRepository: Pick<IOptionsRepository, 'set'>;
  },
  options: LanguagePreferenceActionOptions = {}
): Promise<void> {
  await dependencies.changeLanguage(language);
  if (options.persist === false) {
    return;
  }
  await dependencies.optionsRepository.set({
    languagePreference: {
      code: language
    }
  });
}
