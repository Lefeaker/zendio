import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import type { CompiledCatalog } from './compileCatalog';
import { emitGeneratedChromeLocales } from './emitGeneratedChromeLocales';
import {
  emitGeneratedRuntimeAssets,
  emitGeneratedSchemaAssets
} from './emitGeneratedI18nAssets';
import {
  emitGeneratedLocaleModules,
  emitGeneratedPseudoLocaleModule
} from './emitGeneratedLocaleModules';
import { emitGeneratedLocales } from './emitGeneratedLocales';
import {
  emitGeneratedSchemaCore,
  emitGeneratedSchemaLocaleModules,
  emitGeneratedSchemaMessages
} from './emitGeneratedSchemaMessages';
import { emitGeneratedStaticRegistry } from './emitGeneratedStaticRegistry';
import { emitGeneratedTypes } from './emitGeneratedTypes';

export interface GeneratedArtifactDrift {
  path: string;
  reason: 'missing' | 'content-mismatch';
}

export interface GeneratedArtifactCatalogs {
  runtime: CompiledCatalog;
  schema?: CompiledCatalog;
}

async function formatGeneratedArtifact(
  rootDir: string,
  relativePath: string,
  content: string
): Promise<string> {
  const filePath = path.join(rootDir, relativePath);
  const prettierOptions = await prettier.resolveConfig(filePath);

  return prettier.format(content, {
    ...(prettierOptions ?? {}),
    filepath: filePath
  });
}

export async function buildGeneratedArtifacts(
  compiledOrCatalogs: CompiledCatalog | GeneratedArtifactCatalogs,
  rootDir = process.cwd()
): Promise<Map<string, string>> {
  const { runtime, schema } =
    'runtime' in compiledOrCatalogs ? compiledOrCatalogs : { runtime: compiledOrCatalogs };
  const rawArtifacts = new Map<string, string>([
    ['src/i18n/generated/messages.generated.ts', emitGeneratedTypes(runtime)],
    ['src/i18n/generated/localeRegistry.generated.ts', emitGeneratedLocales(runtime)],
    ['src/i18n/generated/staticRegistry.generated.ts', emitGeneratedStaticRegistry(runtime)],
    ...emitGeneratedLocaleModules(runtime),
    [
      'src/i18n/generated/locales/qps-ploc.generated.ts',
      emitGeneratedPseudoLocaleModule()
    ],
    ...emitGeneratedChromeLocales(runtime),
    ...emitGeneratedRuntimeAssets(runtime)
  ]);

  if (schema) {
    rawArtifacts.set(
      'src/i18n/generated/schemaCore.generated.ts',
      emitGeneratedSchemaCore(schema)
    );
    for (const entry of emitGeneratedSchemaLocaleModules(schema)) {
      rawArtifacts.set(entry.path, entry.content);
    }
    rawArtifacts.set(
      'src/i18n/generated/schemaMessages.generated.ts',
      emitGeneratedSchemaMessages(schema)
    );
    for (const [relativePath, content] of emitGeneratedSchemaAssets(schema)) {
      rawArtifacts.set(relativePath, content);
    }
  }

  const formattedEntries = await Promise.all(
    [...rawArtifacts.entries()].map(
      async ([relativePath, content]) =>
        [relativePath, await formatGeneratedArtifact(rootDir, relativePath, content)] as const
    )
  );

  return new Map<string, string>(formattedEntries);
}

export function diffGeneratedArtifacts(
  rootDir: string,
  artifacts: Map<string, string>
): GeneratedArtifactDrift[] {
  const drift: GeneratedArtifactDrift[] = [];

  for (const [relativePath, expectedContent] of artifacts) {
    const filePath = path.join(rootDir, relativePath);
    if (!existsSync(filePath)) {
      drift.push({ path: relativePath, reason: 'missing' });
      continue;
    }

    const currentContent = readFileSync(filePath, 'utf8');
    if (currentContent !== expectedContent) {
      drift.push({ path: relativePath, reason: 'content-mismatch' });
    }
  }

  return drift;
}

export function writeGeneratedArtifacts(rootDir: string, artifacts: Map<string, string>): string[] {
  const changedPaths: string[] = [];

  for (const [relativePath, content] of artifacts) {
    const filePath = path.join(rootDir, relativePath);
    const currentContent = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;

    if (currentContent === content) {
      continue;
    }

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
    changedPaths.push(relativePath);
  }

  return changedPaths;
}
