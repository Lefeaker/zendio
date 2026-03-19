import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Language } from '../../../src/i18n/locales';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RendererModule = typeof import('./renderOptionsLanguageCard');

let cachedRendererPromise: Promise<RendererModule> | null = null;

async function loadRendererModule(): Promise<RendererModule> {
  if (cachedRendererPromise !== null) {
    return cachedRendererPromise;
  }

  cachedRendererPromise = (async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    process.env.AIINOB_PROJECT_ROOT = projectRoot;

    const bundle = await build({
      entryPoints: [path.join(__dirname, 'renderOptionsLanguageCard.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      write: false,
      sourcemap: false,
      external: ['node:fs', 'node:path', 'fs', 'path']
    });

    const output = bundle.outputFiles[0]?.text ?? '';
    const cacheDir = path.join(tmpdir(), 'aiinob-playwright-renderers');
    await fs.mkdir(cacheDir, { recursive: true });

    const hash = createHash('sha256').update(output).digest('hex').slice(0, 16);
    const bundlePath = path.join(cacheDir, `options-language-${hash}.mjs`);

    if (!fsSync.existsSync(bundlePath)) {
      await fs.writeFile(bundlePath, output, 'utf-8');
    }

    const fileUrl = pathToFileURL(bundlePath).href;
    return import(fileUrl) as Promise<RendererModule>;
  })();

  return cachedRendererPromise;
}

export async function renderOptionsLanguageCanvas(
  language: Language,
  viewportWidth: number
): Promise<string> {
  const renderer = await loadRendererModule();
  return renderer.renderOptionsLanguageCanvas(language, viewportWidth);
}
