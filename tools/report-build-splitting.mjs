import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, 'build', 'dist');
const CHUNKS_DIR = join(DIST_DIR, 'chunks');
const ENTRY_FILES = [
  join(DIST_DIR, 'content', 'index.js'),
  join(DIST_DIR, 'content', 'runtime.js'),
  join(DIST_DIR, 'options', 'index.js'),
  join(DIST_DIR, 'onboarding', 'index.js')
];
const ENTRY_BUDGETS = new Map([
  [join(DIST_DIR, 'content', 'index.js'), 1 * 1024],
  [join(DIST_DIR, 'content', 'runtime.js'), 56 * 1024],
  [join(DIST_DIR, 'options', 'index.js'), 12 * 1024],
  [join(DIST_DIR, 'onboarding', 'index.js'), 16 * 1024]
]);
const MAX_CHUNK_COUNT = 112;
const MAX_SINGLE_CHUNK_SIZE = 320 * 1024;
// Shared #1 carries the cross-entry options/repository schema. The first budget
// includes the video control-bar persisted preference contract.
const SHARED_CHUNK_BUDGETS = [190 * 1024, 136 * 1024, 90 * 1024];
const MAX_LOCALE_CHUNK_SIZE = 60 * 1024;
const LOCALE_CHUNK_PATTERN = /^(?:qps-ploc|en|zh-CN|zh-TW|ja|ko|fr|de|ru|it|es-ES|es-419|pt-BR)-/;
const YAML_CONFIG_CHUNK_PATTERN = /^yaml-config-/;
const YAML_CONFIG_CHUNK_BUDGET = 70 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

if (!existsSync(DIST_DIR)) {
  console.error('build/dist does not exist. Run `npm run build:dev` or `npm run build` first.');
  process.exit(1);
}

for (const entry of ENTRY_FILES) {
  if (!existsSync(entry)) {
    console.error(`Missing built entry: ${entry}`);
    process.exit(1);
  }
}

if (!existsSync(CHUNKS_DIR)) {
  console.error('No chunks directory found. UI splitting is not active.');
  process.exit(1);
}

const chunkFiles = readdirSync(CHUNKS_DIR).filter((file) => file.endsWith('.js'));
if (chunkFiles.length === 0) {
  console.error('No JS chunks found in build/dist/chunks. UI splitting is not active.');
  process.exit(1);
}

const chunkStats = chunkFiles.map((chunkFile) => {
  const size = statSync(join(CHUNKS_DIR, chunkFile)).size;
  return {
    file: chunkFile,
    size,
    isLocale: LOCALE_CHUNK_PATTERN.test(chunkFile),
    isShared: chunkFile.startsWith('chunk-')
  };
});

console.log('Build splitting report');
const findings = [];
for (const entry of ENTRY_FILES) {
  const stats = statSync(entry);
  console.log(`- ${entry.replace(`${ROOT}/`, '')}: ${formatSize(stats.size)}`);
  const budget = ENTRY_BUDGETS.get(entry);
  if (budget !== undefined && stats.size > budget) {
    findings.push(
      `${entry.replace(`${ROOT}/`, '')} exceeds budget: ${formatSize(stats.size)} > ${formatSize(
        budget
      )}`
    );
  }
}
console.log(`- chunks: ${chunkFiles.length}`);
if (chunkFiles.length > MAX_CHUNK_COUNT) {
  findings.push(`chunk count exceeds budget: ${chunkFiles.length} > ${MAX_CHUNK_COUNT}`);
}
for (const chunk of chunkStats) {
  console.log(`  - chunks/${chunk.file}: ${formatSize(chunk.size)}`);
  if (chunk.size > MAX_SINGLE_CHUNK_SIZE) {
    findings.push(
      `chunks/${chunk.file} exceeds max chunk budget: ${formatSize(chunk.size)} > ${formatSize(
        MAX_SINGLE_CHUNK_SIZE
      )}`
    );
  }
  if (chunk.isLocale && chunk.size > MAX_LOCALE_CHUNK_SIZE) {
    findings.push(
      `chunks/${chunk.file} exceeds locale chunk budget: ${formatSize(chunk.size)} > ${formatSize(
        MAX_LOCALE_CHUNK_SIZE
      )}`
    );
  }
  if (YAML_CONFIG_CHUNK_PATTERN.test(chunk.file) && chunk.size > YAML_CONFIG_CHUNK_BUDGET) {
    findings.push(
      `chunks/${chunk.file} exceeds yaml-config budget: ${formatSize(chunk.size)} > ${formatSize(
        YAML_CONFIG_CHUNK_BUDGET
      )}`
    );
  }
}

const sharedChunks = chunkStats
  .filter((chunk) => chunk.isShared && !chunk.isLocale)
  .sort((a, b) => b.size - a.size);

sharedChunks.slice(0, 3).forEach((chunk, index) => {
  const budget = SHARED_CHUNK_BUDGETS[index];
  if (budget !== undefined && chunk.size > budget) {
    findings.push(
      `chunks/${chunk.file} exceeds shared #${index + 1} budget: ${formatSize(chunk.size)} > ${formatSize(
        budget
      )}`
    );
  }
});

if (sharedChunks.length < 3) {
  findings.push('expected at least three shared chunks to validate shared chunk budgets.');
}

if (findings.length > 0) {
  console.error('\nBuild budget check failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}
