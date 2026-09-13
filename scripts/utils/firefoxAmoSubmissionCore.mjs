import { createHash } from 'node:crypto';
import { lstat, open, readFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalCompactJson } from '../../tools/npm-audit-regression/canonical-json.mjs';
import { getVerifiedFirefoxArtifactSnapshots } from './firefoxReleaseArtifactManifest.mjs';
import { FIREFOX_AMO_API_BASE_URL, submitVerifiedFirefoxXpi } from './firefoxExactXpiSubmit.mjs';

export const FIREFOX_AMO_STATE_LIMIT = 16 * 1024;

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readState(path) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size > FIREFOX_AMO_STATE_LIMIT
  ) {
    fail('FIREFOX_AMO_STATE_INVALID');
  }
  const bytes = await readFile(path);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('FIREFOX_AMO_STATE_INVALID');
  }
  if (value?.schema !== 'zendio-release-store-state-v1' || value.browser !== 'firefox') {
    fail('FIREFOX_AMO_STATE_INVALID');
  }
  return value;
}

async function writeState(path, value) {
  const bytes = `${canonicalCompactJson(value)}\n`;
  if (Buffer.byteLength(bytes) > FIREFOX_AMO_STATE_LIMIT) fail('FIREFOX_AMO_STATE_LIMIT');
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

async function uuidDigest(path) {
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600
    ) {
      fail('FIREFOX_UUID_EVIDENCE_INVALID');
    }
    return sha256(await readFile(path));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function errorCode(error, fallback) {
  const candidate = typeof error?.code === 'string' ? error.code : fallback;
  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/gu, '_')
    .slice(0, 96);
  return normalized || fallback;
}

export async function submitFirefoxAmoReleaseCore(options) {
  if (!['listed', 'unlisted'].includes(options.channel)) fail('FIREFOX_AMO_CHANNEL_INVALID');
  const statePath = resolve(options.stateFile);
  if (statePath === resolve(options.savedUploadUuidPath)) fail('FIREFOX_AMO_PATH_ALIAS');
  const state = await readState(statePath);
  const manifest = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  const snapshots = getVerifiedFirefoxArtifactSnapshots(options.binding);
  if (
    state.releaseSha !== manifest.git?.head ||
    state.releaseTree !== manifest.git?.tree ||
    state.outcome !== 'not-started' ||
    state.manifestPath !== options.manifestPath
  ) {
    fail('FIREFOX_AMO_STATE_BINDING_INVALID');
  }
  let current = {
    ...state,
    channel: options.channel,
    geckoId: snapshots.geckoId,
    xpiSha256: snapshots['unsigned-xpi'].sha256,
    sourceArchiveSha256: snapshots['amo-source'].sha256,
    uploadUuidSha256: null,
    signedXpiSha256: null,
    terminalResult: null
  };
  const journal = {
    beforeMutation: async (operation) => {
      current = {
        ...current,
        stage: `${operation}-started`,
        lastStartedOperation: operation,
        errorCode: 'FIREFOX_AMO_MUTATION_PENDING',
        recovery: 'retry',
        outcome: 'pre-mutation-failure',
        mutationInvoked: false,
        retrySafe: true
      };
      await writeState(statePath, current);
    },
    mutationInvoked: async (operation) => {
      current = {
        ...current,
        stage: `${operation}-started`,
        lastStartedOperation: operation,
        errorCode: 'FIREFOX_AMO_MUTATION_INDETERMINATE',
        recovery: 'reconcile',
        outcome: 'unknown-submission-state',
        mutationInvoked: true,
        retrySafe: false
      };
      await writeState(statePath, current);
    },
    afterMutation: async (operation) => {
      current = {
        ...current,
        stage: `${operation}-completed`,
        lastCompletedOperation: operation,
        uploadUuidSha256: await uuidDigest(options.savedUploadUuidPath)
      };
      await writeState(statePath, current);
    }
  };
  try {
    const result = await submitVerifiedFirefoxXpi({
      binding: options.binding,
      transportMode: 'github-artifact-v1',
      channel: options.channel,
      id: snapshots.geckoId,
      amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
      submissionSource: snapshots['amo-source'].path,
      savedUploadUuidPath: options.savedUploadUuidPath,
      downloadDir: options.downloadDir,
      credentials: options.credentials,
      mutationJournal: journal
    });
    const success = {
      ...current,
      stage: 'source-patch-completed',
      outcome: 'success',
      errorCode: null,
      recovery: 'none',
      mutationInvoked: true,
      retrySafe: false,
      uploadUuidSha256: await uuidDigest(options.savedUploadUuidPath),
      signedXpiSha256: options.channel === 'unlisted' ? result.signedXpiSha256 : null,
      terminalResult: options.channel
    };
    await writeState(statePath, success);
    return Object.freeze({ result, state: success });
  } catch (error) {
    const preMutation = error?.code === 'pre-mutation-failure' && current.mutationInvoked !== true;
    const failure = preMutation
      ? {
          ...current,
          stage: 'preflight',
          outcome: 'pre-mutation-failure',
          errorCode: errorCode(error, 'FIREFOX_AMO_PRE_MUTATION_FAILURE'),
          recovery: 'retry',
          mutationInvoked: false,
          retrySafe: true,
          uploadUuidSha256: null,
          terminalResult: null
        }
      : {
          ...current,
          outcome: 'unknown-submission-state',
          errorCode: errorCode(error, 'FIREFOX_AMO_UNKNOWN_STATE'),
          recovery: 'reconcile',
          mutationInvoked: true,
          retrySafe: false,
          uploadUuidSha256: await uuidDigest(options.savedUploadUuidPath),
          terminalResult: null
        };
    if (preMutation) {
      delete failure.lastStartedOperation;
      delete failure.lastCompletedOperation;
    }
    await writeState(statePath, failure);
    throw Object.assign(new Error(`${failure.outcome}:${failure.errorCode}`), {
      code: failure.outcome,
      retrySafe: failure.retrySafe
    });
  }
}
