import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RELEASE_LANGUAGE_ORDER, type ReleaseLangCode } from '../../src/i18n/catalog/languages';
import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';
import type { ChromeStaticCatalog } from '../../src/i18n/catalog/static';
import type { LocaleStaticMessages } from '../../src/i18n/localeDefinition';
import type { Messages } from '../../src/i18n/messages';
import { pseudoLocalizeMessages, pseudoLocalizeStatic } from '../../src/i18n/pseudoLocalization';

export interface CatalogReaderOptions {
  includePseudoLocale?: boolean;
  rootDir?: string;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readRuntimeCatalogFile(
  rootDir: string,
  language: ReleaseLangCode
): CatalogLocaleCatalog['runtime'] {
  const messagesDir = path.join(rootDir, 'src/i18n/catalog/messages', language);
  const runtime = readJsonFile<CatalogLocaleCatalog['runtime']>(
    path.join(messagesDir, 'runtime.json')
  );
  const schema = readJsonFile<CatalogLocaleCatalog['runtime']>(path.join(messagesDir, 'schema.json'));

  return {
    ...runtime,
    ...schema
  };
}

function readStaticCatalogFile(rootDir: string, language: ReleaseLangCode): ChromeStaticCatalog {
  return readJsonFile<ChromeStaticCatalog>(
    path.join(rootDir, 'src/i18n/catalog/messages', language, 'static.json')
  );
}

function readReleaseCatalogSource(rootDir: string): CatalogLocaleCatalog[] {
  return RELEASE_LANGUAGE_ORDER.map((language) => ({
    language,
    runtime: readRuntimeCatalogFile(rootDir, language),
    static: readStaticCatalogFile(rootDir, language)
  }));
}

function buildPseudoCatalogSource(english: CatalogLocaleCatalog): CatalogLocaleCatalog {
  if (!english.static) {
    throw new Error('English static catalog is required to build qps-ploc');
  }

  return {
    language: 'qps-ploc',
    runtime: pseudoLocalizeMessages(english.runtime as Messages),
    static: pseudoLocalizeStatic(english.static as LocaleStaticMessages)
  };
}

export function readCatalogSource(options: CatalogReaderOptions = {}): CatalogLocaleCatalog[] {
  const rootDir = options.rootDir ?? process.cwd();
  const catalogs = readReleaseCatalogSource(rootDir);
  if (options.includePseudoLocale) {
    const english = catalogs.find((catalog) => catalog.language === 'en');
    if (!english) {
      throw new Error('English catalog is required to build qps-ploc');
    }
    catalogs.push(buildPseudoCatalogSource(english));
  }
  return catalogs;
}
