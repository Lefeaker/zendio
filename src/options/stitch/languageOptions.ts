import {
  RELEASE_LANGUAGE_CONFIG,
  RELEASE_LANGUAGE_ORDER,
  type LanguageMetadata,
  type ReleaseLangCode
} from '@i18n/catalog/languages';
import type { SelectOption } from './types';

type ReleaseLanguageLabelResolver = (code: ReleaseLangCode, metadata: LanguageMetadata) => string;

export function createReleaseLanguageOptions(
  resolveLabel?: ReleaseLanguageLabelResolver
): SelectOption[] {
  return RELEASE_LANGUAGE_ORDER.map((code) => {
    const metadata = RELEASE_LANGUAGE_CONFIG[code];
    return {
      value: code,
      label: resolveLabel ? resolveLabel(code, metadata) : metadata.nativeName
    };
  });
}
