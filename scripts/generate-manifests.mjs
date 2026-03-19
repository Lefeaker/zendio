import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserManifest, MANIFEST_BROWSERS } from './utils/manifestSources.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const OUTPUT_FILES = {
  chrome: 'manifest.json',
  firefox: 'manifest.firefox.json'
};

async function writeManifest(browser) {
  const fileName = OUTPUT_FILES[browser];
  if (!fileName) {
    throw new Error(`No output file configured for browser ${browser}`);
  }

  const filePath = path.join(PUBLIC_DIR, fileName);
  const manifest = createBrowserManifest(browser);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  for (const browser of MANIFEST_BROWSERS) {
    await writeManifest(browser);
  }
}

main().catch((error) => {
  console.error('[generate-manifests] Failed to generate browser manifests');
  console.error(error);
  process.exitCode = 1;
});
