import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTENT_CSS_PACKS = Object.freeze({
  options: 'src/options/stitch/styles/entries/options.css',
  onboarding: 'src/options/stitch/styles/entries/onboarding.css',
  clipper: 'src/ui/stitch-runtime/styles/entries/clipper.css',
  reader: 'src/ui/stitch-runtime/styles/entries/reader.css',
  video: 'src/ui/stitch-runtime/styles/entries/video.css',
  'prompt-task': 'src/ui/stitch-runtime/styles/entries/prompt-task.css'
});

const OUTPUT_DIR = 'ui/stitch-runtime/styles';
const MAX_CONTENT_PACK_BYTES = 78_544;
const CONTENT_PACK_IDS = ['clipper', 'reader', 'video', 'prompt-task'];
const RETIRED_SOURCES = [
  'src/options/stitch/styles/runtime/theme-tokens.css',
  'src/options/stitch/styles/runtime/base.css',
  'src/options/stitch/styles/runtime/surface-windows.css',
  'src/options/stitch/styles/runtime/clipper-surfaces.css',
  'src/options/stitch/styles/runtime/surface-status.css',
  'src/options/stitch/styles/runtime/session-panel.css',
  'src/options/stitch/styles/runtime/session-items.css',
  'src/options/stitch/styles/runtime/runtime-list.css',
  'src/options/stitch/styles/runtime/task-success.css',
  'src/options/stitch/styles/runtime/toasts.css',
  'src/options/stitch/styles/stitch.css'
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validateContentCssPacks(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const distDir = resolve(root, options.distDir ?? 'build/dist');
  const failures = [];
  const packs = [];
  const expectedFiles = Object.keys(CONTENT_CSS_PACKS)
    .map((id) => `${id}.css`)
    .sort();

  for (const [id, source] of Object.entries(CONTENT_CSS_PACKS)) {
    if (!existsSync(join(root, source))) failures.push(`missing CSS entry: ${source}`);
    const relativePath = `${OUTPUT_DIR}/${id}.css`;
    const outputPath = join(distDir, relativePath);
    if (!existsSync(outputPath)) {
      failures.push(`missing CSS pack: ${relativePath}`);
      continue;
    }
    const bytes = readFileSync(outputPath);
    const text = bytes.toString('utf8');
    if (/^\s*@import\b/m.test(text)) failures.push(`CSS pack is not flattened: ${relativePath}`);
    if (CONTENT_PACK_IDS.includes(id) && bytes.length > MAX_CONTENT_PACK_BYTES) {
      failures.push(`CSS pack exceeds ${MAX_CONTENT_PACK_BYTES} bytes: ${relativePath}`);
    }
    packs.push({ id, path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }

  const outputRoot = join(distDir, OUTPUT_DIR);
  if (existsSync(outputRoot)) {
    const actualFiles = readdirSync(outputRoot)
      .filter((file) => file.endsWith('.css'))
      .sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      failures.push(`unexpected CSS pack set: ${actualFiles.join(',')}`);
    }
  }

  for (const manifestPath of ['public/manifest.json', 'public/manifest.firefox.json']) {
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
    const resources =
      manifest.web_accessible_resources?.flatMap((row) => row.resources ?? []) ?? [];
    if (!resources.includes(`${OUTPUT_DIR}/*.css`))
      failures.push(`${manifestPath} misses CSS packs`);
    if (resources.includes('options/stitch/styles/*'))
      failures.push(`${manifestPath} exposes retired CSS`);
  }

  const consumers = JSON.parse(
    readFileSync(join(root, 'tools/content-css-selector-consumers.json'), 'utf8')
  );
  if (consumers.schemaVersion !== 'zendio-content-css-consumers-v1') {
    failures.push('selector consumer manifest schema mismatch');
  }
  if (JSON.stringify(consumers.entries) !== JSON.stringify(Object.keys(CONTENT_CSS_PACKS))) {
    failures.push('selector consumer manifest entry closure mismatch');
  }
  if (!Array.isArray(consumers.sourceInputs) || consumers.sourceInputs.length !== 18) {
    failures.push('selector consumer manifest must contain 18 source inputs');
  } else if (consumers.sourceInputs.some((row) => !/^[a-f0-9]{64}$/.test(row.preimageSha256))) {
    failures.push('selector consumer manifest contains an invalid source hash');
  }

  for (const retired of RETIRED_SOURCES) {
    if (existsSync(join(root, retired))) failures.push(`retired CSS source remains: ${retired}`);
  }

  return { failures, packs };
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  const report = validateContentCssPacks();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) process.exitCode = 1;
}
