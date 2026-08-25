import { createHash } from 'node:crypto';
import { lstat, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  consumeVerifiedChromeArtifactBinding,
  verifyChromeReleaseArtifactManifest
} from './utils/releaseArtifactManifest.mjs';

export const CHROME_WEBSTORE_LIMITS = Object.freeze({
  tokenMs: 30_000,
  uploadMs: 180_000,
  statusMs: 30_000,
  publishMs: 60_000,
  stateMs: 5_000,
  terminalDrainMs: 1_000,
  statusIntervalMs: 5_000,
  statusAttempts: 12,
  statusTotalMs: 60_000,
  tokenBytes: 64 * 1024,
  responseBytes: 256 * 1024,
  cumulativeBytes: 1024 * 1024,
  stateBytes: 16 * 1024
});

export const CHROME_DEFAULT_PUBLIC_PUBLISH_REQUEST = Object.freeze({
  blockOnWarnings: true,
  deployInfos: Object.freeze([Object.freeze({ deployPercentage: 100 })]),
  publishType: 'DEFAULT_PUBLISH',
  skipReview: false
});

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function readChromeWebStoreConfig(environment = process.env) {
  const keys = [
    'CWS_CLIENT_ID',
    'CWS_CLIENT_SECRET',
    'CWS_REFRESH_TOKEN',
    'CWS_EXTENSION_ID',
    'CWS_PUBLISHER_ID'
  ];
  const values = Object.fromEntries(keys.map((key) => [key, environment[key]]));
  if (keys.some((key) => typeof values[key] !== 'string' || values[key].length === 0)) {
    fail('CHROME_WEBSTORE_CREDENTIALS_MISSING');
  }
  return Object.freeze({
    clientId: values.CWS_CLIENT_ID,
    clientSecret: values.CWS_CLIENT_SECRET,
    refreshToken: values.CWS_REFRESH_TOKEN,
    itemId: values.CWS_EXTENSION_ID,
    publisherId: values.CWS_PUBLISHER_ID
  });
}

export function createChromeWebStoreUrls(config) {
  const publisher = encodeURIComponent(config.publisherId);
  const item = encodeURIComponent(config.itemId);
  const name = `publishers/${config.publisherId}/items/${config.itemId}`;
  return Object.freeze({
    name,
    upload: `https://chromewebstore.googleapis.com/upload/v2/publishers/${publisher}/items/${item}:upload`,
    status: `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${item}:fetchStatus`,
    publish: `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${item}:publish`
  });
}

async function readState(path) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size > CHROME_WEBSTORE_LIMITS.stateBytes
  ) {
    fail('CHROME_STATE_INVALID');
  }
  const bytes = await readFile(path);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('CHROME_STATE_INVALID');
  }
  if (value?.schema !== 'zendio-release-store-state-v1' || value.browser !== 'chrome') {
    fail('CHROME_STATE_INVALID');
  }
  return value;
}

async function writeState(path, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > CHROME_WEBSTORE_LIMITS.stateBytes) fail('CHROME_STATE_LIMIT');
  const next = `${path}.next`;
  const handle = await open(next, 'wx', 0o600);
  try {
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(next, path);
  const directory = await open(dirname(path), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function terminalState(base, outcome, code, extras = {}) {
  const mutationInvoked = outcome !== 'pre-mutation-failure';
  return {
    ...base,
    ...extras,
    errorCode: outcome === 'success' ? null : code,
    recovery:
      outcome === 'success' ? 'none' : outcome === 'pre-mutation-failure' ? 'retry' : 'reconcile',
    outcome,
    mutationInvoked,
    retrySafe: !mutationInvoked
  };
}

async function boundedResponse(fetchPromise, timeoutMs, maximumBytes, context, controller) {
  let timer;
  try {
    const response = await Promise.race([
      fetchPromise,
      new Promise((_, reject) => {
        timer = context.setTimeoutOperation(() => {
          context.fenced = true;
          controller.abort();
          reject(new Error('CHROME_REQUEST_TIMEOUT'));
        }, timeoutMs);
      })
    ]);
    if (context.fenced) fail('CHROME_REQUEST_FENCED');
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > maximumBytes) fail('CHROME_RESPONSE_LIMIT');
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    context.cumulativeBytes += bytes;
    if (bytes > maximumBytes || context.cumulativeBytes > CHROME_WEBSTORE_LIMITS.cumulativeBytes) {
      fail('CHROME_RESPONSE_LIMIT');
    }
    let value = {};
    if (text !== '') {
      try {
        value = JSON.parse(text);
      } catch {
        fail('CHROME_RESPONSE_JSON');
      }
    }
    if (!response.ok) fail('CHROME_RESPONSE_HTTP', String(response.status));
    return value;
  } finally {
    if (timer !== undefined) context.clearTimeoutOperation(timer);
  }
}

async function requestJson(url, init, timeoutMs, maximumBytes, context) {
  if (context.fenced) fail('CHROME_REQUEST_FENCED');
  const controller = new AbortController();
  try {
    return await boundedResponse(
      context.fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal }),
      timeoutMs,
      maximumBytes,
      context,
      controller
    );
  } catch (error) {
    context.fenced = true;
    throw error;
  }
}

