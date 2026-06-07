import type { LangCode, ReleaseLangCode } from '../../src/i18n/catalog/languages';
import type { LocaleDefinition } from '../../src/i18n/localeDefinition';
import { RELEASE_LANGUAGE_ORDER } from '../../src/i18n/catalog/languages';
import { buildPseudoLocaleDefinition } from '../../src/i18n/catalog/pseudoLocale';
import { GENERATED_RELEASE_LOCALE_REGISTRY } from '../../src/i18n/generated/localeRegistry.generated';
import { GENERATED_RELEASE_STATIC_REGISTRY } from '../../src/i18n/generated/staticRegistry.generated';

const RELEASE_LOCALE_DEFINITIONS = Object.fromEntries(
  RELEASE_LANGUAGE_ORDER.map((language) => [
    language,
    {
      runtime: GENERATED_RELEASE_LOCALE_REGISTRY[language],
      static: GENERATED_RELEASE_STATIC_REGISTRY[language]
    }
  ])
) as Record<ReleaseLangCode, LocaleDefinition>;

const PSEUDO_LOCALE_DEFINITIONS: Record<'qps-ploc', LocaleDefinition> = {
  'qps-ploc': buildPseudoLocaleDefinition()
};

const LOCALE_DEFINITIONS: Record<LangCode, LocaleDefinition> = {
  ...RELEASE_LOCALE_DEFINITIONS,
  ...PSEUDO_LOCALE_DEFINITIONS
};

export function getLocaleDefinition(code: LangCode): LocaleDefinition {
  const definition = LOCALE_DEFINITIONS[code];
  if (!definition) {
    throw new Error(`Locale definition is not registered for ${code}`);
  }
  return definition;
}
