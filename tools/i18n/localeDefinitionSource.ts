import type { LangCode, ReleaseLangCode } from '../../src/i18n/catalog/languages';
import type { LocaleDefinition } from '../../src/i18n/localeDefinition';
import de from '../../src/i18n/locales/de';
import en from '../../src/i18n/locales/en';
import es419 from '../../src/i18n/locales/es-419';
import esES from '../../src/i18n/locales/es-ES';
import fr from '../../src/i18n/locales/fr';
import it from '../../src/i18n/locales/it';
import ja from '../../src/i18n/locales/ja';
import ko from '../../src/i18n/locales/ko';
import ptBR from '../../src/i18n/locales/pt-BR';
import qpsPloc from '../../src/i18n/locales/qps-ploc';
import ru from '../../src/i18n/locales/ru';
import zhCN from '../../src/i18n/locales/zh-CN';
import zhTW from '../../src/i18n/locales/zh-TW';

const RELEASE_LOCALE_DEFINITIONS: Record<ReleaseLangCode, LocaleDefinition> = {
  en,
  'zh-CN': zhCN,
  ja,
  de,
  fr,
  'es-ES': esES,
  'es-419': es419,
  it,
  ko,
  'pt-BR': ptBR,
  ru,
  'zh-TW': zhTW
};

const PSEUDO_LOCALE_DEFINITIONS: Record<'qps-ploc', LocaleDefinition> = {
  'qps-ploc': qpsPloc
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
