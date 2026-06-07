import { existsSync, readFileSync } from 'node:fs';

const HOTSPOT_PATH = 'docs/production-code-hotspots.md';
const LOC_LIMITS = new Map([
  ['src/options/app/productionStitchShell.ts', 500],
  ['src/options/app/productionStitchShellMount.ts', 450],
  ['src/options/app/productionStitchActions.ts', 302],
  ['src/options/app/productionStitchPersistence.ts', 387],
  ['src/options/app/productionStitchRenderLifecycle.ts', 300],
  ['src/options/app/productionStitchShellState.ts', 300],
  ['src/content/video/prompt.ts', 300],
  ['src/content/clipper/components/dialog.ts', 450],
  ['src/options/stitch/render/renderStitchView.ts', 450],
  ['src/ui/domains/usage-chart/usageChartRenderers.ts', 450],
  ['src/shared/services/yamlConfigService.ts', 250],
  ['src/options/yaml-config-editor/view.ts', 760],
  ['src/options/yaml-config-editor/widgetAdapter.ts', 150]
]);
const TEXT_ASSIGNMENT_GATED_FILES = new Set([
  'src/options/stitch/render/renderStitchView.ts',
  'src/options/yaml-config-editor/view.ts',
  'src/options/yaml-config-editor/widgetAdapter.ts'
]);
const ADD_EVENT_LISTENER_LIMITS = new Map([
  ['src/options/yaml-config-editor/view.ts', 16],
  ['src/options/yaml-config-editor/widgetAdapter.ts', 0]
]);

function readHotspotFiles(source = readFileSync(HOTSPOT_PATH, 'utf8')) {
  return source
    .split('\n')
    .filter((line) => line.startsWith('| `src/'))
    .map((line) => line.match(/`([^`]+)`/)?.[1])
    .filter(Boolean);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

export function buildProductionShapeReport(source = readFileSync(HOTSPOT_PATH, 'utf8')) {
  return readHotspotFiles(source).map((file) => {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    return {
      file,
      exists: existsSync(file),
      loc: text ? text.split('\n').length : 0,
      createElement: countMatches(text, /\b(?:document\.)?createElement\b/g),
      addEventListener: countMatches(text, /\baddEventListener\b/g),
      switchCount: countMatches(text, /\bswitch\s*\(/g),
      textAssignments:
        countMatches(text, /\.(?:textContent|placeholder)\s*=/g) +
        countMatches(text, /\b(?:text|placeholder):\s*['"`]/g)
    };
  });
}

export function buildProductionShapeFailures(report) {
  const failures = [];
  for (const row of report) {
    if (!row.exists) {
      failures.push(`${row.file} is listed as a production hotspot but is missing`);
      continue;
    }
    const limit = LOC_LIMITS.get(row.file);
    if (limit !== undefined && row.loc > limit) {
      failures.push(`${row.file} exceeds ${limit} LOC: ${row.loc}`);
    }
    const listenerLimit = ADD_EVENT_LISTENER_LIMITS.get(row.file);
    if (listenerLimit !== undefined && row.addEventListener > listenerLimit) {
      failures.push(
        `${row.file} exceeds ${listenerLimit} addEventListener calls: ${row.addEventListener}`
      );
    }
    if (TEXT_ASSIGNMENT_GATED_FILES.has(row.file) && row.textAssignments > 0) {
      failures.push(`${row.file} has hard-coded visible text assignments: ${row.textAssignments}`);
    }
  }
  return failures;
}

const report = buildProductionShapeReport();
console.log('Production code shape report');
for (const row of report) {
  console.log(
    `${row.file} | exists=${row.exists} | loc=${row.loc} | createElement=${row.createElement} | addEventListener=${row.addEventListener} | switch=${row.switchCount} | textAssignments=${row.textAssignments}`
  );
}

const failures = buildProductionShapeFailures(report);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
