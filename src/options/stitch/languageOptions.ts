import { RELEASE_LANGUAGE_CONFIG, RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';
import type { SelectOption } from './types';

export function createReleaseLanguageOptions(): SelectOption[] {
  return RELEASE_LANGUAGE_ORDER.map((code) => ({
    value: code,
    label: RELEASE_LANGUAGE_CONFIG[code].nativeName
  }));
}