async function token(config, context) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
    scope: CWS_SCOPE
  });
  const value = await requestJson(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    },
    CHROME_WEBSTORE_LIMITS.tokenMs,
    CHROME_WEBSTORE_LIMITS.tokenBytes,
    context
  );
  if (typeof value.access_token !== 'string' || value.access_token.length === 0) {
    fail('CHROME_TOKEN_INVALID');
  }
  return value.access_token;
}

function validateUpload(value, config, urls, version) {
  if (
    value?.name !== urls.name ||
    value.itemId !== config.itemId ||
    !['SUCCEEDED', 'IN_PROGRESS', 'FAILED', 'NOT_FOUND'].includes(value.uploadState)
  ) {
    fail('CHROME_UPLOAD_RESPONSE_INVALID');
  }
  if (value.uploadState === 'SUCCEEDED' && value.crxVersion !== version) {
    fail('CHROME_UPLOAD_VERSION_MISMATCH');
  }
  return value.uploadState;
}

function validatePublish(value, config, urls) {
  if (
    value?.name !== urls.name ||
    value.itemId !== config.itemId ||
    !['PENDING_REVIEW', 'PUBLISHED'].includes(value.state) ||
    (Array.isArray(value.warnings) && value.warnings.length > 0)
  ) {
    fail('CHROME_PUBLISH_RESPONSE_INVALID');
  }
  return value.state;
}

