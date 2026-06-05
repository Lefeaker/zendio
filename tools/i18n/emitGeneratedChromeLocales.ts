import { CHROME_STATIC_KEYS, type ChromeStaticKey } from '../../src/i18n/catalog/static';
import type { LangCode } from '../../src/i18n/catalog/languages';
import { getLanguageFallbackChain, getWebExtensionLocaleFolder } from '../../src/i18n/config';
import type { CompiledCatalog } from './compileCatalog';

interface ChromeLocaleMessageDescriptor {
  message: string;
}

type ChromeLocaleMessages = Record<ChromeStaticKey, ChromeLocaleMessageDescriptor>;

function hasStaticCatalogs(compiled: CompiledCatalog): boolean {
  return Object.values(compiled.staticCatalogs).some(
    (catalog) => catalog !== undefined && Object.keys(catalog).length > 0
  );
}

function resolveStaticMessage(
  compiled: CompiledCatalog,
  language: LangCode,
  key: ChromeStaticKey
): string {
  for (const fallback of getLanguageFallbackChain(language)) {
    const value = compiled.staticCatalogs[fallback]?.[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  throw new Error(`Missing static translation "${key}" for locale ${language}`);
}

function buildLocaleMessages(compiled: CompiledCatalog, language: LangCode): ChromeLocaleMessages {
  return Object.fromEntries(
    CHROME_STATIC_KEYS.map((key) => [
      key,
      { message: resolveStaticMessage(compiled, language, key) }
    ])
  ) as ChromeLocaleMessages;
}

export function emitGeneratedChromeLocales(compiled: CompiledCatalog): Map<string, string> {
  if (!hasStaticCatalogs(compiled)) {
    return new Map();
  }

  const localeCodes = [...new Set(compiled.sourceLocaleCodes)] as LangCode[];
  const artifacts = new Map<string, string>();

  for (const language of localeCodes) {
    const folder = getWebExtensionLocaleFolder(language);
    const messages = buildLocaleMessages(compiled, language);
    artifacts.set(
      `public/_locales/${folder}/messages.json`,
      `${JSON.stringify(messages, null, 2)}\n`
    );
  }

  return artifacts;
}
