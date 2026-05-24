import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const localesDir = join(root, 'src/i18n/locales');

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

const configuredCodes = new Set(configModule.getConfiguredLanguageCodes());
const localeLoaderCodes = new Set(localesModule.getLocaleCodes());
const localeFileCodes = new Set(
  localeFiles
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.replace(/\.ts$/, ''))
);

const missingInLocaleLoaders = difference(configuredCodes, localeLoaderCodes);
const missingInConfig = difference(localeLoaderCodes, configuredCodes);
const missingLocaleFiles = difference(configuredCodes, localeFileCodes);
const unregisteredLocaleFiles = difference(localeFileCodes, localeLoaderCodes);

console.log(`Configured locale codes: ${configuredCodes.size}`);
console.log(`Registered locale loaders: ${localeLoaderCodes.size}`);
console.log(`Locale definition files: ${localeFileCodes.size}`);
console.log(`Missing in locale loaders: ${missingInLocaleLoaders.length}`);
console.log(`Missing in config: ${missingInConfig.length}`);
console.log(`Missing locale files: ${missingLocaleFiles.length}`);
console.log(`Unregistered locale files: ${unregisteredLocaleFiles.length}`);

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

if (
  missingInLocaleLoaders.length > 0
  || missingInConfig.length > 0
  || missingLocaleFiles.length > 0
  || unregisteredLocaleFiles.length > 0
) {
  process.exitCode = 1;
}
