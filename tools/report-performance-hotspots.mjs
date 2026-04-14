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
  'src/content/video/platforms/bilibiliPlatformAdapter.ts',
  'src/content/video/videoSessionRuntime.ts',
  'src/ui/domains/yaml-config/yamlConfigTableRenderer.ts',
  'src/ui/domains/yaml-config/yamlConfigTableStateModel.ts',
  'src/options/components/sections/RestSectionView.ts',
  'src/options/components/sections/FragmentSectionView.ts',
  'src/options/components/sections/UsageDashboardSection.ts',
  'src/ui/domains/privacy/PrivacySettingsView.ts'
];

const MAX_LINE_BUDGETS = new Map([
  ['src/content/video/platforms/bilibiliPlatformAdapter.ts', 700],
  ['src/content/video/videoSessionRuntime.ts', 700],
  ['src/ui/domains/yaml-config/yamlConfigTableRenderer.ts', 900],
  ['src/ui/domains/yaml-config/yamlConfigTableStateModel.ts', 700],
  ['src/options/components/sections/RestSectionView.ts', 720],
  ['src/options/components/sections/FragmentSectionView.ts', 620],
  ['src/options/components/sections/UsageDashboardSection.ts', 450],
  ['src/ui/domains/privacy/PrivacySettingsView.ts', 650]
]);

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

let hasFailure = false;
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
  const lineBudget = MAX_LINE_BUDGETS.get(relativePath);
  if (lineBudget !== undefined && lineCount > lineBudget) {
    console.error(`${relativePath} exceeds hotspot line budget: ${lineCount} > ${lineBudget}`);
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exit(1);
}
