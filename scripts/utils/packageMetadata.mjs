import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../..');

const VERSION_SEGMENT_PATTERN = /^(0|[1-9]\d*)$/;
const MIN_VERSION_SEGMENTS = 1;
const MAX_VERSION_SEGMENTS = 4;
const MAX_VERSION_SEGMENT_VALUE = 65535;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function assertManifestCompatibleVersion(version, source = 'package.json') {
  if (typeof version !== 'string' || version.trim() !== version || version.length === 0) {
    throw new Error(`${source} version must be a non-empty trimmed string.`);
  }

  const segments = version.split('.');
  const hasValidSegmentCount =
    segments.length >= MIN_VERSION_SEGMENTS && segments.length <= MAX_VERSION_SEGMENTS;
  const hasValidSegments = segments.every((segment) => {
    if (!VERSION_SEGMENT_PATTERN.test(segment)) {
      return false;
    }

    return Number(segment) <= MAX_VERSION_SEGMENT_VALUE;
  });
  const hasNonZeroSegment = segments.some((segment) => Number(segment) > 0);

  if (!hasValidSegmentCount || !hasValidSegments || !hasNonZeroSegment) {
    throw new Error(
        `${source} version "${version}" is not compatible with browser extension manifests. ` +
        'Use one to four dot-separated integer segments in the range 0..65535, for example 0.2.1.'
    );
  }

  return version;
}

export function readPackageMetadata(rootDir = REPO_ROOT) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageJson = readJson(packagePath);
  return {
    packageJson,
    packagePath
  };
}

export function readPackageVersion(rootDir = REPO_ROOT) {
  const { packageJson, packagePath } = readPackageMetadata(rootDir);
  return assertManifestCompatibleVersion(packageJson.version, path.relative(rootDir, packagePath));
}

export function readPackageVersionLabel(rootDir = REPO_ROOT) {
  return `v${readPackageVersion(rootDir)}`;
}