export async function publishVerifiedChromeWebStore(options, dependencies = {}) {
  const consumed = consumeVerifiedChromeArtifactBinding(options.binding, 'github-artifact-v1');
  if (resolve(options.stateFile) === resolve(consumed.zipPath)) fail('CHROME_STATE_PATH_ALIAS');
  const state = await readState(options.stateFile);
  if (
    state.manifestPath !== options.binding.manifestPath ||
    state.releaseSha !== options.binding.releaseSha ||
    state.releaseTree !== options.binding.releaseTree ||
    state.outcome !== 'not-started'
  ) {
    fail('CHROME_STATE_BINDING_INVALID');
  }
  const config = readChromeWebStoreConfig(options.environment ?? process.env);
  const urls = createChromeWebStoreUrls(config);
  const identityState = {
    ...state,
    itemId: config.itemId,
    publisherIdFingerprint: sha256(config.publisherId),
    packageVersion: options.binding.packageVersion,
    archiveSha256: consumed.zipSha256,
    terminalResult: null
  };
  const context = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    setTimeoutOperation: dependencies.setTimeoutOperation ?? setTimeout,
    clearTimeoutOperation: dependencies.clearTimeoutOperation ?? clearTimeout,
    cumulativeBytes: 0,
    fenced: false
  };
  let accessToken;
  try {
    accessToken = await token(config, context);
  } catch (error) {
    await writeState(
      options.stateFile,
      terminalState(identityState, 'pre-mutation-failure', 'CHROME_TOKEN_FAILURE')
    );
    throw error;
  }
  let current = {
    ...identityState,
    stage: 'upload-started',
    lastStartedOperation: 'upload',
    errorCode: 'CHROME_UPLOAD_INDETERMINATE',
    recovery: 'reconcile',
    outcome: 'unknown-submission-state',
    mutationInvoked: true,
    retrySafe: false
  };
  await writeState(options.stateFile, current);
  context.fenced = false;
  let upload;
  try {
    upload = await requestJson(
      urls.upload,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/zip'
        },
        body: consumed.zipBytes
      },
      CHROME_WEBSTORE_LIMITS.uploadMs,
      CHROME_WEBSTORE_LIMITS.responseBytes,
      context
    );
    const uploadState = validateUpload(upload, config, urls, options.binding.packageVersion);
    if (uploadState !== 'SUCCEEDED') {
      await writeState(options.stateFile, current);
      fail('CHROME_UPLOAD_UNKNOWN_STATE');
    }
  } catch (error) {
    await writeState(options.stateFile, current);
    throw Object.assign(new Error(`unknown-submission-state:${error.message}`), {
      code: 'unknown-submission-state',
      retrySafe: false
    });
  }
  current = {
    ...current,
    stage: 'publish-started',
    lastCompletedOperation: 'upload',
    lastStartedOperation: 'publish',
    errorCode: 'CHROME_PUBLISH_INDETERMINATE'
  };
  await writeState(options.stateFile, current);
  context.fenced = false;
  try {
    const publish = await requestJson(
      urls.publish,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: canonicalJson(CHROME_DEFAULT_PUBLIC_PUBLISH_REQUEST)
      },
      CHROME_WEBSTORE_LIMITS.publishMs,
      CHROME_WEBSTORE_LIMITS.responseBytes,
      context
    );
    const terminalResult = validatePublish(publish, config, urls);
    const success = terminalState(current, 'success', null, {
      stage: 'publish-completed',
      lastCompletedOperation: 'publish',
      terminalResult
    });
    await writeState(options.stateFile, success);
    return Object.freeze({ upload, publish, terminalResult });
  } catch (error) {
    await writeState(options.stateFile, current);
    throw Object.assign(new Error(`unknown-submission-state:${error.message}`), {
      code: 'unknown-submission-state',
      retrySafe: false
    });
  }
}

export async function dryRunVerifiedChromeRelease(options) {
  const consumed = consumeVerifiedChromeArtifactBinding(options.binding, 'local-private-v1');
  await readState(options.stateFile);
  return Object.freeze({
    mode: 'dry-run',
    releaseSha: options.binding.releaseSha,
    packageVersion: options.binding.packageVersion,
    zipSha256: consumed.zipSha256
  });
}

export function resolveReleaseOptionsFromArgs(argv) {
  if (
    argv.length === 9 &&
    argv[0] === '--dry-run' &&
    argv[1] === '--zip' &&
    argv[3] === '--artifact-manifest' &&
    argv[5] === '--state-file' &&
    argv[7] === '--transport-mode' &&
    argv[8] === 'local-private-v1'
  ) {
    return {
      mode: 'dry-run',
      zipPath: resolve(argv[2]),
      manifestPath: resolve(argv[4]),
      stateFile: resolve(argv[6]),
      transportMode: 'local-private-v1'
    };
  }
  if (
    argv.length === 7 &&
    argv[0] === '--publish' &&
    argv[1] === '--artifact-manifest' &&
    argv[3] === '--state-file' &&
    argv[5] === '--transport-mode' &&
    argv[6] === 'github-artifact-v1'
  ) {
    return {
      mode: 'publish',
      manifestPath: resolve(argv[2]),
      stateFile: resolve(argv[4]),
      transportMode: 'github-artifact-v1'
    };
  }
  fail('CHROME_RELEASE_ARGUMENTS_INVALID');
}

export async function runChromeWebStoreCli(
  argv = process.argv.slice(2),
  environment = process.env
) {
  const args = resolveReleaseOptionsFromArgs(argv);
  const binding = await verifyChromeReleaseArtifactManifest({
    manifestPath: args.manifestPath,
    transportMode: args.transportMode
  });
  if (args.mode === 'dry-run') {
    if (args.zipPath !== binding.zipPath) fail('CHROME_RELEASE_ZIP_MISMATCH');
    return dryRunVerifiedChromeRelease({ binding, stateFile: args.stateFile });
  }
  return publishVerifiedChromeWebStore({ binding, stateFile: args.stateFile, environment });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runChromeWebStoreCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
