import { basename, dirname, resolve, sep } from 'node:path';
import { lstat } from 'node:fs/promises';
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

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assertContained(parent, child) {
  const root = resolve(parent);
  const path = resolve(child);
  if (!path.startsWith(`${root}${sep}`)) fail('FIREFOX_SUBMIT_PATH_ESCAPE');
  return path;
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

export async function hashVerifiedXpiCrcs(binding) {
  const { inventory } = getVerifiedFirefoxArtifactSnapshot(binding);
  const rows = inventory
    .map((entry) => ({ path: entry.path, crc32: entry.crc32 | 0 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

export async function submitVerifiedFirefoxXpi(options, dependencies = {}) {
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
  const apiKey = credentials?.apiKey;
  const apiSecret = credentials?.apiSecret;
  if (!apiKey || !apiSecret) fail('FIREFOX_SUBMIT_CREDENTIALS');
  const signAddonImpl = dependencies.signAddonImpl;
  if (typeof signAddonImpl !== 'function') fail('FIREFOX_SUBMIT_IMPLEMENTATION');

  await mutationJournal.beforeMutation('upload', {
    channel,
    id,
    xpi: basename(consumed.xpiPath)
  });
  let mutationStarted = true;
  try {
    const result = await signAddonImpl({
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
      SubmitClient: dependencies.SubmitClient
    });
    await mutationJournal.afterMutation('upload', { channel, id });
    mutationStarted = false;
    return result;
  } catch (error) {
    if (mutationStarted) {
      const wrapped = new Error(`unknown-submission-state:${error?.message ?? error}`);
      wrapped.code = 'unknown-submission-state';
      wrapped.retrySafe = false;
      throw wrapped;
    }
    throw error;
  }
}
