import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import type { CompiledCatalog } from './compileCatalog';
import { emitGeneratedChromeLocales } from './emitGeneratedChromeLocales';
import { emitGeneratedLocales } from './emitGeneratedLocales';
import { emitGeneratedTypes } from './emitGeneratedTypes';

export interface GeneratedArtifactDrift {
  path: string;
  reason: 'missing' | 'content-mismatch';
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
  compiled: CompiledCatalog,
  rootDir = process.cwd()
): Promise<Map<string, string>> {
  const rawArtifacts = new Map<string, string>([
    ['src/i18n/generated/messages.generated.ts', emitGeneratedTypes(compiled)],
    ['src/i18n/generated/localeRegistry.generated.ts', emitGeneratedLocales(compiled)],
    ...emitGeneratedChromeLocales(compiled)
  ]);

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
