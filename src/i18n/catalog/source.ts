import type { CatalogLocaleCatalog, CatalogRuntimeMessages } from './schema';
import type { ReleaseLangCode } from './languages';
import { RELEASE_LANGUAGE_ORDER } from './languages';
import de from '../locales/de';
import en from '../locales/en';
import es419 from '../locales/es-419';
import esES from '../locales/es-ES';
import fr from '../locales/fr';
import it from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ptBR from '../locales/pt-BR';
import qpsPloc from '../locales/qps-ploc';
import ru from '../locales/ru';
import zhCN from '../locales/zh-CN';
import zhTW from '../locales/zh-TW';

const RELEASE_RUNTIME_SOURCE_MAP: Record<ReleaseLangCode, CatalogRuntimeMessages> = {
  en: en.runtime,
  'zh-CN': zhCN.runtime,
  ja: ja.runtime,
  de: de.runtime,
  fr: fr.runtime,
  'es-ES': esES.runtime,
  'es-419': es419.runtime,
  it: it.runtime,
  ko: ko.runtime,
  'pt-BR': ptBR.runtime,
  ru: ru.runtime,
  'zh-TW': zhTW.runtime
};

function cloneRuntime(runtime: CatalogRuntimeMessages): CatalogRuntimeMessages {
  return { ...runtime };
}

function createCatalog(
  language: ReleaseLangCode,
  runtime: CatalogRuntimeMessages
): CatalogLocaleCatalog {
  return {
    language,
    runtime: cloneRuntime(runtime)
  };
}

export function getReleaseRuntimeCatalogSource(): CatalogLocaleCatalog[] {
  return RELEASE_LANGUAGE_ORDER.map((language) =>
    createCatalog(language, RELEASE_RUNTIME_SOURCE_MAP[language])
  );
}

export function getPseudoLocaleCatalogSource(): CatalogLocaleCatalog {
  return {
    language: 'qps-ploc',
    runtime: cloneRuntime(qpsPloc.runtime)
  };
}
