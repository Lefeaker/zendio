import { build, context } from 'esbuild';
import { mkdir, cp, readFile, writeFile } from 'fs/promises';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const prod = args.includes('--mode=prod') || args.includes('--prod');

await mkdir('dist', { recursive: true });

const buildOptions = {
  entryPoints: [
    'src/background/index.ts',
    'src/content/index.ts',
    'src/options/index.ts'
  ],
  bundle: true,
  outdir: 'dist',
  platform: 'browser',
  format: 'iife',
  sourcemap: watch || !prod,
  minify: prod && !watch
};

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('👀 Watching for changes...');
} else {
  await build(buildOptions);
}

await cp('assets', 'dist/assets', { recursive: true });

// Copy styles
await mkdir('dist/styles', { recursive: true });
await cp('src/styles/design-tokens.css', 'dist/styles/design-tokens.css');
await cp('src/styles/components.css', 'dist/styles/components.css');

// Copy options pages and assets
await mkdir('dist/options', { recursive: true });
await cp('src/options/index.html', 'dist/options/index.html');

try {
  await cp('_locales', 'dist/_locales', { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

const manifest = JSON.parse(await readFile('src/manifest.json', 'utf8'));
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));

console.log(`✅ Build done${prod ? ' (production mode)' : ''}`);
