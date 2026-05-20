import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { createBrowserManifest } from './utils/manifestSources.mjs';

const REQUIRED_BUILD_FILES = [
  'local-vault-permission.html',
  'local-vault-permission.js',
  'offscreen/local-vault.html',
  'offscreen/local-vault.js',
  'manifest.json'
];

function parseArgs(argv) {
  const distFlagIndex = argv.indexOf('--dist');
  const browserFlagIndex = argv.indexOf('--browser');

  return {
    distDir: distFlagIndex >= 0 ? argv[distFlagIndex + 1] : 'build/dist',
    browser: browserFlagIndex >= 0 ? argv[browserFlagIndex + 1] : undefined
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertFileExists(path) {
  const stats = await stat(path);
  if (!stats.isFile()) {
    throw new Error(`${path} exists but is not a file`);
  }
}

function listWarMatches(manifest) {
  const resources = Array.isArray(manifest.web_accessible_resources)
    ? manifest.web_accessible_resources
    : [];
  return resources.flatMap((entry) => (Array.isArray(entry.matches) ? entry.matches : []));
}

function assertNoAllUrlsWar(manifest, label) {
  const matches = listWarMatches(manifest);
  if (matches.includes('<all_urls>')) {
    throw new Error(`${label} web_accessible_resources must not include <all_urls>`);
  }
}

async function listJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
    })
  );
  return files.flat();
}

async function findLazyPromptChunk(distDir) {
  const runtimePath = join(distDir, 'content/runtime.js');
  const runtimeSource = await readFile(runtimePath, 'utf8');
  const chunkFiles = await listJsFiles(join(distDir, 'chunks'));

  for (const chunkPath of chunkFiles) {
    const source = await readFile(chunkPath, 'utf8');
    if (!source.includes('local-vault-permission.html')) {
      continue;
    }

    const chunkName = relative(distDir, chunkPath);
    const basename = chunkName.split('/').pop();
    const reachable =
      runtimeSource.includes(chunkName) || (basename ? runtimeSource.includes(basename) : false);

    if (reachable) {
      return chunkName;
    }
  }

  if (runtimeSource.includes('local-vault-permission.html')) {
    return 'content/runtime.js';
  }

  throw new Error('Unable to find reachable content/runtime local-vault permission prompt chunk');
}

export async function auditLocalVaultReleaseReadiness(options = {}) {
  const distDir = options.distDir ?? 'build/dist';
  const expectedBrowser = options.browser;

  await Promise.all(REQUIRED_BUILD_FILES.map((file) => assertFileExists(join(distDir, file))));

  const builtManifest = await readJson(join(distDir, 'manifest.json'));
  if (expectedBrowser === 'chrome' && !builtManifest.permissions?.includes('offscreen')) {
    throw new Error('Expected Chrome build manifest to include offscreen permission');
  }
  if (expectedBrowser === 'firefox' && builtManifest.permissions?.includes('offscreen')) {
    throw new Error('Expected Firefox build manifest to omit offscreen permission');
  }
  assertNoAllUrlsWar(builtManifest, 'Built manifest');

  const chromeManifest = applyRestHostPermissions(createBrowserManifest('chrome'));
  const firefoxManifest = applyRestHostPermissions(createBrowserManifest('firefox'));

  if (!chromeManifest.permissions.includes('offscreen')) {
    throw new Error('Chrome source manifest must include offscreen permission');
  }
  if (firefoxManifest.permissions.includes('offscreen')) {
    throw new Error('Firefox source manifest must omit offscreen permission');
  }
  assertNoAllUrlsWar(chromeManifest, 'Chrome source manifest');
  assertNoAllUrlsWar(firefoxManifest, 'Firefox source manifest');

  const lazyPromptChunk = await findLazyPromptChunk(distDir);
  const inferredBrowser = builtManifest.permissions?.includes('offscreen') ? 'chrome' : 'firefox';

  return {
    distDir,
    expectedBrowser: expectedBrowser ?? null,
    builtBrowser: inferredBrowser,
    requiredFiles: REQUIRED_BUILD_FILES,
    chromeOffscreenPermission: chromeManifest.permissions.includes('offscreen'),
    firefoxOffscreenPermission: firefoxManifest.permissions.includes('offscreen'),
    builtWarMatches: listWarMatches(builtManifest),
    chromeWarMatches: listWarMatches(chromeManifest),
    firefoxWarMatches: listWarMatches(firefoxManifest),
    lazyPromptChunk
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await auditLocalVaultReleaseReadiness(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
