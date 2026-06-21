import { build, context } from 'esbuild';
import { mkdir, cp, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
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
const distDir = getArgValue('--outdir') ?? process.env.BUILD_DIST_DIR ?? 'build/dist';

function getArgValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  if (index !== -1) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${name} requires a value`);
    }
    return value;
  }
  return undefined;
}

function resolveBooleanEnv(value) {
  return value === '1' || value === 'true';
}

function resolveEnvAlias(newName, oldName, fallback = '') {
  return process.env[newName] ?? process.env[oldName] ?? fallback;
}

function resolveSentryEnv(name, fallback = '') {
  return resolveEnvAlias(`ZENDIO_SENTRY_${name}`, `AIIINOB_SENTRY_${name}`, fallback);
}

function resolveGaEnv(name, fallback = '') {
  return resolveEnvAlias(`ZENDIO_GA_${name}`, `AIIINOB_GA_${name}`, fallback);
}

// 运行质量检查（仅在生产模式且未跳过检查时）
if (prod && !skipChecks && !watch) {
  console.log('🔍 运行质量检查...');
  await runQualityChecks();
  console.log('');
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

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
  outdir: distDir,
  platform: 'browser',
  sourcemap: watch || !prod,
  minify: prod && !watch,
  define: {
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
    __DEV__: prod ? 'false' : 'true',
    __ZENDIO_SENTRY_DSN__: JSON.stringify(resolveSentryEnv('DSN')),
    __ZENDIO_SENTRY_ENVIRONMENT__: JSON.stringify(
      resolveSentryEnv('ENVIRONMENT', prod ? 'production' : 'development')
    ),
    __ZENDIO_SENTRY_RELEASE__: JSON.stringify(resolveSentryEnv('RELEASE', '0.2.0')),
    __ZENDIO_SENTRY_ENABLED__: resolveBooleanEnv(resolveSentryEnv('ENABLED')) ? 'true' : 'false',
    __AIIINOB_SENTRY_DSN__: JSON.stringify(resolveSentryEnv('DSN')),
    __AIIINOB_SENTRY_ENVIRONMENT__: JSON.stringify(
      resolveSentryEnv('ENVIRONMENT', prod ? 'production' : 'development')
    ),
    __AIIINOB_SENTRY_RELEASE__: JSON.stringify(resolveSentryEnv('RELEASE', '0.2.0')),
    __AIIINOB_SENTRY_ENABLED__: resolveBooleanEnv(resolveSentryEnv('ENABLED')) ? 'true' : 'false',
    __ZENDIO_GA_MEASUREMENT_ID__: JSON.stringify(resolveGaEnv('MEASUREMENT_ID')),
    __ZENDIO_GA_TRANSPORT_MODE__: JSON.stringify(resolveGaEnv('TRANSPORT_MODE')),
    __ZENDIO_GA_PROXY_ENDPOINT__: JSON.stringify(resolveGaEnv('PROXY_ENDPOINT')),
    __AIIINOB_GA_MEASUREMENT_ID__: JSON.stringify(resolveGaEnv('MEASUREMENT_ID')),
    __AIIINOB_GA_TRANSPORT_MODE__: JSON.stringify(resolveGaEnv('TRANSPORT_MODE')),
    __AIIINOB_GA_PROXY_ENDPOINT__: JSON.stringify(resolveGaEnv('PROXY_ENDPOINT'))
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
  await Promise.all([build(backgroundBuildOptions), build(appBuildOptions)]);
}

await mkdir(join(distDir, 'content'), { recursive: true });
await writeFile(join(distDir, 'content/index.js'), CONTENT_LOADER_SOURCE);

await cp('public', distDir, { recursive: true });
if (prod) {
  await rm(join(distDir, '_locales/qps-ploc'), { recursive: true, force: true });
  try {
    const chunkFiles = await readdir(join(distDir, 'chunks'));
    await Promise.all(
      chunkFiles
        .filter((file) => file.startsWith('qps-ploc-') && file.endsWith('.js'))
        .map((file) => rm(join(distDir, 'chunks', file), { force: true }))
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
    ].map((file) => rm(join(distDir, file), { force: true }))
  );
}

// Copy styles
await mkdir(join(distDir, 'styles'), { recursive: true });
await cp('src/styles/design-tokens.css', join(distDir, 'styles/design-tokens.css'));
try {
  await mkdir(join(distDir, 'styles/clipper'), { recursive: true });
  await cp(
    'src/styles/clipper/highlight-themes.css',
    join(distDir, 'styles/clipper/highlight-themes.css')
  );
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

// Copy options pages and assets
await mkdir(join(distDir, 'options'), { recursive: true });
await cp('src/options/index.html', join(distDir, 'options/index.html'));
await rm(join(distDir, 'options/stitch'), { recursive: true, force: true });
await mkdir(join(distDir, 'options/stitch/styles'), { recursive: true });
await cp('src/options/stitch/styles', join(distDir, 'options/stitch/styles'), { recursive: true });

// Copy onboarding pages and assets
await mkdir(join(distDir, 'onboarding'), { recursive: true });
await cp('src/onboarding/index.html', join(distDir, 'onboarding/index.html'));

// _locales is now included in public directory, so no need to copy separately

// Build manifest from the shared source-of-truth and browser-specific overrides
const manifest = createBrowserManifest(firefox ? 'firefox' : 'chrome');
const manifestWithHosts = applyRestHostPermissions(manifest);
await writeFile(join(distDir, 'manifest.json'), JSON.stringify(manifestWithHosts, null, 2));

const browserType = firefox ? ' (Firefox)' : ' (Chrome)';
console.log(`✅ Build done${prod ? ' (production mode)' : ''}${browserType}: ${distDir}`);
