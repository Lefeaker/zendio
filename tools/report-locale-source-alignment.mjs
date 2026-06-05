import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const catalogMessagesDir = join(root, 'src/i18n/catalog/messages');
const generatedLocalesDir = join(root, 'src/i18n/generated/locales');
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectCatalogSourceCodes(fileName) {
  const entries = await readdir(catalogMessagesDir);
  const codes = [];

  for (const entry of entries) {
    if (await fileExists(join(catalogMessagesDir, entry, fileName))) {
      codes.push(entry);
    }
  }

  return codes;
}

const [configModule, localesModule] = await Promise.all([
  bundleModule(join(root, 'src/i18n/config.ts')),
  bundleModule(join(root, 'src/i18n/locales.ts'))
]);
const [
  catalogLanguagesModule,
  generatedLocaleRegistryModule,
  catalogRuntimeSourceEntries,
  catalogStaticSourceEntries,
  catalogSchemaSourceEntries,
  generatedLocaleEntries,
  publicLocaleEntries
] = await Promise.all([
  bundleModule(join(root, 'src/i18n/catalog/languages.ts')),
  bundleModule(join(root, 'src/i18n/generated/localeRegistry.generated.ts')),
  collectCatalogSourceCodes('runtime.json'),
  collectCatalogSourceCodes('static.json'),
  collectCatalogSourceCodes('schema.json'),
  readdir(generatedLocalesDir),
  readdir(publicLocalesDir)
]);

const configuredCodes = new Set(configModule.getConfiguredLanguageCodes());
const localeLoaderCodes = new Set(localesModule.getLocaleCodes());
const generatedLocaleModuleCodes = new Set(
  generatedLocaleEntries
    .filter((file) => file.endsWith('.generated.ts'))
    .map((file) => file.replace(/\.generated\.ts$/, ''))
);
const configuredReleaseCodes = new Set([...configuredCodes].filter((code) => code !== 'qps-ploc'));
const catalogReleaseCodes = new Set(catalogLanguagesModule.RELEASE_LANGUAGE_ORDER ?? []);
const generatedReleaseCodes = new Set(
  generatedLocaleRegistryModule.GENERATED_RELEASE_LOCALE_CODES ?? []
);
const catalogRuntimeSourceCodes = new Set(catalogRuntimeSourceEntries);
const catalogStaticSourceCodes = new Set(catalogStaticSourceEntries);
const catalogSchemaSourceCodes = new Set(catalogSchemaSourceEntries);
const expectedPublicLocaleFolders = new Set(
  [...configuredCodes].map((code) => configModule.getWebExtensionLocaleFolder(code))
);
const publicLocaleFolders = new Set(publicLocaleEntries);

const missingInLocaleLoaders = difference(configuredCodes, localeLoaderCodes);
const missingInConfig = difference(localeLoaderCodes, configuredCodes);
const missingGeneratedLocaleModules = difference(configuredCodes, generatedLocaleModuleCodes);
const unregisteredGeneratedLocaleModules = difference(generatedLocaleModuleCodes, localeLoaderCodes);
const missingCatalogReleaseCodes = difference(configuredReleaseCodes, catalogReleaseCodes);
const unconfiguredCatalogReleaseCodes = difference(catalogReleaseCodes, configuredReleaseCodes);
const missingGeneratedReleaseCodes = difference(catalogReleaseCodes, generatedReleaseCodes);
const unexpectedGeneratedReleaseCodes = difference(generatedReleaseCodes, catalogReleaseCodes);
const missingCatalogRuntimeSources = difference(catalogReleaseCodes, catalogRuntimeSourceCodes);
const unexpectedCatalogRuntimeSources = difference(catalogRuntimeSourceCodes, catalogReleaseCodes);
const missingCatalogStaticSources = difference(catalogReleaseCodes, catalogStaticSourceCodes);
const unexpectedCatalogStaticSources = difference(catalogStaticSourceCodes, catalogReleaseCodes);
const missingCatalogSchemaSources = difference(catalogReleaseCodes, catalogSchemaSourceCodes);
const unexpectedCatalogSchemaSources = difference(catalogSchemaSourceCodes, catalogReleaseCodes);
const missingPublicLocaleFolders = difference(expectedPublicLocaleFolders, publicLocaleFolders);
const unexpectedPublicLocaleFolders = difference(publicLocaleFolders, expectedPublicLocaleFolders);

