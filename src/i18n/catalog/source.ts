import type { CatalogLocaleCatalog, CatalogRuntimeMessages } from './schema';
import type { ReleaseLangCode } from './languages';
import { RELEASE_LANGUAGE_ORDER } from './languages';
import { GENERATED_RELEASE_LOCALE_REGISTRY } from '../generated/localeRegistry.generated';
import { GENERATED_RELEASE_STATIC_REGISTRY } from '../generated/staticRegistry.generated';
import { buildPseudoLocaleDefinition } from './pseudoLocale';

function cloneRuntime(runtime: CatalogRuntimeMessages): CatalogRuntimeMessages {
  return { ...runtime };
}

function createCatalog(
  language: ReleaseLangCode,
  runtime: CatalogRuntimeMessages
): CatalogLocaleCatalog {
  return {
    language,
    runtime: cloneRuntime(runtime),
    static: { ...GENERATED_RELEASE_STATIC_REGISTRY[language] }
  };
}

export function getReleaseRuntimeCatalogSource(): CatalogLocaleCatalog[] {
  return RELEASE_LANGUAGE_ORDER.map((language) =>
    createCatalog(language, GENERATED_RELEASE_LOCALE_REGISTRY[language])
  );
}

export function getPseudoLocaleCatalogSource(): CatalogLocaleCatalog {
  const definition = buildPseudoLocaleDefinition();
  return {
    language: 'qps-ploc',
    runtime: cloneRuntime(definition.runtime),
    static: { ...definition.static }
  };
}
