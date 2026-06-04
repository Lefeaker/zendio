import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const localesDir = join(root, 'src/i18n/locales');
const catalogMessagesDir = join(root, 'src/i18n/catalog/messages');
const publicLocalesDir = join(root, 'public/_locales');

async function bundleModule(filePath) {
  const result = await build({
    entryPoints: [filePath],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    target: 'node20',
    logLevel: 'silent'
  });

  const { text } = result.outputFiles[0];
  const dataUrl = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  return import(dataUrl);
}

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

const [configModule, localesModule, localeFiles] = await Promise.all([
  bundleModule(join(root, 'src/i18n/config.ts')),
  bundleModule(join(root, 'src/i18n/locales.ts')),
  readdir(localesDir)
]);
const [
  catalogLanguagesModule,
  generatedLocaleRegistryModule,
  catalogMessageEntries,
  publicLocaleEntries
] = await Promise.all([
  bundleModule(join(root, 'src/i18n/catalog/languages.ts')),
  bundleModule(join(root, 'src/i18n/generated/localeRegistry.generated.ts')),
  readdir(catalogMessagesDir),
  readdir(publicLocalesDir)
]);

const configuredCodes = new Set(configModule.getConfiguredLanguageCodes());
const localeLoaderCodes = new Set(localesModule.getLocaleCodes());
const localeFileCodes = new Set(
  localeFiles.filter((file) => file.endsWith('.ts')).map((file) => file.replace(/\.ts$/, ''))
);
const configuredReleaseCodes = new Set([...configuredCodes].filter((code) => code !== 'qps-ploc'));
const catalogReleaseCodes = new Set(catalogLanguagesModule.RELEASE_LANGUAGE_ORDER ?? []);
const generatedReleaseCodes = new Set(
  generatedLocaleRegistryModule.GENERATED_RELEASE_LOCALE_CODES ?? []
);
const catalogSchemaSourceCodes = new Set(catalogMessageEntries);
const expectedPublicLocaleFolders = new Set(
  [...configuredCodes].map((code) => configModule.getWebExtensionLocaleFolder(code))
);
const publicLocaleFolders = new Set(publicLocaleEntries);

const missingInLocaleLoaders = difference(configuredCodes, localeLoaderCodes);
const missingInConfig = difference(localeLoaderCodes, configuredCodes);
const missingLocaleFiles = difference(configuredCodes, localeFileCodes);
const unregisteredLocaleFiles = difference(localeFileCodes, localeLoaderCodes);
const missingCatalogReleaseCodes = difference(configuredReleaseCodes, catalogReleaseCodes);
const unconfiguredCatalogReleaseCodes = difference(catalogReleaseCodes, configuredReleaseCodes);
const missingGeneratedReleaseCodes = difference(catalogReleaseCodes, generatedReleaseCodes);
const unexpectedGeneratedReleaseCodes = difference(generatedReleaseCodes, catalogReleaseCodes);
const missingCatalogSchemaSources = difference(catalogReleaseCodes, catalogSchemaSourceCodes);
const unexpectedCatalogSchemaSources = difference(catalogSchemaSourceCodes, catalogReleaseCodes);
const missingPublicLocaleFolders = difference(expectedPublicLocaleFolders, publicLocaleFolders);
const unexpectedPublicLocaleFolders = difference(publicLocaleFolders, expectedPublicLocaleFolders);

console.log(`Configured locale codes: ${configuredCodes.size}`);
console.log(`Registered locale loaders: ${localeLoaderCodes.size}`);
console.log(`Locale definition files: ${localeFileCodes.size}`);
console.log(`Catalog release languages: ${catalogReleaseCodes.size}`);
console.log(`Generated release locale codes: ${generatedReleaseCodes.size}`);
console.log(`Catalog schema source directories: ${catalogSchemaSourceCodes.size}`);
console.log(`Public WebExtension locale folders: ${publicLocaleFolders.size}`);
console.log(`Missing in locale loaders: ${missingInLocaleLoaders.length}`);
console.log(`Missing in config: ${missingInConfig.length}`);
console.log(`Missing locale files: ${missingLocaleFiles.length}`);
console.log(`Unregistered locale files: ${unregisteredLocaleFiles.length}`);
console.log(`Missing in catalog release languages: ${missingCatalogReleaseCodes.length}`);
console.log(`Unconfigured catalog release languages: ${unconfiguredCatalogReleaseCodes.length}`);
console.log(`Missing in generated release registry: ${missingGeneratedReleaseCodes.length}`);
console.log(
  `Unexpected generated release registry codes: ${unexpectedGeneratedReleaseCodes.length}`
);
console.log(`Missing catalog schema source directories: ${missingCatalogSchemaSources.length}`);
console.log(
  `Unexpected catalog schema source directories: ${unexpectedCatalogSchemaSources.length}`
);
console.log(`Missing public WebExtension folders: ${missingPublicLocaleFolders.length}`);
console.log(`Unexpected public WebExtension folders: ${unexpectedPublicLocaleFolders.length}`);

function printList(title, values) {
  if (values.length === 0) {
    return;
  }
  console.log('');
  console.log(`${title}:`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

printList('Configured but not registered by locale loaders', missingInLocaleLoaders);
printList('Registered by locale loaders but not configured', missingInConfig);
printList('Configured but missing locale definition file', missingLocaleFiles);
printList('Locale definition files not registered in locale loaders', unregisteredLocaleFiles);
printList('Configured release languages missing from catalog metadata', missingCatalogReleaseCodes);
printList('Catalog release languages not configured for runtime', unconfiguredCatalogReleaseCodes);
printList(
  'Catalog release languages missing from generated registry',
  missingGeneratedReleaseCodes
);
printList(
  'Generated registry codes not present in catalog release languages',
  unexpectedGeneratedReleaseCodes
);
printList('Catalog release languages missing schema source directory', missingCatalogSchemaSources);
printList(
  'Schema source directories not present in catalog release languages',
  unexpectedCatalogSchemaSources
);
printList(
  'Expected public WebExtension locale folders missing from public/_locales',
  missingPublicLocaleFolders
);
printList(
  'Public WebExtension locale folders not mapped by runtime config',
  unexpectedPublicLocaleFolders
);

if (
  missingInLocaleLoaders.length > 0 ||
  missingInConfig.length > 0 ||
  missingLocaleFiles.length > 0 ||
  unregisteredLocaleFiles.length > 0 ||
  missingCatalogReleaseCodes.length > 0 ||
  unconfiguredCatalogReleaseCodes.length > 0 ||
  missingGeneratedReleaseCodes.length > 0 ||
  unexpectedGeneratedReleaseCodes.length > 0 ||
  missingCatalogSchemaSources.length > 0 ||
  unexpectedCatalogSchemaSources.length > 0 ||
  missingPublicLocaleFolders.length > 0 ||
  unexpectedPublicLocaleFolders.length > 0
) {
  process.exitCode = 1;
}
