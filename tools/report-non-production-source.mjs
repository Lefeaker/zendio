import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PRODUCTION_GRAPH_PATH = 'build/reports/production-build-graph.json';
const TEXT_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|json|html|css|md|yml|yaml)$/;
const REQUIRED_VERIFICATION_SCRIPT_NAMES = new Set([
  'quality',
  'verify:preflight',
  'verify:preflight:full',
  'build',
  'build:firefox',
  'package',
  'package:firefox',
  'release',
  'test:ci',
  'verify:stitch-secondary'
]);

const EXPLICIT_RETAIN_PATTERNS = [
  {
    pattern: 'src/content/video/session.ts',
    decision: 'retain-production-facade',
    owner: 'content video compatibility shell',
    deletionCondition: 'delete only after public imports and tests migrate to runtime session owners'
  },
  {
    pattern: 'src/content/video/platforms/bilibiliPlatform.ts',
    decision: 'retain-production-facade',
    owner: 'video platform compatibility shell',
    deletionCondition: 'delete only after platform imports move to current video domain owner'
  },
  {
    pattern: 'src/ui/domains/privacy/PrivacySettings.ts',
    decision: 'retain-production-facade',
    owner: 'privacy domain compatibility shell',
    deletionCondition: 'delete only after imports use PrivacySettingsView directly'
  },
  {
    pattern: 'src/options/components/sections/RestSection.ts',
    decision: 'retain-production-facade',
    owner: 'REST section compatibility shell',
    deletionCondition: 'delete only after compatibility tests and public imports are migrated'
  },
  {
    pattern: 'src/options/components/sections/FragmentSection.ts',
    decision: 'retain-production-facade',
    owner: 'Fragment section compatibility shell',
    deletionCondition: 'delete only after compatibility tests and public imports are migrated'
  },
  {
    pattern: 'src/options/components/sections/UsageSection.ts',
    decision: 'retain-production-facade',
    owner: 'Usage section compatibility shell',
    deletionCondition: 'delete only after compatibility tests and public imports are migrated'
  }
];