console.log(`Configured locale codes: ${configuredCodes.size}`);
console.log(`Registered locale loaders: ${localeLoaderCodes.size}`);
console.log(`Generated locale modules: ${generatedLocaleModuleCodes.size}`);
console.log(`Catalog release languages: ${catalogReleaseCodes.size}`);
console.log(`Generated release locale codes: ${generatedReleaseCodes.size}`);
console.log(`Catalog runtime source directories: ${catalogRuntimeSourceCodes.size}`);
console.log(`Catalog static source directories: ${catalogStaticSourceCodes.size}`);
console.log(`Catalog schema source directories: ${catalogSchemaSourceCodes.size}`);
console.log(`Public WebExtension locale folders: ${publicLocaleFolders.size}`);
console.log(`Missing in locale loaders: ${missingInLocaleLoaders.length}`);
console.log(`Missing in config: ${missingInConfig.length}`);
console.log(`Missing generated locale modules: ${missingGeneratedLocaleModules.length}`);
console.log(`Unregistered generated locale modules: ${unregisteredGeneratedLocaleModules.length}`);
console.log(`Missing in catalog release languages: ${missingCatalogReleaseCodes.length}`);
console.log(`Unconfigured catalog release languages: ${unconfiguredCatalogReleaseCodes.length}`);
console.log(`Missing in generated release registry: ${missingGeneratedReleaseCodes.length}`);
console.log(
  `Unexpected generated release registry codes: ${unexpectedGeneratedReleaseCodes.length}`
);
console.log(`Missing catalog runtime source directories: ${missingCatalogRuntimeSources.length}`);
console.log(
  `Unexpected catalog runtime source directories: ${unexpectedCatalogRuntimeSources.length}`
);
console.log(`Missing catalog static source directories: ${missingCatalogStaticSources.length}`);
console.log(
  `Unexpected catalog static source directories: ${unexpectedCatalogStaticSources.length}`
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
printList('Configured but missing generated locale module', missingGeneratedLocaleModules);
printList(
  'Generated locale modules not registered in locale loaders',
  unregisteredGeneratedLocaleModules
);
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
printList(
  'Catalog release languages missing runtime source directory',
  missingCatalogRuntimeSources
);
printList(
  'Runtime source directories not present in catalog release languages',
  unexpectedCatalogRuntimeSources
);
printList(
  'Catalog release languages missing static source directory',
  missingCatalogStaticSources
);
printList(
  'Static source directories not present in catalog release languages',
  unexpectedCatalogStaticSources
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
  missingGeneratedLocaleModules.length > 0 ||
  unregisteredGeneratedLocaleModules.length > 0 ||
  missingCatalogReleaseCodes.length > 0 ||
  unconfiguredCatalogReleaseCodes.length > 0 ||
  missingGeneratedReleaseCodes.length > 0 ||
  unexpectedGeneratedReleaseCodes.length > 0 ||
  missingCatalogRuntimeSources.length > 0 ||
  unexpectedCatalogRuntimeSources.length > 0 ||
  missingCatalogStaticSources.length > 0 ||
  unexpectedCatalogStaticSources.length > 0 ||
  missingCatalogSchemaSources.length > 0 ||
  unexpectedCatalogSchemaSources.length > 0 ||
  missingPublicLocaleFolders.length > 0 ||
  unexpectedPublicLocaleFolders.length > 0
) {
  process.exitCode = 1;
}
