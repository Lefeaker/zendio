import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { cssTextPlugin } from '../scripts/plugins/cssTextPlugin.mjs';

const ROOT = process.cwd();
const BUILD_GRAPH_FAMILIES = [
  'src/options/preview/**',
  'src/options/components/formSections/**',
  'src/options/components/layout/**',
  'src/options/components/sections/*Section.ts',
  'src/options/widgets/**',
  'src/ui/domains/video/SupportPromptView.ts',
  'src/options/stitch/schema/settings/experimental.ts',
  'src/infrastructure/optionsRepository.ts'
];

const ENTRYPOINTS = {
  'background/index': 'src/background/index.ts',
  'content/runtime': 'src/content/index.ts',
  'local-vault-permission': 'src/content/runtime/localVaultPermissionFrame.ts',
  'offscreen/local-vault': 'src/offscreen/localVault.ts',
  'options/index': 'src/options/index.ts',
  'onboarding/index': 'src/onboarding/index.ts',
  'interaction-contract-harness': 'src/dev/interactionContractHarness.ts',
  'content-orchestrator-harness': 'src/dev/contentOrchestratorHarness.ts',
  'runtime-observability-harness': 'src/dev/runtimeObservabilityHarness.ts',
  'local-vault-write-harness': 'src/dev/localVaultWriteHarness.ts'
};

const BACKGROUND_ENTRYPOINTS = {
  'background/index': 'src/background/index.ts'
};

function resolveBooleanEnv(value) {
  return value === '1' || value === 'true';
}

function getSharedBuildOptions() {
  return {
    bundle: true,
    platform: 'browser',
    sourcemap: false,
    minify: false,
    write: false,
    metafile: true,
    define: {
      'process.env.NODE_ENV': JSON.stringify('development'),
      __DEV__: 'true',
      __AIIINOB_SENTRY_DSN__: JSON.stringify(process.env.AIIINOB_SENTRY_DSN ?? ''),
      __AIIINOB_SENTRY_ENVIRONMENT__: JSON.stringify(
        process.env.AIIINOB_SENTRY_ENVIRONMENT ?? 'development'
      ),
      __AIIINOB_SENTRY_RELEASE__: JSON.stringify(process.env.AIIINOB_SENTRY_RELEASE ?? '0.2.0'),
      __AIIINOB_SENTRY_ENABLED__: resolveBooleanEnv(process.env.AIIINOB_SENTRY_ENABLED)
        ? 'true'
        : 'false'
    },
    charset: 'utf8',
    loader: {
      '.css': 'text'
    },
    plugins: [cssTextPlugin()]
  };
}

async function createMetafile() {
  const shared = getSharedBuildOptions();
  const background = await build({
    ...shared,
    entryPoints: BACKGROUND_ENTRYPOINTS,
    format: 'iife',
    outfile: 'build/audit/background/index.js'
  });
  const app = await build({
    ...shared,
    entryPoints: ENTRYPOINTS,
    format: 'esm',
    splitting: true,
    outdir: 'build/audit'
  });
  return mergeMetafiles([background.metafile, app.metafile]);
}

function mergeMetafiles(metafiles) {
  return {
    inputs: Object.assign({}, ...metafiles.map((metafile) => metafile.inputs ?? {})),
    outputs: Object.assign({}, ...metafiles.map((metafile) => metafile.outputs ?? {}))
  };
}

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
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readTextFiles(paths) {
  const files = [];
  for (const base of paths) {
    const fullBase = join(ROOT, base);
    if (!existsSync(fullBase)) {
      continue;
    }
    const stats = await stat(fullBase);
    const candidates = stats.isDirectory() ? await walk(fullBase) : [fullBase];
    for (const file of candidates) {
      if (/\.(ts|tsx|js|mjs|cjs|json|html|css|md)$/.test(file)) {
        files.push({
          path: relative(ROOT, file),
          source: await readFile(file, 'utf8')
        });
      }
    }
  }
  return files;
}