const EXPLICIT_CLASSIFICATION_PATTERNS = [
  {
    pattern: 'src/background/sinks/obsidianRest.ts',
    decision: 'retain-production-facade',
    owner: 'background sink compatibility boundary',
    deletionCondition: 'delete only after Obsidian sink imports move to the current writer/service owner'
  },
  {
    pattern: 'src/content/clipper/components/dialogTypes.ts',
    decision: 'retain-production-facade',
    owner: 'clipper dialog public type boundary',
    deletionCondition: 'delete only after dialog contracts move to the current content runtime owner'
  },
  {
    pattern: 'src/content/reader/{highlightController,sessionExportUtils,styles,types}.ts',
    decision: 'retain-production-facade',
    owner: 'reader runtime compatibility contract',
    deletionCondition: 'delete only after reader runtime imports and tests move to the current reader domain owner'
  },
  {
    pattern: 'src/content/runtime/supportProgress.ts',
    decision: 'retain-production-facade',
    owner: 'content runtime support progress contract',
    deletionCondition: 'delete only after support progress UI imports move to the current runtime surface owner'
  },
  {
    pattern: 'src/content/shared/markdown.ts',
    decision: 'retain-production-facade',
    owner: 'content markdown shared contract',
    deletionCondition: 'delete only after markdown callers use current formatter/domain modules directly'
  },
  {
    pattern: 'src/content/ui/supportPrompt/types.ts',
    decision: 'retain-production-facade',
    owner: 'support prompt UI type boundary',
    deletionCondition: 'delete only after support prompt callers use the domain contract directly'
  },
  {
    pattern: 'src/content/video/platforms/bilibiliSelectionTypes.ts',
    decision: 'retain-production-facade',
    owner: 'Bilibili video platform type boundary',
    deletionCondition: 'delete only after Bilibili selection callers move to current platform contracts'
  },
  {
    pattern: 'src/infrastructure/index.ts',
    decision: 'retain-production-facade',
    owner: 'infrastructure public barrel',
    deletionCondition: 'delete only after public imports no longer require the infrastructure barrel shape'
  },
  {
    pattern: 'src/options/app/actions/*.ts',
    decision: 'retain-production-facade',
    owner: 'Options action public boundary',
    deletionCondition: 'delete only after production Stitch action dispatch moves to focused action owners'
  },
  {
    pattern: 'src/options/app/changelogContent.ts',
    decision: 'retain-production-facade',
    owner: 'Options changelog content compatibility module',
    deletionCondition: 'delete only after changelog content is removed from Options public behavior'
  },
  {
    pattern: 'src/options/app/optionsShellState.ts',
    decision: 'retain-production-facade',
    owner: 'Options shell state compatibility module',
    deletionCondition: 'delete only after production shell state is fully represented by split shell owners'
  },
  {
    pattern: 'src/options/components/controls/connectionTest.ts',
    decision: 'migrate-test-owner',
    owner: 'legacy Options connection test control retained by old section coverage',
    deletionCondition: 'delete after connection test behavior is covered by production Stitch/storage tests'
  },
  {
    pattern: 'src/options/components/sectionRegistry.ts',
    decision: 'retain-production-facade',
    owner: 'legacy Options section registry compatibility boundary',
    deletionCondition: 'delete after production Stitch schema registry fully replaces legacy section lookup'
  },
  {
    pattern: 'src/options/components/sections/fragmentSection*.ts',
    decision: 'migrate-test-owner',
    owner: 'legacy Fragment section helper retained by old section coverage',
    deletionCondition: 'delete after Fragment behavior is covered by production Stitch/schema tests'
  },
  {
    pattern: 'src/options/components/sections/restSection*.ts',
    decision: 'migrate-test-owner',
    owner: 'legacy REST section helper retained by old section coverage',
    deletionCondition: 'delete after REST/storage behavior is covered by production Stitch/storage tests'
  },
  {
    pattern: 'src/options/components/sections/usage*.ts',
    decision: 'migrate-test-owner',
    owner: 'legacy Usage section helper retained by old usage coverage',
    deletionCondition: 'delete after usage behavior is covered by production Stitch/domain tests'
  },
  {
    pattern: 'src/options/schema-runtime/index.ts',
    decision: 'retain-production-facade',
    owner: 'Options schema runtime public barrel',
    deletionCondition: 'delete only after schema runtime imports move to concrete Stitch runtime modules'
  },
  {
    pattern: 'src/options/services/connectionTestRuntime.ts',
    decision: 'retain-production-facade',
    owner: 'Options connection test runtime contract',
    deletionCondition: 'delete only after storage connection testing is owned by current production service modules'
  },
  {
    pattern: 'src/options/state/selectors.ts',
    decision: 'retain-production-facade',
    owner: 'Options state selector compatibility module',
    deletionCondition: 'delete only after production Stitch state mapping no longer imports legacy selectors'
  },
  {
    pattern: 'src/options/stitch/schema/surfaces/helpers.ts',
    decision: 'retain-production-facade',
    owner: 'Stitch schema surface helper contract',
    deletionCondition: 'delete only after schema surfaces inline or replace this helper boundary'
  },
  {
    pattern: 'src/options/stitch/state.ts',
    decision: 'retain-production-facade',
    owner: 'Stitch state public contract',
    deletionCondition: 'delete only after production Stitch state moves to focused state owner modules'
  },
  {
    pattern: 'src/options/utils/index.ts',
    decision: 'retain-production-facade',
    owner: 'Options utilities public barrel',
    deletionCondition: 'delete only after public utility imports move to concrete modules'
  },
  {
    pattern: 'src/options/widgets/PrivacyWidget.ts',
    decision: 'retain-production-facade',
    owner: 'privacy widget compatibility adapter',
    deletionCondition: 'delete after M3 privacy controls move fully to Stitch/domain owners and barrel exports are removed'
  },
  {
    pattern: 'src/options/widgets/shared/rest/**',
    decision: 'migrate-test-owner',
    owner: 'legacy REST widget helper retained for REST/widget migration',
    deletionCondition: 'delete after REST storage widget behavior is covered by Stitch/domain owners'
  },
  {
    pattern: 'src/options/widgets/shared/usage/**',
    decision: 'migrate-test-owner',
    owner: 'legacy Usage widget helper retained for usage widget migration',
    deletionCondition: 'delete after usage dashboard behavior is covered by Stitch/domain owners'
  },
  {
    pattern: 'src/shared/config/types.ts',
    decision: 'retain-production-facade',
    owner: 'shared configuration type contract',
    deletionCondition: 'delete only after all config type exports move to current shared schemas/types'
  },
  {
    pattern: 'src/shared/errors/analytics/analyticsConfig.template.ts',
    decision: 'retain-production-facade',
    owner: 'analytics error configuration template contract',
    deletionCondition: 'delete only after analytics error configuration is removed or replaced by current config owner'
  },
  {
    pattern: 'src/shared/i18n/textAdaptationTypes.ts',
    decision: 'retain-production-facade',
    owner: 'shared i18n text adaptation type contract',
    deletionCondition: 'delete only after text adaptation exports move to current i18n schema/type owners'
  },
  {
    pattern: 'src/shared/interfaces/index.ts',
    decision: 'retain-production-facade',
    owner: 'shared interfaces public barrel',
    deletionCondition: 'delete only after public interface imports move to concrete interface files'
  },
  {
    pattern: 'src/shared/repositories/*.ts',
    decision: 'retain-production-facade',
    owner: 'shared repository public contract',
    deletionCondition: 'delete only after repository imports move to concrete current repository contracts'
  },
  {
    pattern: 'src/shared/schemas/taxonomy.schema.ts',
    decision: 'retain-production-facade',
    owner: 'shared taxonomy schema contract',
    deletionCondition: 'delete only after taxonomy schema is removed from public shared schema surface'
  },
  {
    pattern: 'src/shared/types/external.ts',
    decision: 'retain-production-facade',
    owner: 'shared external type contract',
    deletionCondition: 'delete only after external type exports move to current shared type owners'
  },
  {
    pattern: 'src/styles/firefox.css',
    decision: 'retain-production-facade',
    owner: 'Firefox style compatibility asset',
    deletionCondition: 'delete only after Firefox build/public asset checks prove the style is unused'
  },
  {
    pattern: 'src/ui/ZagCombobox.js',
    decision: 'retain-production-facade',
    owner: 'Zag combobox UI compatibility module',
    deletionCondition: 'delete only after combobox consumers move to current UI primitive/domain owner'
  },
  {
    pattern: 'src/ui/domains/**',
    decision: 'retain-production-facade',
    owner: 'UI domain public boundary',
    deletionCondition: 'delete only after source-of-truth docs and imports no longer require this domain boundary'
  },
  {
    pattern: 'src/ui/patterns/**',
    decision: 'retain-production-facade',
    owner: 'UI pattern public boundary',
    deletionCondition: 'delete only after source-of-truth docs and imports no longer require this pattern boundary'
  },
  {
    pattern: 'src/ui/primitives/**',
    decision: 'retain-production-facade',
    owner: 'UI primitive public boundary',
    deletionCondition: 'delete only after source-of-truth docs and imports no longer require this primitive boundary'
  }
];

