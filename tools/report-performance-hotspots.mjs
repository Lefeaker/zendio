import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

const MAX_LINE_BUDGETS = new Map([
  ['src/i18n/generated/localeRegistry.generated.ts', 8899],
  ['src/i18n/generated/schemaMessages.generated.ts', 457],
  ['src/i18n/generated/messages.generated.ts', 1312],
  ['src/i18n/generated/locales/fr.generated.ts', 785],
  ['src/i18n/generated/locales/es-419.generated.ts', 777],
  ['src/i18n/generated/locales/es-ES.generated.ts', 777],
  ['src/i18n/generated/locales/de.generated.ts', 776],
  ['src/i18n/generated/locales/it.generated.ts', 769],
  ['src/i18n/generated/locales/pt-BR.generated.ts', 769],
  ['src/i18n/generated/locales/ru.generated.ts', 767],
  ['src/i18n/generated/locales/en.generated.ts', 744],
  ['src/i18n/generated/locales/ja.generated.ts', 744],
  ['src/i18n/generated/locales/ko.generated.ts', 732],
  ['src/i18n/generated/locales/zh-CN.generated.ts', 695],
  ['src/i18n/generated/locales/zh-TW.generated.ts', 690],
  ['src/options/stitch/content.ts', 906],
  ['src/options/yaml-config-editor/view.ts', 746],
  ['src/options/stitch/types.ts', 759],
  ['src/options/stitch/ui/components.ts', 592],
  ['src/third_party/ai-chat-exporter/platforms/gemini.ts', 576],
  ['src/options/stitch/schema/builders/surfaces.ts', 558],
  ['src/shared/attachments/videoScreenshotAttachmentTemplates.ts', 523],
  ['src/options/app/productionStitchStateMapper.ts', 517],
  ['src/content/clipper/components/clipperDialogController.ts', 511],
  ['src/content/reader/services/highlightManager.ts', 505],
  ['src/shared/di/serviceRegistry.ts', 498],
  // 2026-06-12 P03b: accepted P02 telemetry contract schema growth.
  ['src/shared/analytics/eventCatalog.ts', 541],
  // 2026-06-13 GA P01: schema-owned contract replaces duplicated catalog and
  // sanitizer tables; current exact schema hotspot budget is the new source of truth.
  ['src/shared/analytics/schema/analyticsSchema.ts', 308],
  ['src/content/video/sessionOperations.ts', 424],
  ['src/content/video/platforms/bilibiliRichText.ts', 302],
  ['src/content/video/platforms/bilibiliPlatformObserver.ts', 292],
  ['src/ui/domains/video/VideoDialog.ts', 468],
  ['src/content/video/videoPromptLifecycle.ts', 490],
  ['src/shared/analytics/analyticsSanitizers.ts', 460],
  ['src/background/pipelines/connectionTest.ts', 573],
  ['src/onboarding/bootstrap.ts', 584],
  ['src/background/services/notifications.ts', 424],
  ['src/background/trialLifecycle.ts', 272],
  ['src/shared/config/optionsMerger.ts', 417],
  ['src/dev/localVaultWriteHarness.ts', 411],
  // 2026-06-11: Session mutation architecture adds fail-closed terminal draft
  // finalization and shared transaction plumbing across reader/video surfaces.
  ['src/content/video/videoSessionRuntime.ts', 746],
  // 2026-06-13 final combined integration: queue now carries explicit visible
  // capture request tracking while preserving the lazy screenshot preparation split.
  ['src/content/video/videoScreenshotPreparationQueue.ts', 404],
  // 2026-06-13 final combined integration: request state moved out of the lazy
  // coordinator and now tracks explicit visible requests so dependency-cruiser can
  // enforce the screenshot preparation split without cycles.
  ['src/content/video/videoScreenshotPreparationRequestStore.ts', 306],
  ['src/content/video/videoScreenshotPreparationCoordinator.ts', 147],
  ['src/content/reader/ui/ReaderDialogPanel.ts', 407],
  ['src/content/reader/session.ts', 711],
  ['src/content/video/videoControlBarButton.ts', 395],
  ['src/content/stitch/runtimeSurfaceContent.ts', 407],
  ['src/options/components/infrastructure/listBuilder.ts', 378],
  ['src/shared/exportDestination.ts', 372],
  ['src/ui/domains/reading/ReaderDialog.ts', 371],
  // 2026-06-13 final combined integration: screenshot status dots and add-note
  // focus/layout regressions are covered in the panel while retaining the current UI.
  ['src/content/video/ui/VideoDialogPanel.ts', 425],
  ['src/options/app/productionStitchPersistence.ts', 387],
  ['src/shared/errors/analytics/analyticsConfig.template.ts', 364],
  ['src/shared/errors/analytics/analyticsConfig.ts', 369],
  ['src/dev/contentOrchestratorHarness.ts', 358],
  ['src/options/app/productionStitchShellActionRuntime.ts', 357],
  ['src/background/services/obsidianWriter.ts', 422],
  ['src/background/vault-router.ts', 352],
  ['src/shared/state/globalStateManager.ts', 345],
  ['src/content/reader/sessionOperations.ts', 712],
  ['src/i18n/config.ts', 343],
  ['src/content/ui/supportPrompt.ts', 331],
  ['src/options/services/connectionTester.ts', 328],
  ['src/shared/config/provider.ts', 325],
  ['src/shared/errors/analytics/googleAnalyticsReporter.ts', 320],
  ['src/content/video/platforms/baseVideoPlatform.ts', 317],
  ['src/shared/errors/analytics/dataSanitizer.ts', 316],
  ['src/content/video/videoPromptMountLifecycle.ts', 313],
  ['src/options/components/diagnostics.ts', 322],
  ['src/options/state/vaultRouterStore.ts', 308],
  ['src/components/trial-notice.ts', 305],
  ['src/content/clipper/services/contextCapture.ts', 305],
  // 2026-06-12 P03: video session draft ownership moved into a focused controller.
  ['src/content/video/videoSessionDraftController.ts', 310],
  ['src/options/app/productionStitchActions.ts', 302],
  ['src/options/stitch/schema/settings/overview.ts', 298],
  ['src/options/stitch/schema/settings/capture-behavior.ts', 294],
  ['src/content/video/videoPromptRenderer.ts', 291],
  ['src/options/stitch/schema/settings/output.ts', 291],
  ['src/content/reader/utils/markdownBuilder.ts', 288],
  ['src/options/app/productionStitchShellState.ts', 288],
  ['src/content/bootstrap.ts', 286],
  ['src/platform/chrome/contextMenus.ts', 285],
  ['src/content/shared/panels/sessionPanelResize.ts', 284],
  ['src/background/application/clipProcessor.ts', 502],
  ['src/infrastructure/restClient.ts', 281],
  ['src/shared/services/yamlConfigSanitize.ts', 277],
  ['src/ui/domains/vault-router/VaultRouterView.ts', 277],
  ['src/options/stitch/render/nodeRenderers.ts', 274],
  ['src/third_party/ai-chat-exporter/shared/markdownLanguage.ts', 273],
  ['src/options/stitch/schema/settings/capture-sources.ts', 272],
  ['src/options/yaml-config-editor/validation.ts', 270],
  ['src/background/llm/classifier.ts', 268],
  // 2026-06-13 final combined integration: runtime messages own the visible-tab
  // screenshot request boundary used by video export preparation.
  ['src/background/listeners/runtimeMessages.ts', 351],
  ['src/background/services/usageStats.ts', 266],
  ['src/background/application/videoScreenshotAttachmentPlanner.ts', 269],
  ['src/third_party/ai-chat-exporter/platforms/tongyi.ts', 265],
  ['src/options/utils/localizedText.ts', 264],
  ['src/options/services/connectionTestRunner.ts', 262],
  ['src/content/video/sessionPlatformController.ts', 260],
  ['src/content/runtime/contentMessageHandlers.ts', 259],
  ['src/i18n/adapters/domBindingAdapter.ts', 257],
  ['src/background/listeners/contextMenusCoordinator.ts', 258],
  ['src/content/runtime/contentLazyRuntime.ts', 258],
  ['src/options/stitch/render/contentRenderers.ts', 256],
  ['src/shared/guards/dom.ts', 256],
  ['src/content/reader/services/exporter.ts', 255],
  ['src/content/video/fragmentHighlighter.ts', 255],
  ['src/ui/domains/privacy/PrivacySettingsView.ts', 255],
  ['src/options/app/productionStitchShellMount.ts', 254],
  ['src/options/app/productionStitchRenderLifecycle.ts', 253],
  ['src/options/yaml-config-editor/rowModel.ts', 254],
  ['src/options/app/bootstrap.ts', 251],
  ['src/options/stitch/schema/resources/onboarding.ts', 251],
  ['src/third_party/ai-chat-exporter/platforms/kimi.ts', 252],
  ['src/i18n/catalog/languages.ts', 280],
  ['src/content/sessionDrafts/sessionDraftRepository.ts', 399],
  ['src/content/reader/sessionDrafts.ts', 333]
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

function isSourceModulePath(relativePath) {
  return (
    relativePath.startsWith('src/') &&
    (relativePath.endsWith('.ts') || relativePath.endsWith('.tsx'))
  );
}

function readGitPaths(root, args) {
  const output = execFileSync('git', ['-C', root, 'ls-files', ...args], {
    encoding: 'utf8'
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(isSourceModulePath)
    .filter((relativePath) => existsSync(join(root, relativePath)));
}

function listCurrentSourceFiles(root) {
  return [
    ...new Set([
      ...readGitPaths(root, ['--', 'src']),
      ...readGitPaths(root, ['--others', '--exclude-standard', '--', 'src'])
    ])
  ].sort((left, right) => left.localeCompare(right));
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
  sourceFiles = listCurrentSourceFiles(root)
} = {}) {
  const trackedSourceSet = new Set(sourceFiles);
  const staleBudgetPaths = [...budgets.keys()].filter(
    (relativePath) => !trackedSourceSet.has(relativePath)
  );

  const rows = sourceFiles
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
    sourceFileCount: sourceFiles.length,
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
    `dynamic hotspot coverage: sourceFiles=${report.sourceFileCount}, hotspotsOver250=${report.dynamicHotspotCount}, registeredLineBudgets=${report.registeredBudgetCount}`
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
      `Stale line budgets reference non-current src files:\n${report.staleBudgetPaths
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
