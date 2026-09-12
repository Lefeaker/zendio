import { createHash, createHmac, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { lstat, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';
import {
  assertVerifiedFirefoxArtifactBinding,
  canonicalArtifactJson,
  consumeVerifiedFirefoxArtifactBinding,
  getVerifiedFirefoxArtifactSnapshot,
  getVerifiedFirefoxArtifactSnapshots
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_AMO_API_BASE_URL = 'https://addons.mozilla.org/api/v5/';
export const FIREFOX_AMO_CLIENT_ID = 'direct-v5';
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
  approvalTotalMs: 900_000,
  wholeMs: 2_700_000,
  jsonResponseBytes: 1024 * 1024,
  cumulativeResponseBytes: 16 * 1024 * 1024,
  signedXpiBytes: 256 * 1024 * 1024
});
export const FIREFOX_SUBMISSION_MUTATIONS = Object.freeze([
  'upload',
  'version-submit',
  'source-patch'
]);

const UUID_EVIDENCE_LIMIT = 4096;
const USER_AGENT = 'zendio-amo-direct-v5/1';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assertContained(parent, child) {
  const root = resolve(parent);
  const path = resolve(child);
  if (!path.startsWith(`${root}${sep}`)) fail('FIREFOX_SUBMIT_PATH_ESCAPE');
  return path;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createAuthorizationHeader(credentials) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.apiKey,
      jti: randomUUID(),
      iat: issuedAt,
      exp: issuedAt + 60
    })
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', credentials.apiSecret)
    .update(unsigned)
    .digest('base64url');
  return `JWT ${unsigned}.${signature}`;
}

function fileFromBytes(bytes, name) {
  let FileConstructor = globalThis.File;
  if (typeof FileConstructor === 'undefined') {
    const form = new FormData();
    form.set('file', new Blob([]));
    FileConstructor = form.get('file').constructor;
  }
  return new FileConstructor([bytes], name);
}

function safeXpiBasename(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.xpi$/u.test(value) &&
    !value.includes('..')
  );
}

async function assertPrivateDirectory(path, { empty = false } = {}) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  ) {
    fail('FIREFOX_SUBMIT_PRIVATE_DIRECTORY');
  }
  if (empty && (await readdir(path)).length !== 0) fail('FIREFOX_SUBMIT_DIRECTORY_NOT_EMPTY');
}

function validateUuidEvidence(value) {
  const keys =
    value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [];
  if (
    JSON.stringify(keys) !== JSON.stringify(['channel', 'uploadUuid', 'xpiCrcHash']) ||
    !/^[A-Za-z0-9_-]{1,256}$/u.test(value.uploadUuid ?? '') ||
    !['listed', 'unlisted'].includes(value.channel) ||
    !/^[0-9a-f]{64}$/u.test(value.xpiCrcHash ?? '')
  ) {
    fail('FIREFOX_SUBMIT_UUID_INVALID');
  }
  return value;
}

async function readUuidEvidence(path) {
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > UUID_EVIDENCE_LIMIT ||
      (await realpath(path)) !== path
    ) {
      fail('FIREFOX_UUID_EVIDENCE_INVALID');
    }
    return validateUuidEvidence(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) fail('FIREFOX_UUID_EVIDENCE_INVALID');
    throw error;
  }
}

