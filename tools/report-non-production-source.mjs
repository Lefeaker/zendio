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
  const prepared = pattern.replaceAll('**', '__DOUBLE_STAR__').replaceAll('*', '__STAR__');
  const escaped = prepared
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('__DOUBLE_STAR__', '.*')
    .replaceAll('__STAR__', '[^/]*');
  return new RegExp(`^${escaped}$`);
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
      requiredAction: 'Retain; source has production ownership.'
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
      requiredAction: 'Move behavior coverage to production owners or tests/fixtures before deletion.'
    };
  }

  if (hasScriptOwners(input)) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'migrate-script-owner',
      requiredAction: 'Remove package/build/public/script ownership before deletion.'
    };
  }

  if (deleteCandidate && Object.values(proofs).every((value) => value === 'empty')) {
    return {
      ...input,
      ownerProofs: proofs,
      decision: 'delete-now',
      requiredAction: 'Delete only in the planned deletion milestone with this six-proof evidence.'
    };
  }

  return {
    ...input,
    ownerProofs: proofs,
    decision: 'stop-unknown',
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
    '| File | Decision | Production build owners | Import owners | Test owners | Script owners | Public/manifest owners | Required verification owners | Required action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const row of rows) {
    lines.push(
      [
        `| \`${row.file}\``,
        row.decision,
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
