import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported Node.js version format: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] > right[key]) {
      return 1;
    }
    if (left[key] < right[key]) {
      return -1;
    }
  }
  return 0;
}

function parseComparator(comparator) {
  const match = /^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2})$/.exec(comparator);
  if (!match) {
    throw new Error(`Unsupported package.json engines.node comparator: ${comparator}`);
  }

  const [, operator = '=', rawVersion] = match;
  const parts = rawVersion.split('.');
  const normalizedVersion =
    parts.length === 1 ? `${rawVersion}.0.0` : parts.length === 2 ? `${rawVersion}.0` : rawVersion;
  return {
    operator,
    version: parseVersion(normalizedVersion)
  };
}

function satisfiesComparator(version, comparator) {
  const comparison = compareVersions(version, comparator.version);
  switch (comparator.operator) {
    case '>=':
      return comparison >= 0;
    case '<=':
      return comparison <= 0;
    case '>':
      return comparison > 0;
    case '<':
      return comparison < 0;
    case '=':
      return comparison === 0;
    default:
      throw new Error(`Unsupported package.json engines.node operator: ${comparator.operator}`);
  }
}

export function isNodeVersionSupported(currentVersion, nodeRange) {
  const version = parseVersion(currentVersion);
  return nodeRange
    .split(/\s+/)
    .filter(Boolean)
    .map(parseComparator)
    .every((comparator) => satisfiesComparator(version, comparator));
}

export function assertNodeVersionSatisfiesRange(currentVersion, nodeRange) {
  if (!isNodeVersionSupported(currentVersion, nodeRange)) {
    throw new Error(
      `Unsupported Node.js runtime ${currentVersion}; expected package.json engines.node ${nodeRange}.`
    );
  }
}

export function readPackageNodeEngine(root = repoRoot) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const nodeRange = packageJson.engines?.node;
  if (typeof nodeRange !== 'string' || nodeRange.trim().length === 0) {
    throw new Error('package.json engines.node must be a non-empty string.');
  }
  return nodeRange;
}

export function runRuntimeVerification({ currentVersion = process.version, root = repoRoot } = {}) {
  const nodeRange = readPackageNodeEngine(root);
  assertNodeVersionSatisfiesRange(currentVersion, nodeRange);
  console.log(`Runtime engine check passed: Node ${currentVersion} satisfies ${nodeRange}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try {
    runRuntimeVerification();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