async function publishCanonicalUuid(path, value) {
  validateUuidEvidence(value);
  const bytes = Buffer.from(canonicalArtifactJson(value), 'utf8');
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.next`);
  const handle = await open(
    temp,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } finally {
    await unlink(temp).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const directory = await open(dirname(path), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    !(await readFile(path)).equals(bytes)
  ) {
    fail('FIREFOX_SUBMIT_UUID_PUBLICATION_INVALID');
  }
}

async function readResponseBytes(
  response,
  maximumBytes,
  accounting,
  cumulativeMaximum = FIREFOX_SUBMISSION_LIMITS.cumulativeResponseBytes,
  allowEmptyBody = false
) {
  if (!response.body) {
    if (allowEmptyBody) return Buffer.alloc(0);
    fail('FIREFOX_SUBMIT_RESPONSE_BODY_MISSING');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const row = await reader.read();
      if (row.done) break;
      const bytes = Buffer.from(row.value);
      total += bytes.length;
      accounting.total += bytes.length;
      if (total > maximumBytes || accounting.total > cumulativeMaximum) {
        await reader.cancel().catch(() => undefined);
        fail('FIREFOX_SUBMIT_RESPONSE_LIMIT');
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function createRequestController(credentials) {
  const startedAt = Date.now();
  const controllers = new Set();
  const waits = new Set();
  const accounting = { total: 0 };
  let fenced = false;
  const remainingWhole = () => FIREFOX_SUBMISSION_LIMITS.wholeMs - (Date.now() - startedAt);

  const request = async ({
    url,
    method = 'GET',
    body,
    timeoutMs,
    maximumBytes = FIREFOX_SUBMISSION_LIMITS.jsonResponseBytes,
    redirect = 'error',
    authenticated = true,
    accept = 'application/json',
    allowEmptyBody = false,
    afterFetchStarted
  }) => {
    if (fenced) fail('FIREFOX_SUBMIT_FENCED');
    const remaining = remainingWhole();
    if (remaining <= 0) fail('FIREFOX_SUBMIT_WHOLE_TIMEOUT');
    const controller = new AbortController();
    controllers.add(controller);
    const headers = new Headers({ Accept: accept, 'User-Agent': USER_AGENT });
    if (authenticated) headers.set('Authorization', createAuthorizationHeader(credentials));
    if (typeof body === 'string') headers.set('Content-Type', 'application/json');
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => {
          fenced = true;
          controller.abort();
          reject(new Error('FIREFOX_SUBMIT_REQUEST_TIMEOUT'));
        },
        Math.min(timeoutMs, remaining)
      );
    });
    timeout.catch(() => undefined);
    let pending;
    try {
      pending = Promise.resolve(
        globalThis.fetch(url, { method, body, headers, redirect, signal: controller.signal })
      );
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (response) => {
        if (fenced) response.body?.cancel().catch(() => undefined);
      },
      () => undefined
    );
    pending.catch(() => undefined);
    try {
      if (afterFetchStarted) await afterFetchStarted();
      const response = await Promise.race([pending, timeout]);
      const bodyPromise = readResponseBytes(
        response,
        maximumBytes,
        accounting,
        FIREFOX_SUBMISSION_LIMITS.cumulativeResponseBytes,
        allowEmptyBody
      );
      bodyPromise.catch(() => undefined);
      const bytes = await Promise.race([bodyPromise, timeout]);
      return { response, bytes };
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  };

  const requestJson = async (options) => {
    const { response, bytes } = await request(options);
    let value;
    try {
      value = bytes.length === 0 ? {} : JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('FIREFOX_SUBMIT_RESPONSE_JSON');
    }
    if (!response.ok) fail('FIREFOX_SUBMIT_HTTP_STATUS', String(response.status));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('FIREFOX_SUBMIT_RESPONSE_JSON');
    }
    return value;
  };

  const wait = (milliseconds) => {
    if (fenced) return Promise.reject(new Error('FIREFOX_SUBMIT_FENCED'));
    const remaining = remainingWhole();
    if (remaining <= 0 || milliseconds > remaining) {
      return Promise.reject(new Error('FIREFOX_SUBMIT_WHOLE_TIMEOUT'));
    }
    return new Promise((resolvePromise, rejectPromise) => {
      const record = { timer: null, reject: rejectPromise };
      record.timer = setTimeout(() => {
        waits.delete(record);
        resolvePromise();
      }, milliseconds);
      waits.add(record);
    });
  };

  return {
    request,
    requestJson,
    wait,
    remainingWhole,
    fence() {
      fenced = true;
      for (const controller of controllers) controller.abort();
      for (const record of waits) {
        clearTimeout(record.timer);
        record.reject(new Error('FIREFOX_SUBMIT_FENCED'));
      }
      waits.clear();
    }
  };
}

function uploadUrl(baseUrl) {
  return new URL('addons/upload/', baseUrl);
}

function uploadStatusUrl(baseUrl, uuid) {
  return new URL(`addons/upload/${encodeURIComponent(uuid)}/`, baseUrl);
}

function addonUrl(baseUrl, id) {
  return new URL(`addons/addon/${encodeURIComponent(id)}/`, baseUrl);
}

function versionUrl(baseUrl, id, versionId) {
  return new URL(
    `addons/addon/${encodeURIComponent(id)}/versions/${encodeURIComponent(String(versionId))}/`,
    baseUrl
  );
}

function validationErrorCount(validation) {
  const errors = validation?.errors;
  if (Number.isSafeInteger(errors) && errors >= 0) return errors;
  if (Array.isArray(errors)) return errors.length;
  return null;
}

async function waitForValidation(requests, baseUrl, uploadUuid, channel) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < FIREFOX_SUBMISSION_LIMITS.validationAttempts; attempt += 1) {
    if (Date.now() - startedAt >= FIREFOX_SUBMISSION_LIMITS.validationTotalMs) {
      fail('FIREFOX_SUBMIT_VALIDATION_TIMEOUT');
    }
    const value = await requests.requestJson({
      url: uploadStatusUrl(baseUrl, uploadUuid),
      timeoutMs: FIREFOX_SUBMISSION_LIMITS.statusMs
    });
    if (value.processed === true) {
      if (value.uuid !== uploadUuid || (value.channel !== undefined && value.channel !== channel)) {
        fail('FIREFOX_SUBMIT_UUID_MISMATCH');
      }
      if (
        value.submitted === true ||
        value.valid !== true ||
        validationErrorCount(value.validation) !== 0
      ) {
        fail('FIREFOX_SUBMIT_VALIDATION_FAILED');
      }
      return uploadUuid;
    }
    if (attempt + 1 < FIREFOX_SUBMISSION_LIMITS.validationAttempts) {
      await requests.wait(FIREFOX_SUBMISSION_LIMITS.validationPollMs);
    }
  }
  fail('FIREFOX_SUBMIT_VALIDATION_TIMEOUT');
}

async function waitForApproval(requests, baseUrl, id, versionId) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < FIREFOX_SUBMISSION_LIMITS.approvalAttempts; attempt += 1) {
    if (Date.now() - startedAt >= FIREFOX_SUBMISSION_LIMITS.approvalTotalMs) {
      fail('FIREFOX_SUBMIT_APPROVAL_TIMEOUT');
    }
    const value = await requests.requestJson({
      url: versionUrl(baseUrl, id, versionId),
      timeoutMs: FIREFOX_SUBMISSION_LIMITS.statusMs
    });
    if (value.file?.status === 'public' && typeof value.file?.url === 'string') {
      if (!/^sha256:[0-9a-f]{64}$/u.test(value.file.hash ?? '')) {
        fail('FIREFOX_SUBMIT_SIGNED_DIGEST_INVALID');
      }
      return { fileUrl: value.file.url, expectedDigest: value.file.hash.slice(7) };
    }
    if (attempt + 1 < FIREFOX_SUBMISSION_LIMITS.approvalAttempts) {
      await requests.wait(FIREFOX_SUBMISSION_LIMITS.approvalPollMs);
    }
  }
  fail('FIREFOX_SUBMIT_APPROVAL_TIMEOUT');
}

async function downloadSignedXpi({ requests, fileUrl, expectedDigest, snapshots, topology }) {
  const primary = new URL(fileUrl);
  const parts = primary.pathname.match(
    /^\/firefox\/downloads\/file\/([1-9][0-9]{0,15})\/([^/]+\.xpi)$/u
  );
  const filename = parts ? decodeURIComponent(parts[2]) : '';
  if (
    primary.origin !== 'https://addons.mozilla.org' ||
    primary.username ||
    primary.password ||
    primary.port ||
    primary.search ||
    primary.hash ||
    !/^[0-9a-f]{64}$/u.test(expectedDigest) ||
    !parts ||
    !Number.isSafeInteger(Number(parts[1])) ||
    !safeXpiBasename(filename) ||
    encodeURIComponent(filename) !== parts[2]
  ) {
    fail('FIREFOX_SUBMIT_SIGNED_URL_INVALID');
  }

  const primaryResult = await requests.request({
    url: primary,
    timeoutMs: FIREFOX_SUBMISSION_LIMITS.downloadMs,
    maximumBytes: FIREFOX_SUBMISSION_LIMITS.signedXpiBytes,
    redirect: 'manual',
    authenticated: true,
    accept: 'application/x-xpinstall',
    allowEmptyBody: true
  });
  let bytes;
  if (primaryResult.response.status === 200) {
    if (primaryResult.response.headers.has('location')) fail('FIREFOX_SUBMIT_SIGNED_URL_INVALID');
    bytes = primaryResult.bytes;
  } else if (primaryResult.response.status === 302) {
    const location = primaryResult.response.headers.get('location');
    if (!location) fail('FIREFOX_SUBMIT_SIGNED_REDIRECT_INVALID');
    const mirror = new URL(location);
    const mirrorPath = mirror.pathname.match(
      /^\/user-media\/addons\/([1-9][0-9]{0,15})\/([^/]+\.xpi)$/u
    );
    const allowedQuery =
      mirror.search === '' || mirror.search === `?filehash=sha256%3A${expectedDigest}`;
    if (
      mirror.origin !== 'https://addons.cdn.mozilla.net' ||
      mirror.username ||
      mirror.password ||
      mirror.port ||
      mirror.hash ||
      !mirrorPath ||
      !Number.isSafeInteger(Number(mirrorPath[1])) ||
      mirrorPath[2] !== parts[2] ||
      !allowedQuery
    ) {
      fail('FIREFOX_SUBMIT_SIGNED_REDIRECT_INVALID');
    }
    const mirrorResult = await requests.request({
      url: mirror,
      timeoutMs: FIREFOX_SUBMISSION_LIMITS.downloadMs,
      maximumBytes: FIREFOX_SUBMISSION_LIMITS.signedXpiBytes,
      authenticated: false,
      accept: 'application/x-xpinstall'
    });
    if (mirrorResult.response.status !== 200) fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
    bytes = mirrorResult.bytes;
  } else {
    fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
  }
  if (!bytes?.length) fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
  if (createHash('sha256').update(bytes).digest('hex') !== expectedDigest) {
    fail('FIREFOX_SUBMIT_SIGNED_DIGEST_MISMATCH');
  }

  const destination = join(topology.downloadDir, filename);
  const handle = await open(
    destination,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const signedInventory = await inventoryBoundedZip(destination);
  const signedManifests = signedInventory.entries.filter(
    (entry) => !entry.directory && entry.path === 'manifest.json'
  );
  let signedManifest;
  try {
    signedManifest =
      signedManifests.length === 1 ? JSON.parse(signedManifests[0].content.toString('utf8')) : null;
  } catch {
    fail('FIREFOX_SUBMIT_SIGNED_MANIFEST_INVALID');
  }
  const signedGeckoId =
    signedManifest?.browser_specific_settings?.gecko?.id ?? signedManifest?.applications?.gecko?.id;
  if (
    signedGeckoId !== snapshots.geckoId ||
    signedManifest?.version !== snapshots.manifestVersion
  ) {
    fail('FIREFOX_SUBMIT_SIGNED_MANIFEST_INVALID');
  }
  if (JSON.stringify(await readdir(topology.downloadDir)) !== JSON.stringify([filename])) {
    fail('FIREFOX_SUBMIT_SIGNED_DIRECTORY_ROSTER');
  }
  const published = await readFile(destination);
  const signedXpiSha256 = createHash('sha256').update(bytes).digest('hex');
  if (!published.equals(bytes)) fail('FIREFOX_SUBMIT_SIGNED_PUBLICATION_INVALID');
  const directory = await open(topology.downloadDir, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return { downloadedFiles: [filename], signedXpiSha256 };
}

export async function hashVerifiedXpiCrcs(binding) {
  const { inventory } = getVerifiedFirefoxArtifactSnapshot(binding);
  const rows = inventory
    .map((entry) => ({ path: entry.path, crc32: entry.crc32 | 0 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

export async function submitVerifiedFirefoxXpi(options, unsupportedInjection) {
  const acceptedOptionKeys = [
    'amoBaseUrl',
    'binding',
    'channel',
    'credentials',
    'downloadDir',
    'id',
    'mutationJournal',
    'savedUploadUuidPath',
    'submissionSource',
    'transportMode'
  ];
  if (
    arguments.length !== 1 ||
    unsupportedInjection !== undefined ||
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(acceptedOptionKeys)
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
  if (!savedUploadUuidPath || basename(savedUploadUuidPath) !== 'upload-uuid.json') {
    fail('FIREFOX_SUBMIT_STATE_PATH');
  }
  const attemptRoot = verifiedBinding.attemptRoot;
  const releaseRoot = verifiedBinding.releaseDir;
  const requestedSubmissionSource = assertContained(releaseRoot, submissionSource);
  const stateRoot = join(attemptRoot, 'store-state/firefox');
  const expectedUuidPath = join(stateRoot, 'web-ext-upload/upload-uuid.json');
  const expectedDownloadDir = join(stateRoot, 'downloads');
  if (
    savedUploadUuidPath !== expectedUuidPath ||
    downloadDir !== expectedDownloadDir ||
    new Set([
      verifiedBinding.xpiPath,
      verifiedBinding.sourceArchivePath,
      savedUploadUuidPath,
      downloadDir
    ]).size !== 4
  ) {
    fail('FIREFOX_SUBMIT_STATE_TOPOLOGY');
  }
  assertContained(attemptRoot, savedUploadUuidPath);
  assertContained(attemptRoot, downloadDir);
  await assertPrivateDirectory(stateRoot);
  await assertPrivateDirectory(dirname(savedUploadUuidPath));
  await assertPrivateDirectory(downloadDir, { empty: true });

  const snapshots = getVerifiedFirefoxArtifactSnapshots(verifiedBinding);
  const consumed = consumeVerifiedFirefoxArtifactBinding(verifiedBinding, transportMode);
  if (requestedSubmissionSource !== consumed.sourceArchivePath) {
    fail('FIREFOX_SUBMIT_SOURCE_MISMATCH');
  }
  const sourceStat = await lstat(consumed.sourceArchivePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink !== 1) {
    fail('FIREFOX_SUBMIT_SOURCE_TYPE');
  }
  if (
    !mutationJournal ||
    JSON.stringify(Object.keys(mutationJournal).sort()) !==
      JSON.stringify(['afterMutation', 'beforeMutation', 'mutationInvoked']) ||
    typeof mutationJournal.beforeMutation !== 'function' ||
    typeof mutationJournal.afterMutation !== 'function' ||
    typeof mutationJournal.mutationInvoked !== 'function'
  ) {
    fail('FIREFOX_SUBMIT_JOURNAL');
  }
  if (
    !credentials ||
    JSON.stringify(Object.keys(credentials).sort()) !== JSON.stringify(['apiKey', 'apiSecret']) ||
    typeof credentials.apiKey !== 'string' ||
    typeof credentials.apiSecret !== 'string' ||
    credentials.apiKey.length === 0 ||
    credentials.apiSecret.length === 0 ||
    Buffer.byteLength(credentials.apiKey) > 4096 ||
    Buffer.byteLength(credentials.apiSecret) > 4096
  ) {
    fail('FIREFOX_SUBMIT_CREDENTIALS');
  }

  const baseUrl = new URL(amoBaseUrl);
  const requests = createRequestController(credentials);
  const metadata = Object.freeze({ channel, id, xpi: basename(consumed.xpiPath) });
  let nextMutation = 0;
  let mutationInvoked = false;

  const runMutation = async (operation, invoke) => {
    if (operation !== FIREFOX_SUBMISSION_MUTATIONS[nextMutation]) {
      fail('FIREFOX_SUBMIT_MUTATION_ORDER');
    }
    await mutationJournal.beforeMutation(operation, metadata);
    const result = await invoke(async () => {
      mutationInvoked = true;
      await mutationJournal.mutationInvoked(operation, metadata);
    });
    await mutationJournal.afterMutation(operation, metadata);
    nextMutation += 1;
    return result;
  };

  const execute = async () => {
    const xpiCrcHash = await hashVerifiedXpiCrcs(verifiedBinding);
    const upload = await runMutation('upload', async (markInvoked) => {
      const previous = await readUuidEvidence(savedUploadUuidPath);
      if (previous?.channel === channel && previous.xpiCrcHash === xpiCrcHash) {
        return { uploadUuid: previous.uploadUuid, reused: true };
      }
      const form = new FormData();
      form.set('channel', channel);
      form.set(
        'upload',
        fileFromBytes(snapshots['unsigned-xpi'].bytes, basename(consumed.xpiPath))
      );
      const response = await requests.requestJson({
        url: uploadUrl(baseUrl),
        method: 'POST',
        body: form,
        timeoutMs: FIREFOX_SUBMISSION_LIMITS.uploadMs,
        afterFetchStarted: markInvoked
      });
      if (
        !/^[A-Za-z0-9_-]{1,256}$/u.test(response.uuid ?? '') ||
        (response.channel !== undefined && response.channel !== channel)
      ) {
        fail('FIREFOX_SUBMIT_UUID_INVALID');
      }
      return { uploadUuid: response.uuid, reused: false };
    });

    await waitForValidation(requests, baseUrl, upload.uploadUuid, channel);
    if (!upload.reused) {
      await publishCanonicalUuid(savedUploadUuidPath, {
        uploadUuid: upload.uploadUuid,
        channel,
        xpiCrcHash
      });
    }

    const version = await runMutation('version-submit', async (markInvoked) => {
      const response = await requests.requestJson({
        url: addonUrl(baseUrl, id),
        method: 'PUT',
        body: JSON.stringify({ version: { upload: upload.uploadUuid } }),
        timeoutMs: FIREFOX_SUBMISSION_LIMITS.submitMs,
        afterFetchStarted: markInvoked
      });
      const value = response.version;
      if (
        !value ||
        !Number.isSafeInteger(value.id) ||
        value.id <= 0 ||
        typeof value.edit_url !== 'string' ||
        value.edit_url.length === 0
      ) {
        fail('FIREFOX_SUBMIT_VERSION_INVALID');
      }
      return value;
    });

    await runMutation('source-patch', async (markInvoked) => {
      const form = new FormData();
      form.set(
        'source',
        fileFromBytes(snapshots['amo-source'].bytes, basename(consumed.sourceArchivePath))
      );
      const { response } = await requests.request({
        url: versionUrl(baseUrl, id, version.id),
        method: 'PATCH',
        body: form,
        timeoutMs: FIREFOX_SUBMISSION_LIMITS.patchMs,
        afterFetchStarted: markInvoked
      });
      if (!response.ok) fail('FIREFOX_SUBMIT_HTTP_STATUS', String(response.status));
    });

    if (nextMutation !== FIREFOX_SUBMISSION_MUTATIONS.length) {
      fail('FIREFOX_SUBMIT_MUTATION_SEQUENCE_INCOMPLETE');
    }
    if (channel === 'listed') return { id };
    const approval = await waitForApproval(requests, baseUrl, id, version.id);
    const download = await downloadSignedXpi({
      requests,
      ...approval,
      snapshots,
      topology: { downloadDir: expectedDownloadDir }
    });
    return { id, ...download };
  };

  let wholeTimer;
  try {
    const pending = execute();
    pending.catch(() => undefined);
    return await Promise.race([
      pending,
      new Promise((_, reject) => {
        wholeTimer = setTimeout(() => {
          requests.fence();
          reject(new Error('FIREFOX_SUBMIT_WHOLE_TIMEOUT'));
        }, FIREFOX_SUBMISSION_LIMITS.wholeMs);
      })
    ]);
  } catch (error) {
    requests.fence();
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
  } finally {
    clearTimeout(wholeTimer);
  }
}
