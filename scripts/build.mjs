import { build, context } from 'esbuild';
import { mkdir, cp, readdir, rm, writeFile } from 'fs/promises';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { createBrowserManifest } from './utils/manifestSources.mjs';
import { cssTextPlugin } from './plugins/cssTextPlugin.mjs';
import { runQualityChecks } from './quality-check.mjs';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const prod = args.includes('--mode=prod') || args.includes('--prod');
const skipChecks = args.includes('--skip-checks');
const firefox = args.includes('--firefox');
const includeHarnesses = !prod || args.includes('--include-harnesses');

function resolveBooleanEnv(value) {
  return value === '1' || value === 'true';
}

// 运行质量检查（仅在生产模式且未跳过检查时）
if (prod && !skipChecks && !watch) {
  console.log('🔍 运行质量检查...');
  await runQualityChecks();
  console.log('');
}

await rm('build/dist', { recursive: true, force: true });
await mkdir('build/dist', { recursive: true });

const CONTENT_LOADER_SOURCE = `
(() => {
  const scope = globalThis;
  const runtime = scope.chrome?.runtime ?? scope.browser?.runtime;
  const resolve = (path) => {
    if (runtime?.getURL) {
      return runtime.getURL(path);
    }
    return new URL(path, scope.location?.href ?? 'http://localhost/').href;
  };
  const key = '__AIIINOB_CONTENT_RUNTIME_PROMISE__';
  if (!scope[key]) {
    scope[key] = import(resolve('content/runtime.js'));
  }
  Promise.resolve(scope[key]).catch((error) => {
    console.error('[content-loader] Failed to bootstrap content runtime:', error);
  });
})();
`.trimStart();

const sharedBuildOptions = {
  bundle: true,
  outdir: 'build/dist',
  platform: 'browser',
  sourcemap: watch || !prod,
  minify: prod && !watch,
  define: {
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
    __DEV__: prod ? 'false' : 'true',
    __AIIINOB_GA_MEASUREMENT_ID__: JSON.stringify(process.env.AIIINOB_GA_MEASUREMENT_ID ?? ''),
    __AIIINOB_GA_RELAY_ENDPOINT__: JSON.stringify(process.env.AIIINOB_GA_RELAY_ENDPOINT ?? ''),
    __AIIINOB_GA_TRANSPORT_MODE__: JSON.stringify(
      process.env.AIIINOB_GA_TRANSPORT_MODE ?? 'disabled'
    ),
    __AIIINOB_SENTRY_DSN__: JSON.stringify(process.env.AIIINOB_SENTRY_DSN ?? ''),
    __AIIINOB_SENTRY_ENVIRONMENT__: JSON.stringify(
      process.env.AIIINOB_SENTRY_ENVIRONMENT ?? (prod ? 'production' : 'development')
    ),
    __AIIINOB_SENTRY_RELEASE__: JSON.stringify(process.env.AIIINOB_SENTRY_RELEASE ?? '0.2.0'),
    __AIIINOB_SENTRY_ENABLED__: resolveBooleanEnv(process.env.AIIINOB_SENTRY_ENABLED)
      ? 'true'
      : 'false'
  },
  charset: 'utf8',
  loader: {
    '.css': 'text'
  },
  plugins: [cssTextPlugin()]
};

const backgroundBuildOptions = {
  ...sharedBuildOptions,
  entryPoints: {
    'background/index': 'src/background/index.ts'
  },
  format: 'iife'
};

const productionAppEntryPoints = {
  'content/runtime': 'src/content/index.ts',
  'local-vault-permission': 'src/content/runtime/localVaultPermissionFrame.ts',
  'offscreen/local-vault': 'src/offscreen/localVault.ts',
  'options/index': 'src/options/index.ts',
  'onboarding/index': 'src/onboarding/index.ts'
};

const harnessEntryPoints = {
  'interaction-contract-harness': 'src/dev/interactionContractHarness.ts',
  'content-orchestrator-harness': 'src/dev/contentOrchestratorHarness.ts',
  'runtime-observability-harness': 'src/dev/runtimeObservabilityHarness.ts',
  'local-vault-write-harness': 'src/dev/localVaultWriteHarness.ts'
};

const appBuildOptions = {
  ...sharedBuildOptions,
  entryPoints: includeHarnesses
    ? {
        ...productionAppEntryPoints,
        ...harnessEntryPoints
      }
    : productionAppEntryPoints,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]'
};

if (watch) {
  const backgroundCtx = await context(backgroundBuildOptions);
  const appCtx = await context(appBuildOptions);
  await Promise.all([backgroundCtx.watch(), appCtx.watch()]);
  console.log('👀 Watching for changes...');
} else {
  await build(backgroundBuildOptions);
  await build(appBuildOptions);
}

await mkdir('build/dist/content', { recursive: true });
await writeFile('build/dist/content/index.js', CONTENT_LOADER_SOURCE);

await cp('public', 'build/dist', { recursive: true });
if (prod) {
  await rm('build/dist/_locales/qps-ploc', { recursive: true, force: true });
  try {
    const chunkFiles = await readdir('build/dist/chunks');
    await Promise.all(
      chunkFiles
        .filter((file) => file.startsWith('qps-ploc-') && file.endsWith('.js'))
        .map((file) => rm(`build/dist/chunks/${file}`, { force: true }))
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

if (!includeHarnesses) {
  await Promise.all(
    [
      'interaction-contract-harness.html',
      'content-orchestrator-harness.html',
      'runtime-observability-harness.html',
      'local-vault-write-harness.html'
    ].map((file) => rm(`build/dist/${file}`, { force: true }))
  );
}

// Copy styles
await mkdir('build/dist/styles', { recursive: true });
await cp('src/styles/design-tokens.css', 'build/dist/styles/design-tokens.css');
try {
  await mkdir('build/dist/styles/clipper', { recursive: true });
  await cp(
    'src/styles/clipper/highlight-themes.css',
    'build/dist/styles/clipper/highlight-themes.css'
  );
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

// Copy options pages and assets
await mkdir('build/dist/options', { recursive: true });
await cp('src/options/index.html', 'build/dist/options/index.html');
await rm('build/dist/options/stitch', { recursive: true, force: true });
await mkdir('build/dist/options/stitch/styles', { recursive: true });
await cp('src/options/stitch/styles', 'build/dist/options/stitch/styles', { recursive: true });

// Copy onboarding pages and assets
await mkdir('build/dist/onboarding', { recursive: true });
await cp('src/onboarding/index.html', 'build/dist/onboarding/index.html');

// _locales is now included in public directory, so no need to copy separately

// Build manifest from the shared source-of-truth and browser-specific overrides
const manifest = createBrowserManifest(firefox ? 'firefox' : 'chrome');
const manifestWithHosts = applyRestHostPermissions(manifest);
await writeFile('build/dist/manifest.json', JSON.stringify(manifestWithHosts, null, 2));

const browserType = firefox ? ' (Firefox)' : ' (Chrome)';
console.log(`✅ Build done${prod ? ' (production mode)' : ''}${browserType}`);
