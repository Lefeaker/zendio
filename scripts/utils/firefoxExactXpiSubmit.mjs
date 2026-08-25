import { basename, dirname, resolve, sep } from 'node:path';
import { lstat } from 'node:fs/promises';
import PinnedSubmitClient, { signAddon as pinnedSignAddon } from 'web-ext/util/submit-addon';
import {
  assertVerifiedFirefoxArtifactBinding,
  consumeVerifiedFirefoxArtifactBinding,
  getVerifiedFirefoxArtifactSnapshot
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_AMO_API_BASE_URL = 'https://addons.mozilla.org/api/v5/';
export const FIREFOX_SUBMISSION_LIMITS = Object.freeze({
  uploadMs: 120_000,
  submitMs: 120_000,
  patchMs: 120_000,
  statusMs: 30_000,
  downloadMs: 120_000,
  validationPollMs: 5_000,
  validationAttempts: 120,
  validationTotalMs: 600_000,
  approvalPollMs: 5_000,
  approvalAttempts: 180,
  approvalTotalMs: 900_000
});
export const FIREFOX_SUBMISSION_MUTATIONS = Object.freeze([
  'upload',
  'version-submit',
  'source-patch'
]);
const PINNED_CLIENT_METHOD_NAMES = Object.freeze([
  'fileFromSync',
  'nodeFetch',
  'doUploadSubmit',
  'waitRetry',
  'waitForValidation',
  'doNewAddonOrVersionSubmit',
  'doFormDataPatch',
  'doAfterSubmit',
  'fetchJson',
  'fetch',
  'returnResult',
  'hashXpiCrcs',
  'getPreviousUuidOrUploadXpi',
  'putVersion'
]);
const PINNED_CLIENT_METHODS = Object.freeze(
  Object.fromEntries(
    PINNED_CLIENT_METHOD_NAMES.map((name) => [name, PinnedSubmitClient.prototype[name]])
  )
);

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assertContained(parent, child) {
  const root = resolve(parent);
  const path = resolve(child);
  if (!path.startsWith(`${root}${sep}`)) fail('FIREFOX_SUBMIT_PATH_ESCAPE');
  return path;
}

function assertPinnedSubmitImplementation() {
  for (const name of PINNED_CLIENT_METHOD_NAMES) {
    if (
      typeof PINNED_CLIENT_METHODS[name] !== 'function' ||
      PinnedSubmitClient.prototype[name] !== PINNED_CLIENT_METHODS[name]
    ) {
      fail('FIREFOX_SUBMIT_IMPLEMENTATION_DRIFT', name);
    }
  }
}

async function assertFreshPrivateTarget(path) {
  const parent = dirname(path);
  const parentStat = await lstat(parent);
  if (
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink() ||
    (parentStat.mode & 0o777) !== 0o700
  ) {
    fail('FIREFOX_SUBMIT_PRIVATE_PARENT');
  }
  try {
    await lstat(path);
    fail('FIREFOX_SUBMIT_TARGET_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function classifyJsonMutation(url, method) {
  const target = url instanceof URL ? url : new URL(url);
  if (method === 'POST' && target.pathname.endsWith('/addons/upload/')) return 'upload';
  if (method === 'PUT' && /\/addons\/addon\/[^/]+\/$/u.test(target.pathname)) {
    return 'version-submit';
  }
  if (method === 'POST' && target.pathname.endsWith('/addons/addon/')) return 'new-addon';
  return null;
}

function createJournaledSubmitClient(BaseClient, mutationJournal, metadata, onMutationInvoked) {
  let nextMutation = 0;
  let fenced = false;
  let active = false;
  const runMutation = async (operation, invoke) => {
    if (
      fenced ||
      active ||
      operation !== FIREFOX_SUBMISSION_MUTATIONS[nextMutation] ||
      !FIREFOX_SUBMISSION_MUTATIONS.includes(operation)
    ) {
      fail('FIREFOX_SUBMIT_MUTATION_ORDER');
    }
    active = true;
    try {
      await mutationJournal.beforeMutation(operation, metadata);
      onMutationInvoked(operation);
      const result = await invoke();
      await mutationJournal.afterMutation(operation, metadata);
      nextMutation += 1;
      return result;
    } catch (error) {
      fenced = true;
      throw error;
    } finally {
      active = false;
    }
  };

  class JournaledSubmitClient extends BaseClient {
    fetchJson(url, method = 'GET', body, errorMessage) {
      const operation = classifyJsonMutation(url, method);
      if (operation === 'new-addon') fail('FIREFOX_SUBMIT_NEW_ADDON_FORBIDDEN');
      if (!operation) return super.fetchJson(url, method, body, errorMessage);
      return runMutation(operation, () => super.fetchJson(url, method, body, errorMessage));
    }

    doFormDataPatch(data, addonId, versionId) {
      return runMutation('source-patch', () => super.doFormDataPatch(data, addonId, versionId));
    }
  }

  return {
    SubmitClient: JournaledSubmitClient,
    completed: () => nextMutation,
    fence: () => {
      fenced = true;
    }
  };
}

export async function hashVerifiedXpiCrcs(binding) {
  const { inventory } = getVerifiedFirefoxArtifactSnapshot(binding);
  const rows = inventory
    .map((entry) => ({ path: entry.path, crc32: entry.crc32 | 0 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

export async function submitVerifiedFirefoxXpi(options, unsupportedInjection) {
  if (
    arguments.length !== 1 ||
    unsupportedInjection !== undefined ||
    (options &&
      typeof options === 'object' &&
      (Object.hasOwn(options, 'signAddonImpl') || Object.hasOwn(options, 'SubmitClient')))
  ) {
    fail('FIREFOX_SUBMIT_INJECTION_FORBIDDEN');
  }
  const {
    binding,
    transportMode,
    channel,
    id,
    amoBaseUrl,
    submissionSource,
    savedUploadUuidPath,
    downloadDir,
    credentials,
    mutationJournal
  } = options;
  const verifiedBinding = assertVerifiedFirefoxArtifactBinding(binding);
  if (!['listed', 'unlisted'].includes(channel)) fail('FIREFOX_SUBMIT_CHANNEL');
  if (amoBaseUrl !== FIREFOX_AMO_API_BASE_URL) fail('FIREFOX_SUBMIT_BASE_URL');
  if (!id || id !== verifiedBinding.geckoId || Buffer.byteLength(id, 'utf8') > 256) {
    fail('FIREFOX_SUBMIT_GECKO_ID');
  }
  if (!savedUploadUuidPath || basename(savedUploadUuidPath) !== 'upload-state.json') {
    fail('FIREFOX_SUBMIT_STATE_PATH');
  }
  const releaseRoot = verifiedBinding.releaseDir;
  const requestedSubmissionSource = assertContained(releaseRoot, submissionSource);
  assertContained(releaseRoot, savedUploadUuidPath);
  assertContained(releaseRoot, downloadDir);
  await assertFreshPrivateTarget(savedUploadUuidPath);

  const consumed = consumeVerifiedFirefoxArtifactBinding(verifiedBinding, transportMode);
  if (requestedSubmissionSource !== consumed.sourceArchivePath) {
    fail('FIREFOX_SUBMIT_SOURCE_MISMATCH');
  }
  const sourceStat = await lstat(consumed.sourceArchivePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink !== 1) {
    fail('FIREFOX_SUBMIT_SOURCE_TYPE');
  }
  if (!mutationJournal?.beforeMutation || !mutationJournal?.afterMutation) {
    fail('FIREFOX_SUBMIT_JOURNAL');
  }
  assertPinnedSubmitImplementation();
  const apiKey = credentials?.apiKey;
  const apiSecret = credentials?.apiSecret;
  if (!apiKey || !apiSecret) fail('FIREFOX_SUBMIT_CREDENTIALS');

  let mutationInvoked = false;
  const journaled = createJournaledSubmitClient(
    PinnedSubmitClient,
    mutationJournal,
    Object.freeze({ channel, id, xpi: basename(consumed.xpiPath) }),
    () => {
      mutationInvoked = true;
    }
  );
  try {
    const result = await pinnedSignAddon({
      apiKey,
      apiSecret,
      amoBaseUrl,
      validationCheckTimeout: FIREFOX_SUBMISSION_LIMITS.validationTotalMs,
      approvalCheckTimeout: channel === 'listed' ? 0 : FIREFOX_SUBMISSION_LIMITS.approvalTotalMs,
      id,
      xpiPath: consumed.xpiPath,
      downloadDir,
      channel,
      savedUploadUuidPath,
      submissionSource: consumed.sourceArchivePath,
      SubmitClient: journaled.SubmitClient
    });
    if (journaled.completed() !== FIREFOX_SUBMISSION_MUTATIONS.length) {
      fail('FIREFOX_SUBMIT_MUTATION_SEQUENCE_INCOMPLETE');
    }
    return result;
  } catch (error) {
    journaled.fence();
    if (mutationInvoked) {
      const wrapped = new Error(`unknown-submission-state:${error?.message ?? error}`);
      wrapped.code = 'unknown-submission-state';
      wrapped.retrySafe = false;
      throw wrapped;
    }
    const wrapped = new Error(`pre-mutation-failure:${error?.message ?? error}`);
    wrapped.code = 'pre-mutation-failure';
    wrapped.retrySafe = true;
    throw wrapped;
  }
}