const EXPLICIT_DELETE_NOW_PATTERNS = [];

async function walk(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readTextFiles(roots) {
  const files = [];
  for (const root of roots) {
    const fullRoot = join(ROOT, root);
    if (!existsSync(fullRoot)) {
      continue;
    }
    const rootStat = await stat(fullRoot);
    const candidates = rootStat.isDirectory() ? await walk(fullRoot) : [fullRoot];
    for (const file of candidates) {
      if (!TEXT_EXTENSIONS.test(file)) {
        continue;
      }
      files.push({
        path: relative(ROOT, file),
        source: await readFile(file, 'utf8')
      });
    }
  }
  return files;
}

function patternToRegExp(pattern) {
  const braceGroups = [];
  const prepared = pattern
    .replace(/\{([^}]+)\}/g, (_, alternatives) => {
      const token = `__BRACE_GROUP_${braceGroups.length}__`;
      braceGroups.push(`(${alternatives.split(',').map(escapeRegExp).join('|')})`);
      return token;
    })
    .replaceAll('**', '__DOUBLE_STAR__')
    .replaceAll('*', '__STAR__');
  let escaped = prepared
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('__DOUBLE_STAR__', '.*')
    .replaceAll('__STAR__', '[^/]*');
  for (const [index, group] of braceGroups.entries()) {
    escaped = escaped.replaceAll(`__BRACE_GROUP_${index}__`, group);
  }
  return new RegExp(`^${escaped}$`);
}

function escapeRegExp(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPattern(file, pattern) {
  return patternToRegExp(pattern).test(file);
}

function matchesAnyPattern(file, patterns) {
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? matchesPattern(file, pattern) : matchesPattern(file, pattern.pattern)
  );
}

function tokenForFile(file) {
  return file.replace(/\.(ts|tsx|js|mjs|cjs|css)$/, '');
}

