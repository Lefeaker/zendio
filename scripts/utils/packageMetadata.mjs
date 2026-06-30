import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../..');

const EXTENSION_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function assertManifestCompatibleVersion(version, source = 'package.json') {
  if (typeof version !== 'string' || version.trim() !== version || version.length === 0) {
    throw new Error(`${source} version must be a non-empty trimmed string.`);
  }

  if (!EXTENSION_VERSION_PATTERN.test(version)) {
    throw new Error(
      `${source} version "${version}" is not compatible with browser extension manifests. ` +
        'Use two to four dot-separated integer segments, for example 0.2.1.'
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
