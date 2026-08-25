import { createHash } from 'node:crypto';
import { constants as fsConstants, lstatSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { link, lstat, open, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import PinnedSubmitClient, { signAddon as pinnedSignAddon } from 'web-ext/util/submit-addon';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';
import {
  assertVerifiedFirefoxArtifactBinding,
  consumeVerifiedFirefoxArtifactBinding,
  getVerifiedFirefoxArtifactSnapshot,
  getVerifiedFirefoxArtifactSnapshots
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
    parentStat.uid !== process.getuid?.() ||
    (parentStat.mode & 0o777) !== 0o700 ||
    (await realpath(parent)) !== parent
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

async function assertPrivateDirectory(path, { empty = false } = {}) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  )
    fail('FIREFOX_SUBMIT_PRIVATE_DIRECTORY');
  if (empty && (await readdir(path)).length !== 0) fail('FIREFOX_SUBMIT_DIRECTORY_NOT_EMPTY');
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

async function publishCanonicalUuid(path, value) {
  const keys = Object.keys(value).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(['channel', 'uploadUuid', 'xpiCrcHash']) ||
    !/^[A-Za-z0-9_-]{1,256}$/u.test(value.uploadUuid ?? '') ||
    !['listed', 'unlisted'].includes(value.channel) ||
    !/^[0-9a-f]{64}$/u.test(value.xpiCrcHash ?? '')
  )
    fail('FIREFOX_SUBMIT_UUID_INVALID');
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.publication`);
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
    await link(temp, path);
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    !(await readFile(path)).equals(bytes)
  )
    fail('FIREFOX_SUBMIT_UUID_PUBLICATION_INVALID');
}

async function readResponseBytes(
  response,
  maximumBytes,
  accounting,
  cumulativeMaximum = FIREFOX_SUBMISSION_LIMITS.cumulativeResponseBytes
) {
  if (!response.body) fail('FIREFOX_SUBMIT_RESPONSE_BODY_MISSING');
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

function safeXpiBasename(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.xpi$/u.test(value) &&
    !value.includes('..')
  );
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

function createJournaledSubmitClient(
  BaseClient,
  mutationJournal,
  metadata,
  snapshots,
  topology,
  onMutationInvoked
) {
  let nextMutation = 0;
  let fenced = false;
  let active = false;
  let activeOperation = null;
  const usedFiles = new Set();
  const accounting = { total: 0 };
  const activeControllers = new Set();
  const activeWaits = new Set();
  const startedAt = Date.now();

  const remainingWhole = () => FIREFOX_SUBMISSION_LIMITS.wholeMs - (Date.now() - startedAt);

  const waitBounded = (milliseconds) => {
    const remaining = remainingWhole();
    if (remaining <= 0) return Promise.reject(new Error('FIREFOX_SUBMIT_WHOLE_TIMEOUT'));
    return new Promise((resolvePromise, rejectPromise) => {
      if (milliseconds > remaining) {
        rejectPromise(new Error('FIREFOX_SUBMIT_WHOLE_TIMEOUT'));
        return;
      }
      const record = {
        timer: null,
        reject: rejectPromise
      };
      record.timer = setTimeout(() => {
        activeWaits.delete(record);
        resolvePromise();
      }, milliseconds);
      activeWaits.add(record);
    });
  };

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
    activeOperation = operation;
    try {
      await mutationJournal.beforeMutation(operation, metadata);
      const result = await invoke();
      await mutationJournal.afterMutation(operation, metadata);
      nextMutation += 1;
      return result;
    } catch (error) {
      fenced = true;
      throw error;
    } finally {
      activeOperation = null;
      active = false;
    }
  };

  class JournaledSubmitClient extends BaseClient {
    constructor(options) {
      super({
        ...options,
        validationCheckInterval: FIREFOX_SUBMISSION_LIMITS.validationPollMs,
        validationCheckTimeout: FIREFOX_SUBMISSION_LIMITS.validationTotalMs,
        approvalCheckInterval: FIREFOX_SUBMISSION_LIMITS.approvalPollMs,
        approvalCheckTimeout:
          options.approvalCheckTimeout === 0 ? 0 : FIREFOX_SUBMISSION_LIMITS.approvalTotalMs
      });
    }

    fileFromSync(path) {
      const role =
        path === snapshots['unsigned-xpi'].path
          ? 'unsigned-xpi'
          : path === snapshots['amo-source'].path
            ? 'amo-source'
            : null;
      if (!role || usedFiles.has(role)) fail('FIREFOX_SUBMIT_FILE_CAPABILITY_INVALID');
      const stat = lstatSync(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.dev !== snapshots[role].device ||
        stat.ino !== snapshots[role].inode ||
        stat.uid !== snapshots[role].uid ||
        stat.nlink !== snapshots[role].nlink ||
        (stat.mode & 0o777) !== snapshots[role].mode ||
        stat.size !== snapshots[role].size ||
        stat.mtimeMs !== snapshots[role].mtimeMs ||
        stat.ctimeMs !== snapshots[role].ctimeMs
      )
        fail('FIREFOX_SUBMIT_FILE_CAPABILITY_DRIFT');
      usedFiles.add(role);
      return fileFromBytes(snapshots[role].bytes, basename(path));
    }

    hashXpiCrcs(path) {
      if (path !== snapshots['unsigned-xpi'].path) fail('FIREFOX_SUBMIT_XPI_CAPABILITY_INVALID');
      const rows = snapshots['unsigned-xpi'].inventory
        .map((entry) => ({ path: entry.path, crc32: entry.crc32 | 0 }))
        .sort((left, right) => (left.path === right.path ? 0 : left.path > right.path ? 1 : -1));
      return Promise.resolve(
        createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex')
      );
    }

    async getPreviousUuidOrUploadXpi(xpiPath, channel, savedUploadUuidPath) {
      if (savedUploadUuidPath !== topology.uuidPath || xpiPath !== snapshots['unsigned-xpi'].path)
        fail('FIREFOX_SUBMIT_UUID_CAPABILITY_INVALID');
      await assertFreshPrivateTarget(savedUploadUuidPath);
      const xpiCrcHash = await this.hashXpiCrcs(xpiPath);
      const uploadUuid = await this.doUploadSubmit(xpiPath, channel);
      await publishCanonicalUuid(savedUploadUuidPath, { uploadUuid, channel, xpiCrcHash });
      return uploadUuid;
    }

    async nodeFetch(url, init) {
      if (fenced) fail('FIREFOX_SUBMIT_FENCED');
      const target = url instanceof URL ? url : new URL(url);
      const method = init?.method ?? 'GET';
      const perRequest =
        activeOperation === 'upload'
          ? FIREFOX_SUBMISSION_LIMITS.uploadMs
          : activeOperation === 'version-submit'
            ? FIREFOX_SUBMISSION_LIMITS.submitMs
            : activeOperation === 'source-patch'
              ? FIREFOX_SUBMISSION_LIMITS.patchMs
              : FIREFOX_SUBMISSION_LIMITS.statusMs;
      const remaining = remainingWhole();
      if (remaining <= 0) {
        fenced = true;
        fail('FIREFOX_SUBMIT_WHOLE_TIMEOUT');
      }
      const controller = new AbortController();
      activeControllers.add(controller);
      let timer;
      const timeout = Math.min(perRequest, remaining);
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          fenced = true;
          controller.abort();
          reject(new Error('FIREFOX_SUBMIT_REQUEST_TIMEOUT'));
        }, timeout);
      });
      timeoutPromise.catch(() => undefined);
      if (fenced) fail('FIREFOX_SUBMIT_FENCED');
      let request;
      try {
        request = Promise.resolve(
          globalThis.fetch(target, {
            ...init,
            signal: controller.signal,
            redirect: 'error'
          })
        );
      } catch (error) {
        request = Promise.reject(error);
      }
      request.then(
        (response) => {
          if (fenced) response.body?.cancel().catch(() => undefined);
        },
        () => undefined
      );
      request.catch(() => undefined);
      if (activeOperation) await onMutationInvoked(activeOperation);
      try {
        const response = await Promise.race([request, timeoutPromise]);
        const body = readResponseBytes(
          response,
          FIREFOX_SUBMISSION_LIMITS.jsonResponseBytes,
          accounting
        );
        body.catch(() => undefined);
        const bytes = await Promise.race([body, timeoutPromise]);
        return new Response(bytes, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } finally {
        clearTimeout(timer);
        activeControllers.delete(controller);
      }
    }

    async waitRetry(successFunc, checkUrl, checkInterval, abortInterval, context) {
      const validation = context === 'Validation';
      const attempts = validation
        ? FIREFOX_SUBMISSION_LIMITS.validationAttempts
        : FIREFOX_SUBMISSION_LIMITS.approvalAttempts;
      const expectedInterval = validation
        ? FIREFOX_SUBMISSION_LIMITS.validationPollMs
        : FIREFOX_SUBMISSION_LIMITS.approvalPollMs;
      const expectedTotal = validation
        ? FIREFOX_SUBMISSION_LIMITS.validationTotalMs
        : FIREFOX_SUBMISSION_LIMITS.approvalTotalMs;
      if (checkInterval !== expectedInterval || abortInterval !== expectedTotal)
        fail('FIREFOX_SUBMIT_POLL_POLICY_INVALID');
      const phaseStartedAt = Date.now();
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (Date.now() - phaseStartedAt >= expectedTotal)
          fail(
            validation ? 'FIREFOX_SUBMIT_VALIDATION_TIMEOUT' : 'FIREFOX_SUBMIT_APPROVAL_TIMEOUT'
          );
        const response = await this.fetchJson(checkUrl, 'GET', undefined, 'Getting details failed');
        if (Date.now() - phaseStartedAt > expectedTotal)
          fail(
            validation ? 'FIREFOX_SUBMIT_VALIDATION_TIMEOUT' : 'FIREFOX_SUBMIT_APPROVAL_TIMEOUT'
          );
        const result = successFunc(response);
        if (result) return result;
        if (attempt + 1 === attempts) break;
        await waitBounded(checkInterval);
      }
      fail(validation ? 'FIREFOX_SUBMIT_VALIDATION_TIMEOUT' : 'FIREFOX_SUBMIT_APPROVAL_TIMEOUT');
    }

    fetchJson(url, method = 'GET', body, errorMessage) {
      const operation = classifyJsonMutation(url, method);
      if (operation === 'new-addon') fail('FIREFOX_SUBMIT_NEW_ADDON_FORBIDDEN');
      if (!operation) return super.fetchJson(url, method, body, errorMessage);
      return runMutation(operation, () => super.fetchJson(url, method, body, errorMessage));
    }

    doFormDataPatch(data, addonId, versionId) {
      return runMutation('source-patch', () => super.doFormDataPatch(data, addonId, versionId));
    }

    async downloadSignedFile(fileUrl, addonId) {
      const primary = fileUrl instanceof URL ? fileUrl : new URL(fileUrl);
      const parts = primary.pathname.match(/^\/api\/v5\/file\/([1-9][0-9]{0,15})\/([^/]+\.xpi)$/u);
      const filename = parts ? decodeURIComponent(parts[2]) : '';
      if (
        primary.origin !== 'https://addons.mozilla.org' ||
        primary.username ||
        primary.password ||
        primary.port ||
        primary.search ||
        primary.hash ||
        !parts ||
        !Number.isSafeInteger(Number(parts[1])) ||
        !safeXpiBasename(filename) ||
        encodeURIComponent(filename) !== parts[2]
      )
        fail('FIREFOX_SUBMIT_SIGNED_URL_INVALID');
      const request = async (url, init, maximumBytes) => {
        const remaining = remainingWhole();
        if (remaining <= 0) fail('FIREFOX_SUBMIT_WHOLE_TIMEOUT');
        const controller = new AbortController();
        activeControllers.add(controller);
        let timer;
        const pending = Promise.resolve().then(() =>
          globalThis.fetch(url, { ...init, signal: controller.signal })
        );
        pending.then(
          (response) => {
            if (fenced) response.body?.cancel().catch(() => undefined);
          },
          () => undefined
        );
        pending.catch(() => undefined);
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(
            () => {
              fenced = true;
              controller.abort();
              reject(new Error('FIREFOX_SUBMIT_DOWNLOAD_TIMEOUT'));
            },
            Math.min(FIREFOX_SUBMISSION_LIMITS.downloadMs, remaining)
          );
        });
        try {
          const response = await Promise.race([pending, timeout]);
          if (response.status === 302) await response.body?.cancel().catch(() => undefined);
          const body =
            response.status === 302
              ? Promise.resolve(null)
              : readResponseBytes(
                  response,
                  maximumBytes,
                  maximumBytes === FIREFOX_SUBMISSION_LIMITS.signedXpiBytes
                    ? { total: 0 }
                    : accounting,
                  maximumBytes === FIREFOX_SUBMISSION_LIMITS.signedXpiBytes
                    ? FIREFOX_SUBMISSION_LIMITS.signedXpiBytes
                    : FIREFOX_SUBMISSION_LIMITS.cumulativeResponseBytes
                );
          body.catch(() => undefined);
          return {
            response,
            bytes: await Promise.race([body, timeout])
          };
        } finally {
          clearTimeout(timer);
          activeControllers.delete(controller);
        }
      };
      const auth = await this.apiAuth.getAuthHeader();
      const primaryResult = await request(
        primary,
        {
          method: 'GET',
          redirect: 'manual',
          headers: {
            Authorization: auth,
            Accept: 'application/x-xpinstall',
            'User-Agent': this.userAgentString
          }
        },
        FIREFOX_SUBMISSION_LIMITS.signedXpiBytes
      );
      let bytes;
      if (primaryResult.response.status === 200) {
        if (primaryResult.response.headers.has('location'))
          fail('FIREFOX_SUBMIT_SIGNED_URL_INVALID');
        bytes = primaryResult.bytes;
      } else if (primaryResult.response.status === 302) {
        const location = primaryResult.response.headers.get('location');
        const digestHeader = primaryResult.response.headers.get('x-target-digest');
        if (!/^sha256:[0-9a-f]{64}$/u.test(digestHeader ?? '') || !location)
          fail('FIREFOX_SUBMIT_SIGNED_REDIRECT_INVALID');
        const mirror = new URL(location);
        const expectedDigest = digestHeader.slice(7);
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
        )
          fail('FIREFOX_SUBMIT_SIGNED_REDIRECT_INVALID');
        const mirrorResult = await request(
          mirror,
          {
            method: 'GET',
            redirect: 'error',
            headers: { Accept: 'application/x-xpinstall', 'User-Agent': this.userAgentString }
          },
          FIREFOX_SUBMISSION_LIMITS.signedXpiBytes
        );
        if (mirrorResult.response.status !== 200) fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
        bytes = mirrorResult.bytes;
        if (createHash('sha256').update(bytes).digest('hex') !== expectedDigest)
          fail('FIREFOX_SUBMIT_SIGNED_DIGEST_MISMATCH');
      } else {
        fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
      }
      if (!bytes?.length) fail('FIREFOX_SUBMIT_SIGNED_DOWNLOAD_FAILED');
      const destination = join(topology.downloadDir, filename);
      const handle = await open(
        destination,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_WRONLY |
          (fsConstants.O_NOFOLLOW ?? 0),
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
          signedManifests.length === 1
            ? JSON.parse(signedManifests[0].content.toString('utf8'))
            : null;
      } catch {
        fail('FIREFOX_SUBMIT_SIGNED_MANIFEST_INVALID');
      }
      const signedGeckoId =
        signedManifest?.browser_specific_settings?.gecko?.id ??
        signedManifest?.applications?.gecko?.id;
      if (
        signedGeckoId !== snapshots.geckoId ||
        signedManifest?.version !== snapshots.manifestVersion
      )
        fail('FIREFOX_SUBMIT_SIGNED_MANIFEST_INVALID');
      const destinationStat = await lstat(destination);
      if (
        !destinationStat.isFile() ||
        destinationStat.isSymbolicLink() ||
        destinationStat.uid !== process.getuid?.() ||
        destinationStat.nlink !== 1 ||
        (destinationStat.mode & 0o777) !== 0o600 ||
        destinationStat.size !== bytes.length
      )
        fail('FIREFOX_SUBMIT_SIGNED_PUBLICATION_INVALID');
      if (JSON.stringify(await readdir(topology.downloadDir)) !== JSON.stringify([filename]))
        fail('FIREFOX_SUBMIT_SIGNED_DIRECTORY_ROSTER');
      const directory = await open(topology.downloadDir, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      return this.returnResult(addonId, [filename]);
    }
  }

  return {
    SubmitClient: JournaledSubmitClient,
    completed: () => nextMutation,
    fence: () => {
      fenced = true;
      for (const controller of activeControllers) controller.abort();
      for (const record of activeWaits) {
        clearTimeout(record.timer);
        record.reject(new Error('FIREFOX_SUBMIT_FENCED'));
      }
      activeWaits.clear();
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
  )
    fail('FIREFOX_SUBMIT_STATE_TOPOLOGY');
  assertContained(attemptRoot, savedUploadUuidPath);
  assertContained(attemptRoot, downloadDir);
  await assertPrivateDirectory(stateRoot);
  await assertFreshPrivateTarget(savedUploadUuidPath);
  await assertPrivateDirectory(dirname(savedUploadUuidPath), { empty: true });
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
  assertPinnedSubmitImplementation();
  if (
    !credentials ||
    JSON.stringify(Object.keys(credentials).sort()) !== JSON.stringify(['apiKey', 'apiSecret'])
  )
    fail('FIREFOX_SUBMIT_CREDENTIALS');
  const apiKey = credentials.apiKey;
  const apiSecret = credentials.apiSecret;
  if (
    typeof apiKey !== 'string' ||
    typeof apiSecret !== 'string' ||
    apiKey.length === 0 ||
    apiSecret.length === 0 ||
    Buffer.byteLength(apiKey) > 4096 ||
    Buffer.byteLength(apiSecret) > 4096
  )
    fail('FIREFOX_SUBMIT_CREDENTIALS');

  let mutationInvoked = false;
  const journaled = createJournaledSubmitClient(
    PinnedSubmitClient,
    mutationJournal,
    Object.freeze({ channel, id, xpi: basename(consumed.xpiPath) }),
    snapshots,
    Object.freeze({ uuidPath: expectedUuidPath, downloadDir: expectedDownloadDir }),
    async (operation) => {
      mutationInvoked = true;
      await mutationJournal.mutationInvoked(
        operation,
        Object.freeze({ channel, id, xpi: basename(consumed.xpiPath) })
      );
    }
  );
  try {
    let wholeTimer;
    const pending = pinnedSignAddon({
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
    pending.catch(() => undefined);
    const result = await Promise.race([
      pending,
      new Promise((_, reject) => {
        wholeTimer = setTimeout(() => {
          journaled.fence();
          reject(new Error('FIREFOX_SUBMIT_WHOLE_TIMEOUT'));
        }, FIREFOX_SUBMISSION_LIMITS.wholeMs);
      })
    ]).finally(() => clearTimeout(wholeTimer));
    if (journaled.completed() !== FIREFOX_SUBMISSION_MUTATIONS.length) {
      fail('FIREFOX_SUBMIT_MUTATION_SEQUENCE_INCOMPLETE');
    }
    if (
      !result ||
      typeof result !== 'object' ||
      result.id !== id ||
      (channel === 'listed'
        ? result.downloadedFiles !== undefined
        : !Array.isArray(result.downloadedFiles) ||
          result.downloadedFiles.length !== 1 ||
          !safeXpiBasename(result.downloadedFiles[0]))
    )
      fail('FIREFOX_SUBMIT_RESULT_INVALID');
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
