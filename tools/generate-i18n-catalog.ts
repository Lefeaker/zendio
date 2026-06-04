import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_MESSAGE_KEYS } from '../src/i18n/catalog/keys';
import { RELEASE_LANGUAGE_ORDER } from '../src/i18n/catalog/languages';
import { readCatalogSource } from './i18n/catalogReader';
import { compileCatalog } from './i18n/compileCatalog';
import {
  buildGeneratedArtifacts,
  diffGeneratedArtifacts,
  writeGeneratedArtifacts
} from './i18n/generatedArtifacts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv: string[]): { checkOnly: boolean } {
  const args = new Set(argv);
  for (const arg of args) {
    if (arg !== '--check') {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    checkOnly: args.has('--check')
  };
}

async function main(): Promise<void> {
  const { checkOnly } = parseArgs(process.argv.slice(2));
  const sourceCatalogs = readCatalogSource({ includePseudoLocale: true });
  const compiled = compileCatalog(sourceCatalogs, {
    expectedKeys: RUNTIME_MESSAGE_KEYS,
    releaseLanguageOrder: RELEASE_LANGUAGE_ORDER
  });
  const artifacts = await buildGeneratedArtifacts(compiled, ROOT);

  if (checkOnly) {
    const drift = diffGeneratedArtifacts(ROOT, artifacts);
    if (drift.length > 0) {
      console.error('[i18n:catalog] Generated artifacts are out of date:');
      for (const entry of drift) {
        console.error(`- ${entry.path}: ${entry.reason}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('[i18n:catalog] Generated artifacts are up to date.');
    return;
  }

  const changedPaths = writeGeneratedArtifacts(ROOT, artifacts);
  if (changedPaths.length === 0) {
    console.log('[i18n:catalog] Generated artifacts already up to date.');
    return;
  }

  console.log('[i18n:catalog] Updated generated artifacts:');
  for (const relativePath of changedPaths) {
    console.log(`- ${relativePath}`);
  }
}

main().catch((error) => {
  console.error('[i18n:catalog] Failed to generate catalog artifacts.');
  console.error(error);
  process.exitCode = 1;
});
