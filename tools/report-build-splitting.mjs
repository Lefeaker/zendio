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
  [join(DIST_DIR, 'content', 'index.js'), 2 * 1024],
  [join(DIST_DIR, 'content', 'runtime.js'), 220 * 1024],
  [join(DIST_DIR, 'options', 'index.js'), 130 * 1024],
  [join(DIST_DIR, 'onboarding', 'index.js'), 20 * 1024]
]);
const MAX_CHUNK_COUNT = 130;
const MAX_SINGLE_CHUNK_SIZE = 650 * 1024;

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
for (const chunkFile of chunkFiles) {
  const stats = statSync(join(CHUNKS_DIR, chunkFile));
  console.log(`  - chunks/${chunkFile}: ${formatSize(stats.size)}`);
  if (stats.size > MAX_SINGLE_CHUNK_SIZE) {
    findings.push(
      `chunks/${chunkFile} exceeds max chunk budget: ${formatSize(stats.size)} > ${formatSize(
        MAX_SINGLE_CHUNK_SIZE
      )}`
    );
  }
}

if (findings.length > 0) {
  console.error('\nBuild budget check failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}
