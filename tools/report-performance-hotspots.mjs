import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const HOTSPOTS = [
  'src/options/state/StateManager.ts',
  'src/options/state/optionsStore.ts',
  'src/content/index.ts',
  'src/content/runtime/bootstrapRuntime.ts',
  'src/content/reader/utils/markdownBuilder.ts',
  'src/content/extractors/articleExtractor.ts',
  'src/content/video/platforms/bilibiliPlatform.ts',
  'src/content/video/session.ts'
];

const PATTERNS = [
  ['deepClone', /\bdeepClone\b/g],
  ['JSON.stringify', /JSON\.stringify/g],
  ['querySelector', /\.querySelector(All)?\(/g],
  ['getElementById', /\.getElementById\(/g],
  ['addEventListener', /\.addEventListener\(/g],
  ['setInterval', /\bsetInterval\(/g],
  ['MutationObserver', /\bMutationObserver\b/g],
  ['ResizeObserver', /\bResizeObserver\b/g]
];

for (const relativePath of HOTSPOTS) {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    continue;
  }
  const source = readFileSync(fullPath, 'utf8');
  const lineCount = source.split('\n').length;
  const counters = PATTERNS.map(
    ([label, pattern]) => `${label}=${[...source.matchAll(pattern)].length}`
  ).join(', ');
  console.log(`${relativePath}: lines=${lineCount}, ${counters}`);
}