function normalizeInputPath(input) {
  return input.replace(/^\.\//, '');
}

function familyPatternToRegExp(family) {
  const pattern = family.replaceAll('**', '__DOUBLE_STAR__').replaceAll('*', '__STAR__');
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('__DOUBLE_STAR__', '.*')
    .replaceAll('__STAR__', '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function familySearchTokens(family) {
  const base = family.replace('/**', '').replace('/*Section.ts', '').replace('.ts', '');
  const noSrc = base.replace(/^src\//, '');
  return Array.from(new Set([base, noSrc]));
}

function classifyInput(path) {
  if (path.startsWith('src/dev/')) {
    return 'build-sensitive-harness';
  }
  return 'production-user-facing';
}

function classifySources(metafile) {
  const sourceMap = new Map();
  for (const input of Object.keys(metafile.inputs ?? {})) {
    const normalized = normalizeInputPath(input);
    if (!normalized.startsWith('src/')) {
      continue;
    }
    sourceMap.set(normalized, classifyInput(normalized));
  }
  return sourceMap;
}

function collectEntrypointOwners(metafile) {
  const owners = new Map();
  for (const [outputPath, output] of Object.entries(metafile.outputs ?? {})) {
    const entryPoint = output.entryPoint ? normalizeInputPath(output.entryPoint) : null;
    for (const input of Object.keys(output.inputs ?? {})) {
      const normalized = normalizeInputPath(input);
      if (!normalized.startsWith('src/')) {
        continue;
      }
      const list = owners.get(normalized) ?? [];
      list.push(entryPoint ?? outputPath);
      owners.set(normalized, Array.from(new Set(list)));
    }
  }
  return owners;
}

function collectFamilyMatches(family, sourceMap) {
  const pattern = familyPatternToRegExp(family);
  return Array.from(sourceMap.keys()).filter((path) => {
    if (pattern.test(path)) {
      return true;
    }
    if (family.endsWith('*Section.ts')) {
      return /^src\/options\/components\/sections\/[A-Z].*Section\.ts$/.test(path);
    }
    return false;
  });
}

function collectTextOwners(files, family) {
  const tokens = familySearchTokens(family);
  return files
    .filter((file) => tokens.some((token) => file.source.includes(token)))
    .map((file) => file.path);
}

function readDeleteNowFamilies(inventoryPath = 'docs/retired-code-inventory.md') {
  if (!existsSync(inventoryPath)) {
    return [];
  }
  const source = readFileSync(inventoryPath, 'utf8');
  return source
    .split('\n')
    .filter((line) => line.includes('|') && line.includes('delete-now'))
    .map((line) => line.match(/`([^`]+)`/)?.[1])
    .filter(Boolean);
}

export async function buildProductionGraphReport(args = {}) {
  const metafile = args.metafile ?? (await createMetafile());
  const sourceMap = classifySources(metafile);
  const entrypointOwners = collectEntrypointOwners(metafile);
  const textFiles = await readTextFiles(['package.json', 'scripts', 'tests', 'public']);
  const deleteNowFamilies = args.deleteNowFamilies ?? readDeleteNowFamilies();

  const families = BUILD_GRAPH_FAMILIES.map((family) => {
    const buildMatches = collectFamilyMatches(family, sourceMap);
    const textOwners = collectTextOwners(textFiles, family);
    const classifications = Array.from(
      new Set(buildMatches.map((path) => sourceMap.get(path) ?? 'unused'))
    );
    const entrypoints = Array.from(
      new Set(buildMatches.flatMap((path) => entrypointOwners.get(path) ?? []))
    );
    return {
      family,
      inBuildGraph: buildMatches.length > 0,
      classification: classifications.length ? classifications.join(',') : 'unused',
      buildMatches,
      entrypoints,
      textOwners
    };
  });

  const failures = [];
  for (const family of families) {
    if (!deleteNowFamilies.includes(family.family)) {
      continue;
    }
    const stillOwned =
      family.inBuildGraph || family.textOwners.some((owner) => !owner.startsWith('docs/'));
    if (stillOwned) {
      failures.push(`delete-now family still has owners: ${family.family}`);
    }
  }

  return {
    sourceCount: sourceMap.size,
    families,
    failures
  };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input-metafile') {
      result.inputMetafile = args[index + 1];
      index += 1;
    } else if (arg === '--write-build-graph') {
      result.writeBuildGraph = args[index + 1];
      index += 1;
    }
  }
  return result;
}

function printReport(report) {
  console.log(`Production build graph sources=${report.sourceCount}`);
  for (const family of report.families) {
    console.log(
      [
        family.family,
        `inBuildGraph=${family.inBuildGraph}`,
        `classification=${family.classification}`,
        `buildMatches=${family.buildMatches.length}`,
        `textOwners=${family.textOwners.length}`
      ].join(' | ')
    );
    if (family.entrypoints.length) {
      console.log(`  entrypoints: ${family.entrypoints.join(', ')}`);
    }
    if (family.textOwners.length) {
      console.log(`  text owners: ${family.textOwners.join(', ')}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metafile = args.inputMetafile
    ? JSON.parse(readFileSync(args.inputMetafile, 'utf8'))
    : undefined;
  const report = await buildProductionGraphReport({ metafile });
  printReport(report);

  if (args.writeBuildGraph) {
    writeFileSync(args.writeBuildGraph, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (report.failures.length > 0) {
    console.error(report.failures.join('\n'));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