function importTokenForFile(file) {
  const withoutExtension = tokenForFile(file);
  return [withoutExtension, withoutExtension.replace(/^src\//, ''), `@/${withoutExtension}`];
}

function collectTextOwners(files, targetFile) {
  const tokens = importTokenForFile(targetFile);
  return files
    .filter((file) => file.path !== targetFile)
    .filter((file) => tokens.some((token) => file.source.includes(token)))
    .map((file) => file.path)
    .sort();
}

function parsePackageScripts() {
  if (!existsSync('package.json')) {
    return {};
  }
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  return packageJson.scripts ?? {};
}

function collectRequiredVerificationOwners(targetFile, scripts) {
  const tokens = importTokenForFile(targetFile);
  return Object.entries(scripts)
    .filter(([name]) => REQUIRED_VERIFICATION_SCRIPT_NAMES.has(name))
    .filter(([, command]) => tokens.some((token) => String(command).includes(token)))
    .map(([name]) => `package.json#scripts.${name}`)
    .sort();
}

function ownerProofsFor(input) {
  if (input.ownerProofs) {
    return input.ownerProofs;
  }
  return {
    productionBuildGraph: input.productionBuildGraphOwners?.length ? 'owned' : 'empty',
    importGraph: input.productionImportOwners?.length ? 'owned' : 'empty',
    packageBuildScripts: input.scriptOwners?.length ? 'owned' : 'empty',
    publicManifestAssets: input.publicAssetOwners?.length ? 'owned' : 'empty',
    testsVisualBrowser: input.testOwners?.length ? 'owned' : 'empty',
    requiredVerification: input.requiredVerificationOwners?.length ? 'owned' : 'empty'
  };
}

function explicitRetainRule(file, patterns) {
  return patterns.find((pattern) =>
    typeof pattern === 'string' ? matchesPattern(file, pattern) : matchesPattern(file, pattern.pattern)
  );
}

function explicitClassificationRule(file, patterns) {
  return patterns.find((pattern) =>
    typeof pattern === 'string' ? matchesPattern(file, pattern) : matchesPattern(file, pattern.pattern)
  );
}

function hasOnlyTestOwners(input) {
  return (
    !input.productionBuildGraphOwners?.length &&
    !input.productionImportOwners?.length &&
    !input.scriptOwners?.length &&
    !input.publicAssetOwners?.length &&
    ((input.testOwners?.length ?? 0) > 0 || (input.requiredVerificationOwners?.length ?? 0) > 0)
  );
}

function hasScriptOwners(input) {
  return (input.scriptOwners?.length ?? 0) > 0 || (input.publicAssetOwners?.length ?? 0) > 0;
}

function classifySourceFile(input) {
  const proofs = ownerProofsFor(input);
  const deleteCandidate = matchesAnyPattern(input.file, input.explicitDeleteNowPatterns ?? []);
  const unknownProof = Object.values(proofs).some((value) => value === 'unknown');
  if (deleteCandidate && unknownProof) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'stop-unknown',
      requiredAction: 'Classify ownership with all six owner proofs before delete-now.'
    };
  }

  if ((input.productionBuildGraphOwners?.length ?? 0) > 0 || (input.productionImportOwners?.length ?? 0) > 0) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'retain-production',
      owner: 'production build/import graph',
      deletionCondition: 'not a deletion candidate while production build or import ownership remains',
      requiredAction: 'Retain; source has production ownership.'
    };
  }

  const classificationRule = explicitClassificationRule(
    input.file,
    input.explicitClassificationPatterns ?? []
  );
  if (classificationRule) {
    return {
      ...input,
      ownerProofs: proofs,
      decision:
        typeof classificationRule === 'string'
          ? 'retain-production-facade'
          : classificationRule.decision,
      owner:
        typeof classificationRule === 'string'
          ? 'explicit classification rule'
          : classificationRule.owner,
      deletionCondition:
        typeof classificationRule === 'string'
          ? 'delete only after explicit classification owner is retired'
          : classificationRule.deletionCondition,
      requiredAction:
        typeof classificationRule === 'string'
          ? 'Retain documented compatibility shell or production contract.'
          : classificationRule.requiredAction ??
            'Retain or migrate according to the documented owner and deletion condition.'
    };
  }

  const retainRule = explicitRetainRule(input.file, input.explicitRetainPatterns ?? []);
  if (retainRule) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: typeof retainRule === 'string' ? 'retain-production-facade' : retainRule.decision,
      owner: typeof retainRule === 'string' ? 'explicit retain rule' : retainRule.owner,
      deletionCondition:
        typeof retainRule === 'string' ? 'remove after explicit retain owner is retired' : retainRule.deletionCondition,
      requiredAction: 'Retain documented compatibility shell or production contract.'
    };
  }

  if (hasOnlyTestOwners(input)) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'migrate-test-owner',
      owner: 'test/visual/browser verification owner',
      deletionCondition: 'delete only after behavior coverage moves to production owners or tests/fixtures',
      requiredAction: 'Move behavior coverage to production owners or tests/fixtures before deletion.'
    };
  }

  if (hasScriptOwners(input)) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'migrate-script-owner',
      owner: 'script/tool/public asset owner',
      deletionCondition: 'delete only after package/build/script/public ownership is removed',
      requiredAction: 'Remove package/build/public/script ownership before deletion.'
    };
  }

  if (deleteCandidate && Object.values(proofs).every((value) => value === 'empty')) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'delete-now',
      owner: 'none; all six owner proofs are empty',
      deletionCondition: 'delete in the planned deletion milestone only',
      requiredAction: 'Delete only in the planned deletion milestone with this six-proof evidence.'
    };
  }

  return {
    ...input,
    ownerProofs: proofs,
    decision: 'stop-unknown',
    owner: 'unknown',
    deletionCondition: 'classification required before deletion or gate wiring',
    requiredAction: 'Classify ownership before deletion or gate wiring.'
  };
}

