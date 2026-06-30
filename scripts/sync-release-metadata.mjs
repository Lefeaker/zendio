import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { createBrowserManifest, MANIFEST_BROWSERS } from './utils/manifestSources.mjs';
import {
  readPackageVersion,
  readPackageVersionLabel,
  REPO_ROOT
} from './utils/packageMetadata.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const MANIFEST_OUTPUT_FILES = {
  chrome: 'public/manifest.json',
  firefox: 'public/manifest.firefox.json'
};

function parseArgs(argv) {
  const options = {
    checkOnly: false,
    rootDir: DEFAULT_ROOT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.checkOnly = true;
      continue;
    }

    if (arg === '--root') {
      const rootDir = argv[index + 1];
      if (!rootDir || rootDir.startsWith('--')) {
        throw new Error('--root requires a directory path.');
      }
      options.rootDir = path.resolve(rootDir);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function formatJson(filePath, value) {
  const rawContent = `${JSON.stringify(value, null, 2)}\n`;
  const prettierOptions = await prettier.resolveConfig(filePath);
  return prettier.format(rawContent, {
    ...(prettierOptions ?? {}),
    filepath: filePath,
    parser: 'json'
  });
}

async function collectManifestArtifacts(rootDir) {
  const artifacts = [];

  for (const browser of MANIFEST_BROWSERS) {
    const relativePath = MANIFEST_OUTPUT_FILES[browser];
    if (!relativePath) {
      throw new Error(`No manifest output file configured for browser ${browser}.`);
    }

    const filePath = path.join(rootDir, relativePath);
    artifacts.push({
      path: relativePath,
      content: await formatJson(filePath, createBrowserManifest(browser, { rootDir }))
    });
  }

  return artifacts;
}

async function collectPackageLockArtifacts(rootDir, version) {
  const relativePath = 'package-lock.json';
  const filePath = path.join(rootDir, relativePath);
  if (!existsSync(filePath)) {
    return [];
  }

  const packageLock = await readJson(filePath);
  packageLock.version = version;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = version;
  }

  return [
    {
      path: relativePath,
      content: `${JSON.stringify(packageLock, null, 2)}\n`
    }
  ];
}

async function collectRuntimeCatalogArtifacts(rootDir, versionLabel) {
  const messagesDir = path.join(rootDir, 'src/i18n/catalog/messages');
  if (!existsSync(messagesDir)) {
    return [];
  }

  const artifacts = [];
  const locales = (await readdir(messagesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const locale of locales) {
    const relativePath = `src/i18n/catalog/messages/${locale}/runtime.json`;
    const filePath = path.join(rootDir, relativePath);
    if (!existsSync(filePath)) {
      continue;
    }

    const runtimeCatalog = await readJson(filePath);
    if (!Object.prototype.hasOwnProperty.call(runtimeCatalog, 'versionNumber')) {
      throw new Error(
        `${relativePath} must define versionNumber so release metadata stays synced.`
      );
    }

    runtimeCatalog.versionNumber = versionLabel;
    artifacts.push({
      path: relativePath,
      content: await formatJson(filePath, runtimeCatalog)
    });
  }

  return artifacts;
}

async function collectArtifacts(rootDir) {
  const version = readPackageVersion(rootDir);
  const versionLabel = readPackageVersionLabel(rootDir);

  return [
    ...(await collectPackageLockArtifacts(rootDir, version)),
    ...(await collectManifestArtifacts(rootDir)),
    ...(await collectRuntimeCatalogArtifacts(rootDir, versionLabel))
  ];
}

async function diffArtifacts(rootDir, artifacts) {
  const drift = [];

  for (const artifact of artifacts) {
    const filePath = path.join(rootDir, artifact.path);
    if (!existsSync(filePath)) {
      drift.push({ path: artifact.path, reason: 'missing' });
      continue;
    }

    const currentContent = await readFile(filePath, 'utf8');
    if (currentContent !== artifact.content) {
      drift.push({ path: artifact.path, reason: 'content-mismatch' });
    }
  }

  return drift;
}

async function writeArtifacts(rootDir, artifacts) {
  const changedPaths = [];

  for (const artifact of artifacts) {
    const filePath = path.join(rootDir, artifact.path);
    const currentContent = existsSync(filePath) ? await readFile(filePath, 'utf8') : null;
    if (currentContent === artifact.content) {
      continue;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, artifact.content, 'utf8');
    changedPaths.push(artifact.path);
  }

  return changedPaths;
}

export async function syncReleaseMetadata(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? REPO_ROOT);
  const artifacts = await collectArtifacts(rootDir);

  if (options.checkOnly) {
    return {
      changedPaths: [],
      drift: await diffArtifacts(rootDir, artifacts)
    };
  }

  return {
    changedPaths: await writeArtifacts(rootDir, artifacts),
    drift: []
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncReleaseMetadata(options);

  if (options.checkOnly) {
    if (result.drift.length > 0) {
      console.error('[release:metadata] Release metadata is out of sync:');
      for (const entry of result.drift) {
        console.error(`- ${entry.path}: ${entry.reason}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('[release:metadata] Release metadata is in sync.');
    return;
  }

  if (result.changedPaths.length === 0) {
    console.log('[release:metadata] Release metadata already in sync.');
    return;
  }

  console.log('[release:metadata] Updated release metadata:');
  for (const relativePath of result.changedPaths) {
    console.log(`- ${relativePath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[release:metadata] Failed to sync release metadata.');
    console.error(error);
    process.exitCode = 1;
  });
}
