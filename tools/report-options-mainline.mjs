import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, 'src');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

const findings = [];
const sourceFiles = walk(SRC_ROOT);
const sectionsRoot = join(SRC_ROOT, 'options/components/sections');
const sectionFiles = existsSync(sectionsRoot) ? walk(sectionsRoot) : [];
const references = {
  chromeOptionsPersistence: [],
  legacyOptionsRepository: [],
  sectionRegistryImports: []
};

for (const fullPath of sourceFiles) {
  const relativePath = relative(ROOT, fullPath);
  const source = readFileSync(fullPath, 'utf8');

  if (/\bchromeOptionsPersistence\b/.test(source)) {
    references.chromeOptionsPersistence.push(relativePath);
  }
  if (
    /\b(?:adaptOptionsRepository|createCompatibilityOptionsRepository|ChromeSyncOptionsRepository|LegacyOptionsRepositoryAdapter)\b/.test(
      source
    )
  ) {
    references.legacyOptionsRepository.push(relativePath);
  }
  if (/from ['"][^'"]*sectionRegistry['"]/.test(source)) {
    references.sectionRegistryImports.push(relativePath);
  }
}

const requiredPairs = [
  [
    'src/options/state/optionsStore.ts',
    'resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository)'
  ],
  ['src/options/services/persistence.ts', 'return optionsStore.load();'],
  ['src/options/services/persistence.ts', 'await optionsStore.save(draft);'],
  ['src/options/app/bootstrap.ts', 'persistence: chromeOptionsPersistence']
];

for (const [relativePath, snippet] of requiredPairs) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  if (!source.includes(snippet)) {
    findings.push(`${relativePath} missing options mainline snippet: ${snippet}`);
  }
}

const allowedPersistenceRefs = new Set([
  'src/options/services/persistence.ts',
  'src/options/app/bootstrap.ts'
]);
for (const relativePath of references.chromeOptionsPersistence) {
  if (!allowedPersistenceRefs.has(relativePath)) {
    findings.push(`chromeOptionsPersistence leaked outside bootstrap adapter: ${relativePath}`);
  }
}

const allowedLegacyRefs = new Set(['src/infrastructure/optionsRepository.ts']);
for (const relativePath of references.legacyOptionsRepository) {
  if (!allowedLegacyRefs.has(relativePath)) {
    findings.push(
      `legacy OptionsRepository compatibility leaked into production path: ${relativePath}`
    );
  }
}

for (const relativePath of references.sectionRegistryImports) {
  findings.push(`sectionRegistry import should stay retired from production flow: ${relativePath}`);
}

for (const fullPath of sectionFiles) {
  const relativePath = relative(ROOT, fullPath);
  const source = readFileSync(fullPath, 'utf8');
  if (/optionsRepo\s*\.?\s*set\s*\(/.test(source)) {
    findings.push(`section must not write optionsRepo directly: ${relativePath}`);
  }
}

if (findings.length > 0) {
  console.error('Options mainline audit failed:\n');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Options mainline audit passed.');