function formatOwnerList(owners) {
  return owners?.length ? owners.join('<br>') : 'none';
}

function formatNonProductionSourceReport(rows) {
  const lines = [
    '# Non-Production Source Ownership Report',
    '',
    '| File | Decision | Owner | Deletion condition | Production build owners | Import owners | Test owners | Script owners | Public/manifest owners | Required verification owners | Required action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const row of rows) {
    lines.push(
      [
        `| \`${row.file}\``,
        row.decision,
        row.owner ?? 'n/a',
        row.deletionCondition ?? 'n/a',
        formatOwnerList(row.productionBuildGraphOwners),
        formatOwnerList(row.productionImportOwners),
        formatOwnerList(row.testOwners),
        formatOwnerList(row.scriptOwners),
        formatOwnerList(row.publicAssetOwners),
        formatOwnerList(row.requiredVerificationOwners),
        `${row.requiredAction} |`
      ].join(' | ')
    );
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.decision] = (acc[row.decision] ?? 0) + 1;
    return acc;
  }, {});
  lines.push('', '## Decision Counts', '');
  for (const [decision, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${decision}: ${count}`);
  }

  return `${lines.join('\n')}\n`;
}

async function listSourceFiles() {
  const files = await walk(join(ROOT, 'src'));
  return files
    .map((file) => relative(ROOT, file))
    .filter((file) => /\.(ts|tsx|js|mjs|css)$/.test(file))
    .sort();
}

function loadProductionGraph(path = PRODUCTION_GRAPH_PATH) {
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}; run npm run audit:production-build-graph:report before non-production source audit.`
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function buildNonProductionSourceRows() {
  const graph = loadProductionGraph();
  const scripts = parsePackageScripts();
  const sourceFiles = await listSourceFiles();
  const srcTextFiles = await readTextFiles(['src']);
  const testTextFiles = await readTextFiles(['tests', 'playwright.config.ts', 'playwright.reader.config.ts']);
  const scriptTextFiles = await readTextFiles(['package.json', 'scripts', 'tools', '.github']);
  const publicTextFiles = await readTextFiles(['public']);
  const productionSources = new Set(Object.keys(graph.reachableSources ?? {}));

  return sourceFiles.map((file) => {
    const productionImportOwners = collectTextOwners(srcTextFiles, file).filter((owner) =>
      productionSources.has(owner)
    );
    const row = {
      file,
      productionBuildGraphOwners: graph.reachableSources?.[file]?.entrypointOwners ?? [],
      productionImportOwners,
      testOwners: collectTextOwners(testTextFiles, file),
      scriptOwners: collectTextOwners(scriptTextFiles, file),
      publicAssetOwners: collectTextOwners(publicTextFiles, file),
      requiredVerificationOwners: collectRequiredVerificationOwners(file, scripts),
      explicitRetainPatterns: EXPLICIT_RETAIN_PATTERNS,
      explicitClassificationPatterns: EXPLICIT_CLASSIFICATION_PATTERNS,
      explicitDeleteNowPatterns: EXPLICIT_DELETE_NOW_PATTERNS
    };
    return classifySourceFile(row);
  });
}

async function main() {
  const rows = await buildNonProductionSourceRows();
  process.stdout.write(formatNonProductionSourceReport(rows));
  const blocking = rows.filter((row) =>
    ['stop-unknown', 'migrate-test-owner', 'migrate-script-owner', 'delete-now'].includes(row.decision)
  );
  if (blocking.length > 0) {
    console.error(
      `non-production source audit has ${blocking.length} report-only blocking rows; do not wire into hard gates yet`
    );
    process.exit(1);
  }
}

export { classifySourceFile, formatNonProductionSourceReport, buildNonProductionSourceRows };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
