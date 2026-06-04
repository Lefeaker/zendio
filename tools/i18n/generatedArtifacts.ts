import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CompiledCatalog } from './compileCatalog';
import { emitGeneratedLocales } from './emitGeneratedLocales';
import { emitGeneratedTypes } from './emitGeneratedTypes';

export interface GeneratedArtifactDrift {
  path: string;
  reason: 'missing' | 'content-mismatch';
}

export function buildGeneratedArtifacts(compiled: CompiledCatalog): Map<string, string> {
  return new Map<string, string>([
    ['src/i18n/generated/messages.generated.ts', emitGeneratedTypes(compiled)],
    ['src/i18n/generated/localeRegistry.generated.ts', emitGeneratedLocales(compiled)]
  ]);
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
