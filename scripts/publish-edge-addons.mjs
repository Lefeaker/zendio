import { createHash } from 'node:crypto';
import { lstat, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalCompactJson } from '../tools/npm-audit-regression/canonical-json.mjs';
import { inventoryBoundedZip, readBoundedZipText } from './utils/boundedZipArchive.mjs';
import {
  consumeVerifiedChromeArtifactBinding,
  verifyChromeReleaseArtifactManifest
} from './utils/releaseArtifactManifest.mjs';

const API = 'https://api.addons.microsoftedge.microsoft.com';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export const EDGE_LIMITS = Object.freeze({
  responseBytes: 256 * 1024,
  uploadMs: 180_000,
  publishMs: 60_000,
  requestMs: 30_000,
  pollMs: 120_000,
  pollAttempts: 24,
  intervalMs: 5_000
});

class EdgeReleaseError extends Error {}

function fail(code) {
  throw new EdgeReleaseError(code);
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function readEdgeConfig(environment = process.env) {
  const {
    EDGE_CLIENT_ID: clientId,
    EDGE_API_KEY: apiKey,
    EDGE_PRODUCT_ID: productId
  } = environment;
  if (
    ![clientId, apiKey, productId].every(
      (value) =>
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 4096 &&
        !/[\s\x00-\x1f\x7f]/u.test(value)
    ) ||
    !GUID.test(productId)
  )
    fail('EDGE_CONFIG_INVALID');
  return { clientId, apiKey, productId };
}

export function edgeOperationId(location, endpoint) {
  if (typeof location !== 'string' || location.length > 1024)
    fail('EDGE_OPERATION_LOCATION_INVALID');
  if (GUID.test(location.toLowerCase())) return location.toLowerCase();
  const prefix = `${endpoint}/operations/`;
  if (!location.startsWith(prefix) || !GUID.test(location.slice(prefix.length).toLowerCase()))
    fail('EDGE_OPERATION_LOCATION_INVALID');
  return location.slice(prefix.length).toLowerCase();
}

async function writeState(path, state) {
  const handle = await open(`${path}.next`, 'wx', 0o600);
  try {
    await handle.writeFile(`${canonicalCompactJson(state)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(`${path}.next`, path);
  const directory = await open(dirname(path), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function validateEdgeArchive(binding) {
  const inventory = await inventoryBoundedZip(binding.zipPath);
  const entry = inventory.entries.find((value) => value.path === 'manifest.json');
  if (!entry) fail('EDGE_MANIFEST_MISSING');
  const manifest = JSON.parse(await readBoundedZipText(entry));
  if (
    manifest.version !== binding.packageVersion ||
    manifest.manifest_version !== 3 ||
    !manifest.background?.service_worker ||
    manifest.background?.scripts ||
    manifest.browser_specific_settings ||
    'update_url' in manifest
  )
    fail('EDGE_MANIFEST_INVALID');
  const locales = inventory.entries.filter((value) =>
    /^_locales\/[^/]+\/messages\.json$/u.test(value.path)
  );
  if (!locales.length) fail('EDGE_LOCALES_MISSING');
  for (const locale of locales) {
    const messages = JSON.parse(await readBoundedZipText(locale));
    for (const field of ['name', 'description']) {
      const raw = manifest[field];
      const match = typeof raw === 'string' && /^__MSG_(.+)__$/u.exec(raw);
      const text = match ? messages[match[1]]?.message : raw;
      if (typeof text !== 'string' || !text.trim() || /\bchrome\b/iu.test(text))
        fail('EDGE_BRANDING_INVALID');
    }
  }
}

// No POST retries. In particular, never retry with a different notes encoding.
async function request(url, init, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const operation = async () => {
    const response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal
    });
    if (response.status !== (init.method === 'POST' ? 202 : 200))
      fail(`EDGE_HTTP_${response.status}`);
    if (Number(response.headers.get('content-length')) > EDGE_LIMITS.responseBytes)
      fail('EDGE_RESPONSE_LIMIT');
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > EDGE_LIMITS.responseBytes) fail('EDGE_RESPONSE_LIMIT');
        chunks.push(Buffer.from(value));
      }
    } finally {
      if (controller.signal.aborted || size > EDGE_LIMITS.responseBytes)
        void reader?.cancel().catch(() => {});
    }
    return {
      location: response.headers.get('location'),
      body: Buffer.concat(chunks).toString('utf8')
    };
  };
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new EdgeReleaseError('EDGE_REQUEST_TIMEOUT'));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    controller.abort();
    if (error instanceof EdgeReleaseError) throw error;
    fail('EDGE_REQUEST_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

async function poll(endpoint, id, headers, dependencies) {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + EDGE_LIMITS.pollMs;
  for (let attempt = 0; attempt < EDGE_LIMITS.pollAttempts; attempt += 1) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const response = await request(
      `${endpoint}/operations/${id}`,
      { method: 'GET', headers },
      Math.min(remaining, EDGE_LIMITS.requestMs),
      dependencies.fetchImpl ?? fetch
    );
    let value;
    try {
      value = JSON.parse(response.body);
    } catch {
      fail('EDGE_STATUS_JSON_INVALID');
    }
    if (
      value?.id?.toLowerCase() !== id ||
      !['InProgress', 'Succeeded', 'Failed'].includes(value.status)
    )
      fail('EDGE_STATUS_INVALID');
    if (value.status === 'Failed') fail('EDGE_OPERATION_FAILED');
    if (value.status === 'Succeeded') {
      if (value.errorCode || (Array.isArray(value.errors) && value.errors.length))
        fail('EDGE_STATUS_INVALID');
      return;
    }
    if (attempt + 1 < EDGE_LIMITS.pollAttempts)
      await (dependencies.sleep ?? delay)(
        Math.min(EDGE_LIMITS.intervalMs, Math.max(0, deadline - now()))
      );
  }
  fail('EDGE_POLL_TIMEOUT');
}

export function edgeCertificationNotes(version) {
  return `Zendio ${version} is an update to the existing local-first Obsidian clipping extension. Core clipping requires no publisher-provided account. In Edge Options, add/select a Vault and bind a local folder; REST credentials are optional. Open a public article, select text, save via the Zendio context menu and inspect the Markdown file in that folder. Reader mode collects highlights; YouTube/Bilibili video mode supports timestamped notes and optional screenshots. Optional Obsidian Local REST API requires the user's local Obsidian plugin; optional AI services/sites may require the tester's own account. See Options > Changelog for this version's changes. Optional telemetry is off by default. Privacy policy: https://zendio.sxnian.com/privacy/`;
}

export async function publishVerifiedEdgeRelease(options, dependencies = {}) {
  const stat = await lstat(options.stateFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size > 16 * 1024
  )
    fail('EDGE_STATE_INVALID');
  let state = JSON.parse(await readFile(options.stateFile, 'utf8'));
  if (
    state.schema !== 'zendio-release-store-state-v1' ||
    state.browser !== 'edge' ||
    state.outcome !== 'not-started' ||
    state.manifestPath !== options.binding.manifestPath ||
    state.releaseSha !== options.binding.releaseSha ||
    state.releaseTree !== options.binding.releaseTree
  )
    fail('EDGE_STATE_BINDING_INVALID');
  let config;
  let consumed;
  try {
    config = readEdgeConfig(options.environment ?? process.env);
    await validateEdgeArchive(options.binding);
    consumed = consumeVerifiedChromeArtifactBinding(options.binding, 'github-artifact-v1');
  } catch {
    await writeState(options.stateFile, {
      ...state,
      outcome: 'pre-mutation-failure',
      errorCode: 'EDGE_PREFLIGHT_FAILED',
      recovery: 'retry'
    });
    fail('EDGE_PREFLIGHT_FAILED');
  }
  const base = `${API}/v1/products/${config.productId}/submissions`;
  const headers = { Authorization: `ApiKey ${config.apiKey}`, 'X-ClientID': config.clientId };
  state = {
    ...state,
    itemId: config.productId,
    publisherIdFingerprint: sha256(config.clientId),
    packageVersion: options.binding.packageVersion,
    archiveSha256: consumed.zipSha256,
    stage: 'upload-started',
    lastStartedOperation: 'upload',
    outcome: 'unknown-submission-state',
    errorCode: 'EDGE_UPLOAD_INDETERMINATE',
    recovery: 'reconcile',
    mutationInvoked: true,
    retrySafe: false
  };
  await writeState(options.stateFile, state);
  try {
    const uploadEndpoint = `${base}/draft/package`;
    const uploaded = await request(
      uploadEndpoint,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/zip' },
        body: consumed.zipBytes
      },
      EDGE_LIMITS.uploadMs,
      dependencies.fetchImpl ?? fetch
    );
    state = { ...state, uploadOperationId: edgeOperationId(uploaded.location, uploadEndpoint) };
    await writeState(options.stateFile, state);
    await poll(uploadEndpoint, state.uploadOperationId, headers, dependencies);
    state = {
      ...state,
      stage: 'publish-started',
      lastStartedOperation: 'publish',
      lastCompletedOperation: 'upload',
      errorCode: 'EDGE_PUBLISH_INDETERMINATE'
    };
    await writeState(options.stateFile, state);
    // Matches the complete Microsoft PowerShell example: one form field named notes.
    const published = await request(
      base,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          notes: edgeCertificationNotes(options.binding.packageVersion)
        }).toString()
      },
      EDGE_LIMITS.publishMs,
      dependencies.fetchImpl ?? fetch
    );
    state = { ...state, publishOperationId: edgeOperationId(published.location, base) };
    await writeState(options.stateFile, state);
    await poll(base, state.publishOperationId, headers, dependencies);
    state = {
      ...state,
      stage: 'publish-completed',
      lastCompletedOperation: 'publish',
      outcome: 'success',
      errorCode: null,
      recovery: 'none',
      terminalResult: 'PENDING_REVIEW'
    };
    await writeState(options.stateFile, state);
    return {
      terminalResult: 'PENDING_REVIEW',
      uploadOperationId: state.uploadOperationId,
      publishOperationId: state.publishOperationId
    };
  } catch (error) {
    // Keep operation identifiers for reconciliation; do not echo remote bodies or credentials.
    await writeState(options.stateFile, {
      ...state,
      ...(state.outcome === 'success'
        ? { stage: 'publish-started', lastCompletedOperation: 'upload' }
        : {}),
      outcome: 'unknown-submission-state',
      terminalResult: null,
      recovery: 'reconcile',
      errorCode: error instanceof EdgeReleaseError ? error.message : 'EDGE_SUBMISSION_INDETERMINATE'
    });
    throw Object.assign(new Error('unknown-submission-state:EDGE_RECONCILE_REQUIRED'), {
      retrySafe: false
    });
  }
}

export async function runEdgeAddonsCli(argv = process.argv.slice(2), environment = process.env) {
  if (
    argv.length !== 7 ||
    argv[0] !== '--publish' ||
    argv[1] !== '--artifact-manifest' ||
    argv[3] !== '--state-file' ||
    argv[5] !== '--transport-mode' ||
    argv[6] !== 'github-artifact-v1'
  )
    fail('EDGE_ARGUMENTS_INVALID');
  const binding = await verifyChromeReleaseArtifactManifest({
    manifestPath: argv[2],
    transportMode: 'github-artifact-v1'
  });
  return publishVerifiedEdgeRelease({ binding, stateFile: argv[4], environment });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEdgeAddonsCli()
    .then(() => console.log('Edge submission accepted for review.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'EDGE_RELEASE_FAILED');
      process.exitCode = 1;
    });
}
