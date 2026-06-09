import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

const MAX_LINE_BUDGETS = new Map([
  ['src/i18n/schemaShellMessages.ts', 2133],
  ['src/options/stitch/content.ts', 913],
  ['src/i18n/messages.ts', 752],
  ['src/options/yaml-config-editor/view.ts', 746],
  ['src/options/stitch/types.ts', 747],
  ['src/i18n/locales/fr.ts', 697],
  ['src/i18n/locales/de.ts', 692],
  ['src/i18n/locales/es-419.ts', 689],
  ['src/i18n/locales/es-ES.ts', 689],
  ['src/i18n/locales/ru.ts', 688],
  ['src/i18n/locales/it.ts', 686],
  ['src/i18n/locales/pt-BR.ts', 686],
  ['src/i18n/locales/en.ts', 672],
  ['src/i18n/locales/ja.ts', 671],
  ['src/i18n/locales/ko.ts', 661],
  ['src/i18n/locales/zh-CN.ts', 628],
  ['src/i18n/locales/qps-ploc.ts', 625],
  ['src/i18n/locales/zh-TW.ts', 624],
  ['src/options/stitch/ui/components.ts', 592],
  ['src/third_party/ai-chat-exporter/platforms/gemini.ts', 576],
  ['src/options/stitch/schema/builders/surfaces.ts', 558],
  ['src/options/app/productionStitchStateMapper.ts', 517],
  ['src/content/clipper/components/clipperDialogController.ts', 511],
  ['src/content/reader/services/highlightManager.ts', 505],
  ['src/shared/di/serviceRegistry.ts', 504],
  ['src/content/video/sessionOperations.ts', 491],
  ['src/content/video/platforms/bilibiliRichText.ts', 302],
  ['src/content/video/platforms/bilibiliPlatformObserver.ts', 292],
  ['src/ui/domains/video/VideoDialog.ts', 468],
  ['src/shared/config/optionsMerger.ts', 460],
  ['src/content/video/videoPromptLifecycle.ts', 458],
  ['src/background/pipelines/connectionTest.ts', 451],
  ['src/content/video/videoSessionRuntime.ts', 432],
  ['src/onboarding/bootstrap.ts', 429],
  ['src/background/services/notifications.ts', 424],
  ['src/shared/errors/analytics/analyticsConfig.template.ts', 422],
  ['src/shared/analytics/eventCatalog.ts', 421],
  ['src/shared/errors/analytics/analyticsConfig.ts', 414],
  ['src/dev/localVaultWriteHarness.ts', 411],
  ['src/content/video/ui/VideoDialogPanel.ts', 407],
  ['src/shared/errors/analytics/googleAnalyticsReporter.ts', 396],
  ['src/content/video/videoControlBarButton.ts', 395],
  ['src/content/reader/ui/ReaderDialogPanel.ts', 393],
  ['src/content/reader/session.ts', 390],
  ['src/content/stitch/runtimeSurfaceContent.ts', 378],
  ['src/options/components/infrastructure/listBuilder.ts', 378],
  ['src/shared/exportDestination.ts', 372],
  ['src/ui/domains/reading/ReaderDialog.ts', 371],
  ['src/dev/contentOrchestratorHarness.ts', 358],
  ['src/background/services/obsidianWriter.ts', 352],
  ['src/background/vault-router.ts', 352],
  ['src/shared/state/globalStateManager.ts', 345],
  ['src/content/reader/sessionOperations.ts', 343],
  ['src/i18n/config.ts', 343],
  ['src/content/ui/supportPrompt.ts', 336],
  ['src/shared/config/provider.ts', 325],
  ['src/content/video/platforms/baseVideoPlatform.ts', 317],
  ['src/shared/errors/analytics/dataSanitizer.ts', 316],
  ['src/content/video/videoPromptMountLifecycle.ts', 313],
  ['src/options/components/diagnostics.ts', 313],
  ['src/options/state/vaultRouterStore.ts', 308],
  ['src/components/trial-notice.ts', 305],
  ['src/content/clipper/services/contextCapture.ts', 305],
  ['src/content/bootstrap.ts', 299],
  ['src/options/app/productionStitchPersistence.ts', 299],
  ['src/options/app/productionStitchShellState.ts', 298],
  ['src/content/video/videoPromptRenderer.ts', 291],
  ['src/content/reader/utils/markdownBuilder.ts', 288],
  ['src/options/app/productionStitchActions.ts', 285],
  ['src/platform/chrome/contextMenus.ts', 285],
  ['src/content/shared/panels/sessionPanelResize.ts', 284],
  ['src/background/application/clipProcessor.ts', 283],
  ['src/infrastructure/restClient.ts', 281],
  ['src/background/listeners/runtimeMessages.ts', 278],
  ['src/shared/services/yamlConfigSanitize.ts', 277],
  ['src/ui/domains/vault-router/VaultRouterView.ts', 277],
  ['src/background/services/telemetryService.ts', 275],
  ['src/options/stitch/render/nodeRenderers.ts', 274],
  ['src/third_party/ai-chat-exporter/shared/markdownLanguage.ts', 273],
  ['src/background/trialLifecycle.ts', 272],
  ['src/options/yaml-config-editor/validation.ts', 270],
  ['src/shared/errors/analytics/index.ts', 269],
  ['src/background/llm/classifier.ts', 268],
  ['src/background/services/usageStats.ts', 266],
  ['src/third_party/ai-chat-exporter/platforms/tongyi.ts', 265],
  ['src/options/utils/localizedText.ts', 264],
  ['src/options/services/connectionTestRunner.ts', 262],
  ['src/background/listeners/contextMenusCoordinator.ts', 258],
  ['src/content/runtime/contentLazyRuntime.ts', 258],
  ['src/options/stitch/render/contentRenderers.ts', 256],
  ['src/shared/guards/dom.ts', 256],
  ['src/content/reader/services/exporter.ts', 255],
  ['src/content/video/fragmentHighlighter.ts', 255],
  ['src/ui/domains/privacy/PrivacySettingsView.ts', 255],
  ['src/options/app/productionStitchShellMount.ts', 254],
  ['src/options/yaml-config-editor/rowModel.ts', 254],
  ['src/shared/config/types.ts', 253],
  ['src/third_party/ai-chat-exporter/platforms/kimi.ts', 252]
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

function parseArgs(argv) {
  const options = {
    root: ROOT,
    budgetJson: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--root requires a value');
      }
      options.root = value;
      index += 1;
      continue;
    }
    if (arg === '--budget-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--budget-json requires a value');
      }
      options.budgetJson = value;
      index += 1;
      continue;
    }
    if (arg === '--check') {
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeRelativePath(path) {
  return path.replaceAll('\\', '/');
}

function readBudgetMap(budgetJson) {
  if (!budgetJson) {
    return new Map(MAX_LINE_BUDGETS);
  }

  const parsed = JSON.parse(readFileSync(budgetJson, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--budget-json must contain an object of relative path to line budget');
  }

  return new Map(
    Object.entries(parsed).map(([relativePath, budget]) => {
      if (!Number.isInteger(budget) || budget < 1) {
        throw new Error(`Invalid line budget for ${relativePath}: ${budget}`);
      }
      return [normalizeRelativePath(relativePath), budget];
    })
  );
}

function listTrackedSourceFiles(root) {
  const output = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--', 'src/*.ts', 'src/*.tsx', 'src/**/*.ts', 'src/**/*.tsx'],
    {
      encoding: 'utf8'
    }
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter((relativePath) => existsSync(join(root, relativePath)))
    .sort((left, right) => left.localeCompare(right));
}

function countMatches(source) {
  return Object.fromEntries(
    PATTERNS.map(([label, pattern]) => [label, [...source.matchAll(pattern)].length])
  );
}

function countLines(source) {
  return source.split('\n').length;
}

export function collectPerformanceHotspots({
  root = ROOT,
  budgets = new Map(MAX_LINE_BUDGETS),
  trackedSourceFiles = listTrackedSourceFiles(root)
} = {}) {
  const trackedSourceSet = new Set(trackedSourceFiles);
  const staleBudgetPaths = [...budgets.keys()].filter(
    (relativePath) => !trackedSourceSet.has(relativePath)
  );

  const rows = trackedSourceFiles
    .map((relativePath) => {
      const source = readFileSync(join(root, relativePath), 'utf8');
      return {
        relativePath,
        lineCount: countLines(source),
        counters: countMatches(source),
        lineBudget: budgets.get(relativePath)
      };
    })
    .filter((row) => row.lineCount > 250)
    .sort(
      (left, right) =>
        right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath)
    );

  const missingBudgetPaths = rows
    .filter((row) => row.lineBudget === undefined)
    .map((row) => row.relativePath);
  const exceededBudgetRows = rows.filter(
    (row) => row.lineBudget !== undefined && row.lineCount > row.lineBudget
  );

  return {
    rows,
    trackedSourceCount: trackedSourceFiles.length,
    dynamicHotspotCount: rows.length,
    registeredBudgetCount: budgets.size,
    missingBudgetPaths,
    staleBudgetPaths,
    exceededBudgetRows,
    ok:
      missingBudgetPaths.length === 0 &&
      staleBudgetPaths.length === 0 &&
      exceededBudgetRows.length === 0
  };
}

export function formatPerformanceHotspots(report) {
  const lines = report.rows.map((row) => {
    const counters = PATTERNS.map(([label]) => `${label}=${row.counters[label]}`).join(', ');
    return `${row.relativePath}: lines=${row.lineCount}, ${counters}`;
  });

  lines.push(
    `dynamic hotspot coverage: trackedSourceFiles=${report.trackedSourceCount}, hotspotsOver250=${report.dynamicHotspotCount}, registeredLineBudgets=${report.registeredBudgetCount}`
  );

  return lines.join('\n');
}

function printFailures(report) {
  if (report.missingBudgetPaths.length > 0) {
    console.error(
      `Missing line budgets for dynamically discovered hotspots:\n${report.missingBudgetPaths
        .map((relativePath) => `- ${relativePath}`)
        .join('\n')}`
    );
  }
  if (report.staleBudgetPaths.length > 0) {
    console.error(
      `Stale line budgets reference non-tracked src files:\n${report.staleBudgetPaths
        .map((relativePath) => `- ${relativePath}`)
        .join('\n')}`
    );
  }
  for (const row of report.exceededBudgetRows) {
    console.error(
      `${row.relativePath} exceeds hotspot line budget: ${row.lineCount} > ${row.lineBudget}`
    );
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = collectPerformanceHotspots({
    root: options.root,
    budgets: readBudgetMap(options.budgetJson)
  });

  console.log(formatPerformanceHotspots(report));
  if (!report.ok) {
    printFailures(report);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
