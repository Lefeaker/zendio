import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 1;
const UI_ROOT = 'src/ui';
const MANIFEST_PATH = 'tools/ui-production-ownership.json';
const PRODUCTION_GRAPH_TOOL = 'tools/report-production-build-graph.mjs';
const DISPOSITIONS = new Set([
  'production-runtime',
  'production-compile',
  'promote-u02c1',
  'retire-u02c2',
  'retire-u02c3',
  'deferred-state-convergence'
]);
const FUTURE_MILESTONES = new Map([
  ['promote-u02c1', 'U02C1'],
  ['retire-u02c2', 'U02C2'],
  ['retire-u02c3', 'U02C3'],
  ['deferred-state-convergence', 'U02C4']
]);
const FORBIDDEN_REASON_TERMS = [
  'future use',
  'directory convention',
  'unit test',
  'dev harness',
  'documentation',
  'old allowlist'
];

function fail(message) {
  throw new Error(message);
}

function isRegularFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function repoPath(root, path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) {
    fail('path must be a non-empty repository-relative string');
  }
  const normalized = normalize(path);
  if (normalized !== path || path.startsWith('/') || path.startsWith(`..${sep}`)) {
    fail(`invalid repository-relative path: ${JSON.stringify(path)}`);
  }
  const absolute = resolve(root, path);
  if (relative(root, absolute).startsWith(`..${sep}`)) {
    fail(`path escapes repository: ${JSON.stringify(path)}`);
  }
  return absolute;
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0 || result.error) {
    const detail =
      result.error?.message ||
      Buffer.from(result.stderr ?? '')
        .toString('utf8')
        .trim();
    fail(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return Buffer.from(result.stdout ?? '');
}

function splitNul(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter((value) => value.length > 0);
}

function trackedUiPaths(root) {
  return splitNul(runGit(root, ['ls-files', '-z', '--', UI_ROOT]))
    .filter((path) => path.endsWith('.ts'))
    .sort((left, right) => left.localeCompare(right));
}

function untrackedUiPaths(root) {
  return splitNul(runGit(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', UI_ROOT]))
    .filter((path) => path.endsWith('.ts'))
    .sort((left, right) => left.localeCompare(right));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function calculateUiDigests(root, paths = trackedUiPaths(root)) {
  const pathBytes = [];
  const contentBytes = [];
  for (const path of paths) {
    const absolute = repoPath(root, path);
    if (!isRegularFile(absolute)) {
      fail(`tracked UI source is missing on disk: ${path}`);
    }
    const contents = readFileSync(absolute);
    pathBytes.push(Buffer.from(`${path}\n`, 'utf8'));
    contentBytes.push(
      Buffer.from(path, 'utf8'),
      Buffer.from([0]),
      Buffer.from(sha256(contents), 'utf8'),
      Buffer.from('\n')
    );
  }
  return {
    uiPathSetSha256: sha256(Buffer.concat(pathBytes)),
    uiContentSha256: sha256(Buffer.concat(contentBytes))
  };
}

function isSortedUnique(values) {
  return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0);
}

function hasWildcard(value) {
  return /[*?\[\]{}]/.test(value);
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an invalid schema`);
  }
}

function validatePathIdentifier(root, value, label, { uiOnly = false } = {}) {
  if (typeof value !== 'string' || !value || hasWildcard(value) || value.endsWith('/')) {
    fail(`${label} must be an exact file path`);
  }
  if (uiOnly && (!value.startsWith(`${UI_ROOT}/`) || !value.endsWith('.ts'))) {
    fail(`${label} must be an exact ${UI_ROOT} TypeScript path`);
  }
  const absolute = repoPath(root, value);
  if (!existsSync(absolute)) {
    fail(`${label} is outside the current repository or missing: ${value}`);
  }
  return absolute;
}

function validateEvidence(root, evidence, path) {
  assertExactKeys(evidence, ['docs', 'tests', 'tools'], `evidence for ${path}`);
  for (const [kind, values] of Object.entries(evidence)) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((value) => typeof value === 'string')
    ) {
      fail(`evidence.${kind} for ${path} must be a non-empty string list`);
    }
    if (!isSortedUnique(values)) {
      fail(`evidence.${kind} for ${path} must be sorted and unique`);
    }
    for (const value of values) {
      validatePathIdentifier(root, value, `evidence.${kind} for ${path}`);
    }
  }
}

function validateManifestShape(root, manifest) {
  assertExactKeys(
    manifest,
    ['closureState', 'rows', 'schemaVersion', 'uiContentSha256', 'uiPathSetSha256'],
    'ownership manifest'
  );
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    fail(`unsupported schemaVersion: ${JSON.stringify(manifest.schemaVersion)}`);
  }
  if (manifest.closureState !== 'intermediate' && manifest.closureState !== 'final') {
    fail(`invalid closureState: ${JSON.stringify(manifest.closureState)}`);
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.uiPathSetSha256 ?? '')) {
    fail('uiPathSetSha256 must be a SHA-256 hex digest');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.uiContentSha256 ?? '')) {
    fail('uiContentSha256 must be a SHA-256 hex digest');
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0) {
    fail('ownership manifest rows must be a non-empty array');
  }

  for (const row of manifest.rows) {
    assertExactKeys(
      row,
      ['disposition', 'evidence', 'path', 'productionOwners', 'reason', 'replacement'],
      'ownership row'
    );
    validatePathIdentifier(root, row.path, 'row.path', { uiOnly: true });
    if (!DISPOSITIONS.has(row.disposition)) {
      fail(`invalid disposition for ${row.path}: ${JSON.stringify(row.disposition)}`);
    }
    if (
      !Array.isArray(row.productionOwners) ||
      !row.productionOwners.every((value) => typeof value === 'string')
    ) {
      fail(`productionOwners for ${row.path} must be a string list`);
    }
    if (!isSortedUnique(row.productionOwners)) {
      fail(`productionOwners for ${row.path} must be sorted and unique`);
    }
    for (const owner of row.productionOwners) {
      validatePathIdentifier(root, owner, `production owner for ${row.path}`);
    }
    assertExactKeys(row.replacement, ['milestone', 'owner'], `replacement for ${row.path}`);
    validatePathIdentifier(root, row.replacement.owner, `replacement owner for ${row.path}`);
    if (typeof row.replacement.milestone !== 'string' || !row.replacement.milestone) {
      fail(`replacement milestone for ${row.path} must be exact`);
    }
    validateEvidence(root, row.evidence, row.path);
    if (typeof row.reason !== 'string' || !row.reason.trim()) {
      fail(`reason for ${row.path} must be non-empty`);
    }
    const normalizedReason = row.reason.toLowerCase();
    if (FORBIDDEN_REASON_TERMS.some((term) => normalizedReason.includes(term))) {
      fail(`reason for ${row.path} uses a forbidden ownership rationale`);
    }
  }

  if (!isSortedUnique(manifest.rows.map((row) => row.path))) {
    fail('ownership rows must be lexicographically sorted with no duplicates');
  }
}

function resolveImportPath(root, importer, specifier) {
  let candidate;
  if (specifier.startsWith('@ui/')) {
    candidate = join(UI_ROOT, specifier.slice('@ui/'.length));
  } else if (specifier.startsWith('.')) {
    candidate = join(dirname(importer), specifier);
  } else {
    return null;
  }
  const normalized = normalize(candidate).split(sep).join('/');
  for (const path of [normalized, `${normalized}.ts`, join(normalized, 'index.ts')]) {
    const absolute = repoPath(root, path);
    if (isRegularFile(absolute)) {
      return path.split(sep).join('/');
    }
  }
  return null;
}

function sourceImportSpecifiers(source) {
  const matches = source.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])([^'"\n]+)\1/g);
  return Array.from(matches, (match) => match[2]);
}

function directProductionImporters(root, graph, target) {
  const reachable = new Set(Object.keys(graph.reachableSources ?? {}));
  const sourcePaths = splitNul(runGit(root, ['ls-files', '-z', '--', 'src']))
    .filter((path) => path.endsWith('.ts'))
    .sort((left, right) => left.localeCompare(right));
  return sourcePaths.filter((path) => {
    if (!reachable.has(path)) {
      return false;
    }
    const source = readFileSync(repoPath(root, path), 'utf8');
    return sourceImportSpecifiers(source).some(
      (specifier) => resolveImportPath(root, path, specifier) === target
    );
  });
}

function runProductionBuildGraph(root) {
  const tempDir = mkdtempSync(join(tmpdir(), 'zendio-ui-production-ownership-'));
  const graphPath = join(tempDir, 'production-build-graph.json');
  try {
    const result = spawnSync(
      process.execPath,
      [join(root, PRODUCTION_GRAPH_TOOL), '--write-json', graphPath],
      { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    if (result.status !== 0 || result.error) {
      const detail = result.error?.message || result.stderr.trim();
      fail(`fresh production build graph failed${detail ? `: ${detail}` : ''}`);
    }
    if (!isRegularFile(graphPath)) {
      fail('fresh production build graph did not produce a report');
    }
    return JSON.parse(readFileSync(graphPath, 'utf8'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function validateDisposition(row, graph, root) {
  const reachable = graph.reachableSources ?? {};
  const graphOwner = reachable[row.path];
  if (row.disposition === 'production-runtime') {
    if (!graphOwner || !Array.isArray(graphOwner.entrypointOwners)) {
      fail(`production-runtime row is absent from the production graph: ${row.path}`);
    }
    const expectedOwners = [...graphOwner.entrypointOwners].sort((left, right) =>
      left.localeCompare(right)
    );
    if (JSON.stringify(row.productionOwners) !== JSON.stringify(expectedOwners)) {
      fail(`production-runtime owners drifted for ${row.path}`);
    }
    if (row.replacement.owner !== row.path || row.replacement.milestone !== 'current-production') {
      fail(`production-runtime row must name itself as the current production owner: ${row.path}`);
    }
    return;
  }
  if (row.disposition === 'production-compile') {
    if (graphOwner) {
      fail(`production-compile row is runtime-reachable: ${row.path}`);
    }
    const importers = directProductionImporters(root, graph, row.path);
    if (
      importers.length === 0 ||
      JSON.stringify(row.productionOwners) !== JSON.stringify(importers)
    ) {
      fail(`production-compile import owners drifted for ${row.path}`);
    }
    if (row.replacement.owner !== row.path || row.replacement.milestone !== 'current-production') {
      fail(`production-compile row must name itself as the current production owner: ${row.path}`);
    }
    return;
  }
  if (graphOwner) {
    fail(`non-production row is reachable in the production graph: ${row.path}`);
  }
  if (row.productionOwners.length !== 0) {
    fail(`non-production row must not claim production owners: ${row.path}`);
  }
  if (row.replacement.milestone !== FUTURE_MILESTONES.get(row.disposition)) {
    fail(`replacement milestone drifted for ${row.path}`);
  }
}

function validateOwnership({ root, manifest, graph, requireFinal = false }) {
  validateManifestShape(root, manifest);
  const tracked = trackedUiPaths(root);
  const untracked = untrackedUiPaths(root);
  if (untracked.length > 0) {
    fail(`untracked UI TypeScript source is not allowed: ${untracked.join(', ')}`);
  }
  const manifestPaths = manifest.rows.map((row) => row.path);
  if (JSON.stringify(tracked) !== JSON.stringify(manifestPaths)) {
    fail('manifest rows do not exactly match the tracked UI TypeScript path set');
  }
  const digests = calculateUiDigests(root, tracked);
  if (manifest.uiPathSetSha256 !== digests.uiPathSetSha256) {
    fail('uiPathSetSha256 drifted from the tracked UI path set');
  }
  if (manifest.uiContentSha256 !== digests.uiContentSha256) {
    fail('uiContentSha256 drifted from tracked UI source content');
  }
  if (
    !graph ||
    typeof graph !== 'object' ||
    !graph.reachableSources ||
    !Array.isArray(graph.failures)
  ) {
    fail('fresh production graph has an invalid schema');
  }
  if (graph.failures.length > 0) {
    fail(`fresh production graph has failures: ${graph.failures.join('; ')}`);
  }
  for (const row of manifest.rows) {
    validateDisposition(row, graph, root);
  }
  if (requireFinal) {
    if (manifest.closureState !== 'final') {
      fail('--require-final requires closureState "final"');
    }
    if (
      manifest.rows.some(
        (row) =>
          row.disposition !== 'production-runtime' && row.disposition !== 'production-compile'
      )
    ) {
      fail('--require-final rejects deferred, promotion, and retirement rows');
    }
  }
  return {
    closureState: manifest.closureState,
    rows: manifest.rows.length,
    productionCompileRows: manifest.rows.filter((row) => row.disposition === 'production-compile')
      .length,
    productionRuntimeRows: manifest.rows.filter((row) => row.disposition === 'production-runtime')
      .length
  };
}

function parseArgs(args) {
  const options = { check: false, report: false, requireFinal: false };
  for (const arg of args) {
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--report') {
      options.report = true;
    } else if (arg === '--require-final') {
      options.requireFinal = true;
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (!options.check && !options.report) {
    options.report = true;
  }
  return options;
}

function formatReport(report) {
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: 'ok', ...report }, null, 2)}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(repoPath(root, MANIFEST_PATH), 'utf8'));
  const graph = runProductionBuildGraph(root);
  const report = validateOwnership({ root, manifest, graph, requireFinal: options.requireFinal });
  process.stdout.write(formatReport(report));
}

export {
  calculateUiDigests,
  directProductionImporters,
  formatReport,
  parseArgs,
  runProductionBuildGraph,
  trackedUiPaths,
  untrackedUiPaths,
  validateOwnership
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`ui-production-ownership: ${error.message}\n`);
    process.exitCode = 1;
  });
}
