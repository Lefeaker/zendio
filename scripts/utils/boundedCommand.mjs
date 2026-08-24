import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  assertClosedKeys,
  canonicalJsonBytes as canonicalPrettyJsonBytes,
  deepFreeze,
  parseJsonBytesStrict
} from '../../tools/npm-audit-regression/canonical-json.mjs';
import {
  COMMAND_BOUNDARY_VERSION,
  COMMAND_REQUEST_FILE,
  REPOSITORY_ROOT,
  resolveCommandProfile,
  validateProfileArguments
} from '../config/commandBoundaryProfiles.mjs';

const OUTPUT_NAMES = ['stdout', 'stderr', 'fd4', 'fd5'];

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function profileArgumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function resultBase(spec, startedAt) {
  return {
    version: COMMAND_BOUNDARY_VERSION,
    profileId: spec.profileId,
    cwd: spec.cwd,
    executable: spec.executable ?? null,
    argv: [...spec.argv],
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
    ok: false,
    terminalReason: 'spawn-error',
    exitCode: null,
    signal: null,
    spawnError: null,
    timedOut: false,
    cancelled: false,
    escalation: [],
    closeObserved: false,
    pipeDrainObserved: false,
    output: {}
  };
}

function immutableResult(value) {
  return deepFreeze(value);
}

function outputState(limit) {
  return {
    bytes: 0,
    captured: [],
    capturedBytes: 0,
    digest: createHash('sha256'),
    drained: false,
    overflow: false,
    limit
  };
}

function captureChunk(state, chunk) {
  const bytes = Buffer.from(chunk);
  state.bytes += bytes.length;
  state.digest.update(bytes);
  const remaining = Math.max(0, state.limit - state.capturedBytes);
  if (remaining > 0) {
    const selected = bytes.subarray(0, remaining);
    state.captured.push(selected);
    state.capturedBytes += selected.length;
  }
  if (state.bytes > state.limit) state.overflow = true;
}

function finalizeOutput(state) {
  return {
    bytes: state.bytes,
    sha256: state.digest.digest('hex'),
    overflow: state.overflow,
    text: Buffer.concat(state.captured).toString('utf8')
  };
}

function safeSignal(child, spec, signal) {
  if (!child.pid || child.pid <= 1) return false;
  try {
    if (spec.detached && process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
    return true;
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
    return false;
  }
}

function publishCiInstallOutputs(spec) {
  const record = spec.ciInstallOutputs;
  if (!record) return;
  const before = lstatSync(record.path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o022) !== 0
  )
    throw new Error('CI_OUTPUT_INVALID');
  const payload = Buffer.from(`${record.lines.join('\n')}\n`, 'utf8');
  const descriptor = openSync(
    record.path,
    constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const opened = fstatSync(descriptor);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      !opened.isFile() ||
      opened.uid !== process.getuid() ||
      opened.nlink !== 1
    )
      throw new Error('CI_OUTPUT_CHANGED');
    let offset = 0;
    while (offset < payload.length) offset += writeSync(descriptor, payload, offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
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

function sha256FileBounded(path, maximumBytes, attemptRoot) {
  return releaseFileSnapshot(attemptRoot, path, maximumBytes).sha256;
}

function releaseDirectoryIdentity(path) {
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    (stats.mode & 0o022) !== 0 ||
    realpathSync(path) !== path
  )
    throw new Error('RELEASE_PATH_PARENT_INVALID');
  return {
    path,
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: String(stats.mode & 0o777),
    modified: String(stats.mtimeMs),
    changed: String(stats.ctimeMs)
  };
}

function releaseParentIdentityChain(attemptRoot, path) {
  if (!contained(attemptRoot, path)) throw new Error('RELEASE_FILE_PATH_INVALID');
  const parents = [];
  let current = attemptRoot;
  parents.push(releaseDirectoryIdentity(current));
  const relativeParent = relative(attemptRoot, dirname(path));
  if (relativeParent !== '') {
    for (const part of relativeParent.split(sep)) {
      current = join(current, part);
      parents.push(releaseDirectoryIdentity(current));
    }
  }
  return parents;
}

function stableFileStats(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function releaseFileSnapshot(attemptRoot, path, maximumBytes = 32 << 20) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !contained(attemptRoot, path)
  )
    throw new Error('RELEASE_FILE_PATH_INVALID');
  const parents = releaseParentIdentityChain(attemptRoot, path);
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o022) !== 0 ||
    before.size > maximumBytes ||
    realpathSync(path) !== path
  )
    throw new Error('RELEASE_FILE_INVALID');
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  let opened;
  try {
    opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.uid !== before.uid ||
      opened.nlink !== 1 ||
      opened.size !== before.size
    )
      throw new Error('RELEASE_FILE_CHANGED');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.mode !== opened.mode ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      bytes.length !== opened.size
    )
      throw new Error('RELEASE_FILE_CHANGED');
  } finally {
    closeSync(descriptor);
  }
  return {
    path,
    device: String(opened.dev),
    inode: String(opened.ino),
    mode: String(opened.mode & 0o777),
    size: String(opened.size),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    parents
  };
}

function readStableOwnedFile(path, maximumBytes, attemptRoot, requiredMode = 0o600) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !contained(attemptRoot, path)
  )
    throw new Error('RELEASE_JSON_PATH_INVALID');
  const parentsBefore = releaseParentIdentityChain(attemptRoot, path);
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== requiredMode ||
    before.size > maximumBytes ||
    realpathSync(path) !== path
  )
    throw new Error('RELEASE_JSON_INVALID');
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  let opened;
  try {
    opened = fstatSync(descriptor);
    if (!opened.isFile() || !stableFileStats(before, opened))
      throw new Error('RELEASE_JSON_CHANGED');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (!stableFileStats(opened, after) || bytes.length !== opened.size)
      throw new Error('RELEASE_JSON_CHANGED');
  } finally {
    closeSync(descriptor);
  }
  const current = lstatSync(path);
  const parentsAfter = releaseParentIdentityChain(attemptRoot, path);
  if (
    !stableFileStats(opened, current) ||
    realpathSync(path) !== path ||
    JSON.stringify(parentsBefore) !== JSON.stringify(parentsAfter)
  )
    throw new Error('RELEASE_JSON_CHANGED');
  return {
    bytes,
    stats: opened,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

function readCanonicalJsonDescriptor(
  path,
  maximumBytes,
  maximumDepth,
  attemptRoot,
  format = 'compact'
) {
  const record = readStableOwnedFile(path, maximumBytes, attemptRoot);
  const value = parseJsonBytesStrict(record.bytes, { path, maximumDepth });
  const expected =
    format === 'pretty'
      ? canonicalPrettyJsonBytes(value)
      : Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (!record.bytes.equals(expected)) throw new Error('RELEASE_JSON_NONCANONICAL');
  return { ...record, value };
}

function assertReleaseFileSnapshotStable(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('RELEASE_MANIFEST_CHANGED');
}

function assertReleaseFileReceipt(snapshot, receipt) {
  if (
    receipt.manifestPath !== snapshot.path ||
    receipt.manifestDevice !== snapshot.device ||
    receipt.manifestInode !== snapshot.inode ||
    receipt.manifestMode !== snapshot.mode ||
    receipt.manifestSize !== snapshot.size ||
    receipt.manifestSha256 !== snapshot.sha256
  )
    throw new Error('ARTIFACT_RECEIPT_MANIFEST_INVALID');
}

function ensurePrivateDirectory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
    chmodSync(path, 0o700);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    (stats.mode & 0o777) !== 0o700 ||
    realpathSync(path) !== path
  )
    throw new Error('RELEASE_DIRECTORY_INVALID');
  return path;
}

function writeExclusiveCanonicalJson(path, value, attemptRoot) {
  releaseParentIdentityChain(attemptRoot, path);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (bytes.length > 64 * 1024) throw new Error('RELEASE_JSON_LIMIT');
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  let opened;
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
    opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.uid !== process.getuid() || opened.nlink !== 1)
      throw new Error('RELEASE_JSON_IDENTITY');
  } finally {
    closeSync(descriptor);
  }
  const stats = lstatSync(path);
  if (
    !stableFileStats(opened, stats) ||
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600 ||
    realpathSync(path) !== path
  )
    throw new Error('RELEASE_JSON_PUBLICATION');
  const parent = openSync(dirname(path), constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: String(stats.mode & 0o777),
    size: String(stats.size)
  };
}

function appendGithubOutput(path, lines, { requireEmpty = false } = {}) {
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o022) !== 0
  )
    throw new Error('CI_OUTPUT_INVALID');
  const prefix = readFileSync(path);
  if (requireEmpty && prefix.length !== 0) throw new Error('CI_OUTPUT_NOT_EMPTY');
  const payload = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const opened = fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
      throw new Error('CI_OUTPUT_CHANGED');
    let offset = 0;
    while (offset < payload.length) offset += writeSync(descriptor, payload, offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const after = readFileSync(path);
  if (
    !after.subarray(0, prefix.length).equals(prefix) ||
    !after.subarray(prefix.length).equals(payload)
  )
    throw new Error('CI_OUTPUT_CHANGED');
}

function releaseResult(spec) {
  const context = spec.commandContext;
  const { value } = readCanonicalJsonDescriptor(
    context.resultPath,
    64 * 1024,
    16,
    context.attemptRoot,
    'pretty'
  );
  const browser = context.browser;
  const fields = browser === 'chrome' ? ['manifestPath', 'zipPath'] : ['manifestPath', 'xpiPath'];
  const paths = fields.map((field) => value[field]);
  if (paths.some((path) => typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path))
    throw new Error('RELEASE_RESULT_INVALID');
  if (new Set(paths).size !== paths.length) throw new Error('RELEASE_RESULT_ALIAS');
  for (const path of paths) {
    if (!contained(context.attemptRoot, path)) throw new Error('RELEASE_RESULT_OUTSIDE_ATTEMPT');
    sha256FileBounded(path, 64 << 20, context.attemptRoot);
  }
  return { value, fields, paths };
}

function releaseStatePaths(attemptRoot, browser) {
  const root = join(attemptRoot, 'store-state', browser);
  return {
    root,
    statePath: join(root, browser === 'chrome' ? 'publish-state.json' : 'submission-state.json'),
    artifactReceiptPath: join(attemptRoot, 'receipts', `${browser}-artifact-verification.json`),
    bindingReceiptPath: join(attemptRoot, 'receipts', `${browser}-state-binding.json`),
    uuidPath: browser === 'firefox' ? join(root, 'web-ext-upload', 'upload-uuid.json') : null
  };
}

function readCanonicalOwnedJson(path, maximumBytes = 64 * 1024, attemptRoot) {
  if (!attemptRoot) throw new Error('RELEASE_JSON_ROOT_REQUIRED');
  return readCanonicalJsonDescriptor(path, maximumBytes, 32, attemptRoot);
}

function startResolvedCommand(spec, dependencies = {}) {
  const spawnOperation = dependencies.spawnOperation ?? spawn;
  const now = dependencies.now ?? (() => performance.now());
  const scheduleTimer = dependencies.setTimeoutOperation ?? setTimeout;
  const cancelTimer = dependencies.clearTimeoutOperation ?? clearTimeout;
  const signalSource = dependencies.signalSource ?? process;
  const mirrorOutput = dependencies.mirrorOutput ?? false;
  const startedAt = now();
  let child;
  try {
    child = spawnOperation(spec.executable, spec.argv, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      detached: spec.detached,
      stdio: spec.stdio
    });
  } catch (error) {
    const result = resultBase(spec, startedAt);
    result.endedAt = now();
    result.durationMs = result.endedAt - result.startedAt;
    result.spawnError = error instanceof Error ? error.message : String(error);
    result.output = Object.fromEntries(
      OUTPUT_NAMES.map((name) => [
        name,
        { bytes: 0, sha256: createHash('sha256').digest('hex'), overflow: false, text: '' }
      ])
    );
    return {
      cancel: () => false,
      completion: Promise.resolve(immutableResult(result)),
      child: null,
      spec
    };
  }

  const outputs = {
    stdout: outputState(spec.limits.stdoutBytes),
    stderr: outputState(spec.limits.stderrBytes),
    fd4: outputState(spec.limits.fd4Bytes),
    fd5: outputState(spec.limits.fd5Bytes)
  };
  const streams = {
    stdout: child.stdout,
    stderr: child.stderr,
    fd4: child.stdio?.[4],
    fd5: child.stdio?.[5]
  };
  let timeoutTimer;
  let termTimer;
  let killTimer;
  let closed = false;
  let exitObserved = false;
  let exitCode = null;
  let exitSignal = null;
  let spawnError = null;
  let requestedReason = null;
  let settled = false;
  const escalation = [];
  const parentSignals = new Map();
  let resolveCompletion;
  const completion = new Promise((resolvePromise) => {
    resolveCompletion = resolvePromise;
  });

  function clearOwnedResources() {
    for (const timer of [timeoutTimer, termTimer, killTimer]) if (timer) cancelTimer(timer);
    for (const [name, listener] of parentSignals) signalSource.off?.(name, listener);
  }

  function allDrained() {
    return Object.values(outputs).every((state) => state.drained);
  }

  function finishIfReady(force = false) {
    if (settled || (!force && (!closed || !allDrained()))) return;
    settled = true;
    clearOwnedResources();
    const endedAt = now();
    const overflow = Object.values(outputs).some((state) => state.overflow);
    const terminalReason =
      requestedReason ??
      (spawnError
        ? 'spawn-error'
        : overflow
          ? 'output-overflow'
          : exitSignal
            ? 'signal'
            : exitCode === 0
              ? 'success'
              : 'nonzero');
    const result = {
      version: COMMAND_BOUNDARY_VERSION,
      profileId: spec.profileId,
      cwd: spec.cwd,
      executable: spec.executable,
      argv: [...spec.argv],
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      ok: terminalReason === 'success',
      terminalReason,
      exitCode,
      signal: exitSignal,
      spawnError,
      timedOut: terminalReason === 'timeout',
      cancelled:
        terminalReason === 'cancelled' ||
        terminalReason === 'parent-signal' ||
        terminalReason === 'root-deadline',
      escalation: [...escalation],
      closeObserved: closed,
      pipeDrainObserved: allDrained(),
      output: Object.fromEntries(OUTPUT_NAMES.map((name) => [name, finalizeOutput(outputs[name])]))
    };
    resolveCompletion(immutableResult(result));
  }

  function forceDrain() {
    for (const [name, stream] of Object.entries(streams)) {
      if (!outputs[name].drained) {
        stream?.destroy?.();
        outputs[name].drained = true;
      }
    }
  }

  function cancel(reason = 'cancelled') {
    if (spec.platformOwned) return false;
    if (settled || requestedReason) return false;
    requestedReason = reason;
    const delivered = safeSignal(child, spec, 'SIGTERM');
    escalation.push({ signal: 'SIGTERM', delivered });
    termTimer = scheduleTimer(() => {
      if (settled || closed) return;
      const killed = safeSignal(child, spec, 'SIGKILL');
      escalation.push({ signal: 'SIGKILL', delivered: killed });
      killTimer = scheduleTimer(() => {
        if (settled) return;
        forceDrain();
        finishIfReady(true);
      }, spec.limits.killMs);
    }, spec.limits.termMs);
    return true;
  }

  for (const [name, stream] of Object.entries(streams)) {
    if (!stream) {
      outputs[name].drained = true;
      continue;
    }
    const destination = name === 'stdout' ? process.stdout : process.stderr;
    stream.on('data', (chunk) => {
      const before = outputs[name].overflow;
      captureChunk(outputs[name], chunk);
      if (mirrorOutput && !before) {
        const allowed = Math.max(
          0,
          outputs[name].limit - (outputs[name].bytes - Buffer.byteLength(chunk))
        );
        if (allowed > 0) destination.write(Buffer.from(chunk).subarray(0, allowed));
      }
      if (!before && outputs[name].overflow) cancel('output-overflow');
    });
    const drained = () => {
      outputs[name].drained = true;
      finishIfReady();
    };
    stream.once('end', drained);
    stream.once('close', drained);
  }

  if (spec.fd3Input !== undefined && child.stdio?.[3]?.writable) {
    child.stdio[3].end(Buffer.from(spec.fd3Input));
  }

  child.once('error', (error) => {
    spawnError = error instanceof Error ? error.message : String(error);
    requestedReason ??= 'spawn-error';
  });
  child.once('exit', (code, signal) => {
    exitObserved = true;
    exitCode = code;
    exitSignal = signal;
  });
  child.once('close', (code, signal) => {
    closed = true;
    if (!exitObserved) {
      exitCode = code;
      exitSignal = signal;
    }
    finishIfReady();
  });

  if (!spec.platformOwned) {
    timeoutTimer = scheduleTimer(() => cancel('timeout'), spec.limits.activeMs);
    for (const name of ['SIGINT', 'SIGTERM']) {
      const listener = () => cancel('parent-signal');
      parentSignals.set(name, listener);
      signalSource.on?.(name, listener);
    }
  }
  return { cancel, completion, child, spec };
}

function syntheticResult(profileId, ok, terminalReason, stdout = '', stderr = '', details = {}) {
  const stamp = performance.now();
  const output =
    details.output ??
    Object.fromEntries(
      OUTPUT_NAMES.map((name) => {
        const text = name === 'stdout' ? stdout : name === 'stderr' ? stderr : '';
        return [
          name,
          {
            bytes: Buffer.byteLength(text),
            sha256: createHash('sha256').update(text).digest('hex'),
            overflow: false,
            text
          }
        ];
      })
    );
  const cancelled =
    details.cancelled ?? ['cancelled', 'parent-signal', 'root-deadline'].includes(terminalReason);
  return immutableResult({
    version: COMMAND_BOUNDARY_VERSION,
    profileId,
    cwd: realpathSync(REPOSITORY_ROOT),
    executable: null,
    argv: [],
    startedAt: stamp,
    endedAt: stamp,
    durationMs: 0,
    ok,
    terminalReason,
    exitCode: Object.hasOwn(details, 'exitCode') ? details.exitCode : ok ? 0 : 1,
    signal: details.signal ?? null,
    spawnError: details.spawnError ?? null,
    timedOut: details.timedOut ?? terminalReason === 'timeout',
    cancelled,
    escalation: [...(details.escalation ?? [])],
    closeObserved: details.closeObserved ?? true,
    pipeDrainObserved: details.pipeDrainObserved ?? true,
    output
  });
}

function remapPhaseResult(profileId, result, terminalReason = result.terminalReason, cancelled) {
  const isCancelled = cancelled ?? result.cancelled;
  return syntheticResult(
    profileId,
    terminalReason === 'success' && !isCancelled,
    terminalReason,
    result.output.stdout.text,
    result.output.stderr.text,
    {
      exitCode: result.exitCode,
      signal: result.signal,
      spawnError: result.spawnError,
      timedOut: result.timedOut || terminalReason === 'timeout',
      cancelled: isCancelled,
      escalation: result.escalation,
      closeObserved: result.closeObserved,
      pipeDrainObserved: result.pipeDrainObserved,
      output: result.output
    }
  );
}

function currentReleaseIdentity() {
  return {
    releaseSha: gitValue(['rev-parse', 'HEAD']),
    releaseTree: gitValue(['rev-parse', 'HEAD^{tree}']),
    packageSha256: createHash('sha256')
      .update(readFileSync(join(REPOSITORY_ROOT, 'package.json')))
      .digest('hex'),
    lockSha256: createHash('sha256')
      .update(readFileSync(join(REPOSITORY_ROOT, 'package-lock.json')))
      .digest('hex')
  };
}

const ARTIFACT_RECEIPT_KEYS = [
  'schema',
  'browser',
  'transport',
  'attemptRoot',
  'jobClass',
  'runId',
  'runAttempt',
  'verifierProfile',
  'terminalStatus',
  'releaseSha',
  'releaseTree',
  'manifestPath',
  'manifestDevice',
  'manifestInode',
  'manifestMode',
  'manifestSize',
  'manifestSha256'
];

const RELEASE_STATE_REQUIRED_KEYS = [
  'schema',
  'browser',
  'releaseSha',
  'releaseTree',
  'artifactReceiptSha256',
  'manifestPath',
  'manifestSha256',
  'stage',
  'outcome',
  'mutationInvoked',
  'retrySafe'
];

const RELEASE_STATE_OPTIONAL_KEYS = ['lastStartedOperation', 'lastCompletedOperation'];

const STORE_ACTION_SEQUENCES = deepFreeze({
  chrome: ['upload', 'publish'],
  firefox: ['upload', 'version-submit', 'source-patch']
});

const STATE_BINDING_KEYS = [
  'schema',
  'browser',
  'attemptRoot',
  'statePath',
  'stateDevice',
  'stateInode',
  'stateMode',
  'stateSize',
  'stateSha256',
  'artifactReceiptSha256',
  'manifestPath',
  'manifestSha256',
  'releaseSha',
  'releaseTree'
];

function validateArtifactReceipt(spec, artifact, expectedManifestPath, expectedManifestSha256) {
  const context = spec.commandContext;
  const value = artifact.value;
  assertClosedKeys(value, ARTIFACT_RECEIPT_KEYS, 'artifact verification receipt');
  const identity = currentReleaseIdentity();
  if (
    value.schema !== 'zendio-artifact-verification-receipt-v1' ||
    value.browser !== context.browser ||
    value.transport !== 'github-artifact-v1' ||
    value.attemptRoot !== context.attemptRoot ||
    value.jobClass !== spec.env.ZENDIO_JOB_CLASS ||
    value.runId !== spec.env.GITHUB_RUN_ID ||
    value.runAttempt !== spec.env.GITHUB_RUN_ATTEMPT ||
    value.verifierProfile !== `${context.browser}-verify-v1` ||
    value.terminalStatus !== 'success' ||
    value.releaseSha !== identity.releaseSha ||
    value.releaseTree !== identity.releaseTree ||
    !/^[0-9a-f]{64}$/u.test(value.manifestSha256 ?? '') ||
    !/^[0-9]+$/u.test(value.manifestDevice ?? '') ||
    !/^[0-9]+$/u.test(value.manifestInode ?? '') ||
    !/^[0-9]+$/u.test(value.manifestMode ?? '') ||
    !/^[0-9]+$/u.test(value.manifestSize ?? '') ||
    (expectedManifestPath !== undefined && value.manifestPath !== expectedManifestPath) ||
    (expectedManifestSha256 !== undefined && value.manifestSha256 !== expectedManifestSha256)
  )
    throw new Error('ARTIFACT_RECEIPT_INVALID');
  const snapshot = releaseFileSnapshot(context.attemptRoot, value.manifestPath, 32 << 20);
  assertReleaseFileReceipt(snapshot, value);
  return { identity, snapshot };
}

function validateReleaseStateValue(
  value,
  context,
  artifactDigest,
  artifactValue,
  identity,
  { childOk, allowInitial = true } = {}
) {
  const keys = Object.keys(value);
  if (
    RELEASE_STATE_REQUIRED_KEYS.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        !RELEASE_STATE_REQUIRED_KEYS.includes(key) && !RELEASE_STATE_OPTIONAL_KEYS.includes(key)
    )
  )
    throw new Error('RELEASE_STATE_INVALID');
  const actions = STORE_ACTION_SEQUENCES[context.browser];
  if (!actions) throw new Error('RELEASE_STATE_INVALID');
  for (const key of RELEASE_STATE_OPTIONAL_KEYS) {
    if (value[key] !== undefined && !actions.includes(value[key]))
      throw new Error('RELEASE_STATE_INVALID');
  }
  if (
    value.schema !== 'zendio-release-store-state-v1' ||
    value.browser !== context.browser ||
    value.releaseSha !== identity.releaseSha ||
    value.releaseTree !== identity.releaseTree ||
    value.artifactReceiptSha256 !== artifactDigest ||
    value.manifestPath !== artifactValue.manifestPath ||
    value.manifestSha256 !== artifactValue.manifestSha256 ||
    typeof value.stage !== 'string' ||
    value.stage.length === 0 ||
    Buffer.byteLength(value.stage) > 128 ||
    typeof value.outcome !== 'string' ||
    !['not-started', 'pre-mutation-failure', 'unknown-submission-state', 'success'].includes(
      value.outcome
    ) ||
    Buffer.byteLength(value.outcome) > 128 ||
    typeof value.mutationInvoked !== 'boolean' ||
    typeof value.retrySafe !== 'boolean' ||
    (value.mutationInvoked && value.retrySafe) ||
    (!value.mutationInvoked && !value.retrySafe)
  )
    throw new Error('RELEASE_STATE_INVALID');
  const startedIndex =
    value.lastStartedOperation === undefined ? -1 : actions.indexOf(value.lastStartedOperation);
  const completedIndex =
    value.lastCompletedOperation === undefined ? -1 : actions.indexOf(value.lastCompletedOperation);
  if (
    completedIndex > startedIndex ||
    startedIndex - completedIndex > 1 ||
    (startedIndex < 0 && completedIndex >= 0)
  )
    throw new Error('RELEASE_STATE_ACTION_SEQUENCE_INVALID');
  const expectedStage =
    startedIndex < 0
      ? 'preflight'
      : startedIndex === completedIndex
        ? `${actions[startedIndex]}-completed`
        : `${actions[startedIndex]}-started`;
  const initial = value.outcome === 'not-started';
  if (
    (initial &&
      (!allowInitial ||
        value.stage !== 'preflight' ||
        value.mutationInvoked !== false ||
        value.retrySafe !== true ||
        startedIndex !== -1 ||
        completedIndex !== -1)) ||
    (value.outcome === 'pre-mutation-failure' &&
      (value.stage !== 'preflight' ||
        value.mutationInvoked !== false ||
        value.retrySafe !== true ||
        startedIndex !== -1 ||
        completedIndex !== -1 ||
        childOk === true)) ||
    (value.outcome === 'unknown-submission-state' &&
      (value.stage !== expectedStage ||
        value.mutationInvoked !== true ||
        value.retrySafe !== false ||
        startedIndex < 0 ||
        childOk === true)) ||
    (value.outcome === 'success' &&
      (value.stage !== `${actions.at(-1)}-completed` ||
        value.mutationInvoked !== true ||
        value.retrySafe !== false ||
        startedIndex !== actions.length - 1 ||
        completedIndex !== actions.length - 1 ||
        childOk === false))
  )
    throw new Error('RELEASE_STATE_TERMINAL_INVALID');
}

function validateStateBinding(spec, { requireInitial = false } = {}) {
  const context = spec.commandContext;
  const paths = releaseStatePaths(context.attemptRoot, context.browser);
  const artifact = readCanonicalOwnedJson(
    paths.artifactReceiptPath,
    64 * 1024,
    context.attemptRoot
  );
  const artifactValidation = validateArtifactReceipt(
    spec,
    artifact,
    context.manifestPath,
    context.expectedManifestSha256
  );
  const binding = readCanonicalOwnedJson(paths.bindingReceiptPath, 64 * 1024, context.attemptRoot);
  const state = readCanonicalOwnedJson(paths.statePath, 16 * 1024, context.attemptRoot);
  assertClosedKeys(binding.value, STATE_BINDING_KEYS, 'release state binding');
  const artifactDigest = createHash('sha256').update(artifact.bytes).digest('hex');
  const stateDigest = createHash('sha256').update(state.bytes).digest('hex');
  if (
    binding.value.schema !== 'zendio-release-state-binding-v1' ||
    binding.value.browser !== context.browser ||
    binding.value.attemptRoot !== context.attemptRoot ||
    binding.value.statePath !== paths.statePath ||
    binding.value.artifactReceiptSha256 !== artifactDigest ||
    binding.value.manifestPath !== artifact.value.manifestPath ||
    binding.value.manifestSha256 !== artifact.value.manifestSha256 ||
    binding.value.releaseSha !== artifactValidation.identity.releaseSha ||
    binding.value.releaseTree !== artifactValidation.identity.releaseTree
  )
    throw new Error('RELEASE_STATE_BINDING_INVALID');
  validateReleaseStateValue(
    state.value,
    context,
    artifactDigest,
    artifact.value,
    artifactValidation.identity
  );
  const initial = state.value.stage === 'preflight' && state.value.outcome === 'not-started';
  if (
    (requireInitial &&
      (!initial || state.value.mutationInvoked !== false || state.value.retrySafe !== true)) ||
    binding.value.stateDevice !== String(state.stats.dev) ||
    binding.value.stateInode !== String(state.stats.ino) ||
    binding.value.stateMode !== String(state.stats.mode & 0o777) ||
    binding.value.stateSize !== String(state.stats.size) ||
    binding.value.stateSha256 !== stateDigest
  )
    throw new Error('RELEASE_STATE_BINDING_INVALID');
  return { paths, artifact, binding, state, artifactValidation };
}

function executeInProcessProfile(spec) {
  const context = spec.commandContext;
  if (spec.operation === 'release-result-field-v1') {
    const result = releaseResult(spec);
    const selected = result.value[context.field];
    return syntheticResult(spec.profileId, true, 'success', selected);
  }
  if (spec.operation === 'release-job-outputs-v1') {
    if (typeof context.githubOutputPath !== 'string') throw new Error('CI_OUTPUT_INVALID');
    const result = releaseResult(spec);
    const identity = currentReleaseIdentity();
    for (const [key, value] of Object.entries(identity)) {
      if (result.value[key] !== undefined && result.value[key] !== value)
        throw new Error('RELEASE_RESULT_IDENTITY_MISMATCH');
    }
    const releaseManifestSha256 = sha256FileBounded(
      result.value.manifestPath,
      32 << 20,
      context.attemptRoot
    );
    appendGithubOutput(
      context.githubOutputPath,
      [
        `release_sha=${identity.releaseSha}`,
        `release_tree=${identity.releaseTree}`,
        `package_sha256=${identity.packageSha256}`,
        `lock_sha256=${identity.lockSha256}`,
        `release_manifest_sha256=${releaseManifestSha256}`
      ],
      { requireEmpty: true }
    );
    return syntheticResult(spec.profileId, true, 'success');
  }
  if (spec.operation === 'release-state-init-v1') {
    const paths = releaseStatePaths(context.attemptRoot, context.browser);
    const artifact = readCanonicalOwnedJson(
      paths.artifactReceiptPath,
      64 * 1024,
      context.attemptRoot
    );
    const artifactValidation = validateArtifactReceipt(spec, artifact);
    const identity = artifactValidation.identity;
    const artifactDigest = createHash('sha256').update(artifact.bytes).digest('hex');
    for (const path of [join(context.attemptRoot, 'store-state'), paths.root]) {
      try {
        lstatSync(path);
        throw new Error('RELEASE_STATE_ROOT_PREEXISTS');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    ensurePrivateDirectory(join(context.attemptRoot, 'store-state'));
    ensurePrivateDirectory(paths.root);
    if (context.browser === 'firefox') {
      ensurePrivateDirectory(join(paths.root, 'web-ext-upload'));
      ensurePrivateDirectory(join(paths.root, 'downloads'));
      try {
        lstatSync(paths.uuidPath);
        throw new Error('FIREFOX_UUID_PREEXISTS');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    const state = {
      schema: 'zendio-release-store-state-v1',
      browser: context.browser,
      releaseSha: identity.releaseSha,
      releaseTree: identity.releaseTree,
      artifactReceiptSha256: artifactDigest,
      manifestPath: artifact.value.manifestPath,
      manifestSha256: artifact.value.manifestSha256,
      stage: 'preflight',
      outcome: 'not-started',
      mutationInvoked: false,
      retrySafe: true
    };
    const publication = writeExclusiveCanonicalJson(paths.statePath, state, context.attemptRoot);
    const binding = {
      schema: 'zendio-release-state-binding-v1',
      browser: context.browser,
      attemptRoot: context.attemptRoot,
      statePath: paths.statePath,
      stateDevice: publication.device,
      stateInode: publication.inode,
      stateMode: publication.mode,
      stateSize: publication.size,
      stateSha256: publication.sha256,
      artifactReceiptSha256: state.artifactReceiptSha256,
      manifestPath: state.manifestPath,
      manifestSha256: state.manifestSha256,
      releaseSha: identity.releaseSha,
      releaseTree: identity.releaseTree
    };
    writeExclusiveCanonicalJson(paths.bindingReceiptPath, binding, context.attemptRoot);
    return syntheticResult(spec.profileId, true, 'success');
  }
  if (spec.operation === 'release-state-check-v1') {
    const { state } = validateStateBinding(spec);
    const value = state.value;
    return syntheticResult(
      spec.profileId,
      true,
      'success',
      `${canonicalJson({
        browser: value.browser,
        mutationInvoked: value.mutationInvoked,
        outcome: value.outcome,
        retrySafe: value.retrySafe,
        stage: value.stage
      })}\n`
    );
  }
  throw new Error('IN_PROCESS_PROFILE_INVALID');
}

function startInProcessProfile(spec) {
  let result;
  try {
    result = executeInProcessProfile(spec);
  } catch (error) {
    result = syntheticResult(
      spec.profileId,
      false,
      error instanceof Error ? error.message : 'IN_PROCESS_PROFILE_FAILED'
    );
  }
  return { cancel: () => false, completion: Promise.resolve(result), child: null, spec };
}

function publishArtifactVerificationReceipt(spec, before) {
  const context = spec.commandContext;
  if (!context || context.transport !== 'github-artifact-v1') return;
  if (!before) throw new Error('RELEASE_MANIFEST_PRECONDITION_MISSING');
  const after = releaseFileSnapshot(context.attemptRoot, context.manifestPath, 32 << 20);
  assertReleaseFileSnapshotStable(before, after);
  if (after.sha256 !== context.expectedManifestSha256)
    throw new Error('RELEASE_MANIFEST_DIGEST_MISMATCH');
  const receipts = ensurePrivateDirectory(join(context.attemptRoot, 'receipts'));
  const identity = currentReleaseIdentity();
  const receipt = {
    schema: 'zendio-artifact-verification-receipt-v1',
    browser: context.browser,
    transport: context.transport,
    attemptRoot: context.attemptRoot,
    jobClass: spec.env.ZENDIO_JOB_CLASS,
    runId: spec.env.GITHUB_RUN_ID,
    runAttempt: spec.env.GITHUB_RUN_ATTEMPT,
    verifierProfile: spec.profileId,
    terminalStatus: 'success',
    releaseSha: identity.releaseSha,
    releaseTree: identity.releaseTree,
    manifestPath: context.manifestPath,
    manifestDevice: after.device,
    manifestInode: after.inode,
    manifestMode: after.mode,
    manifestSize: after.size,
    manifestSha256: after.sha256
  };
  writeExclusiveCanonicalJson(
    join(receipts, `${context.browser}-artifact-verification.json`),
    receipt,
    context.attemptRoot
  );
}

function assertStoreProfilePreconditions(spec) {
  if (!['chrome-publish-v1', 'firefox-submit-v1'].includes(spec.profileId)) return;
  const context = spec.commandContext;
  const paths = releaseStatePaths(context.attemptRoot, context.browser);
  if (context.statePath !== paths.statePath) throw new Error('RELEASE_STATE_PATH_INVALID');
  if (
    context.manifestPath === undefined ||
    context.expectedManifestSha256 === undefined ||
    !/^[0-9a-f]{64}$/u.test(context.expectedManifestSha256)
  )
    throw new Error('RELEASE_MANIFEST_BINDING_MISSING');
  const validation = validateStateBinding(spec, { requireInitial: true });
  if (context.browser === 'firefox') {
    if (profileArgumentValue(spec.argv, '--saved-upload-uuid-path') !== paths.uuidPath)
      throw new Error('FIREFOX_UUID_PATH_INVALID');
    try {
      lstatSync(paths.uuidPath);
      throw new Error('FIREFOX_UUID_PREEXISTS');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return validation;
}

function assertCanonicalRecordEqual(actual, expected, code) {
  if (!actual.bytes.equals(expected.bytes) || !stableFileStats(actual.stats, expected.stats))
    throw new Error(code);
}

function refreshStoreStateBinding(spec, initial, result) {
  if (!result.closeObserved || !result.pipeDrainObserved)
    throw new Error('RELEASE_STORE_CHILD_NOT_DRAINED');
  const context = spec.commandContext;
  const currentArtifact = readCanonicalOwnedJson(
    initial.paths.artifactReceiptPath,
    64 * 1024,
    context.attemptRoot
  );
  assertCanonicalRecordEqual(
    currentArtifact,
    initial.artifact,
    'ARTIFACT_RECEIPT_CHANGED_DURING_STORE'
  );
  const artifactValidation = validateArtifactReceipt(
    spec,
    currentArtifact,
    context.manifestPath,
    context.expectedManifestSha256
  );
  const currentBinding = readCanonicalOwnedJson(
    initial.paths.bindingReceiptPath,
    64 * 1024,
    context.attemptRoot
  );
  assertCanonicalRecordEqual(currentBinding, initial.binding, 'RELEASE_STATE_BINDING_CAS_MISMATCH');
  const terminalState = readCanonicalOwnedJson(
    initial.paths.statePath,
    16 * 1024,
    context.attemptRoot
  );
  const artifactDigest = createHash('sha256').update(currentArtifact.bytes).digest('hex');
  validateReleaseStateValue(
    terminalState.value,
    context,
    artifactDigest,
    currentArtifact.value,
    artifactValidation.identity,
    { childOk: result.ok, allowInitial: false }
  );
  const nextBinding = {
    ...initial.binding.value,
    stateDevice: String(terminalState.stats.dev),
    stateInode: String(terminalState.stats.ino),
    stateMode: String(terminalState.stats.mode & 0o777),
    stateSize: String(terminalState.stats.size),
    stateSha256: terminalState.sha256
  };
  const nextPath = `${initial.paths.bindingReceiptPath}.next`;
  writeExclusiveCanonicalJson(nextPath, nextBinding, context.attemptRoot);
  const bindingCas = readCanonicalOwnedJson(
    initial.paths.bindingReceiptPath,
    64 * 1024,
    context.attemptRoot
  );
  const stateCas = readCanonicalOwnedJson(initial.paths.statePath, 16 * 1024, context.attemptRoot);
  assertCanonicalRecordEqual(bindingCas, initial.binding, 'RELEASE_STATE_BINDING_CAS_MISMATCH');
  assertCanonicalRecordEqual(stateCas, terminalState, 'RELEASE_STATE_CAS_MISMATCH');
  renameSync(nextPath, initial.paths.bindingReceiptPath);
  const parent = openSync(
    dirname(initial.paths.bindingReceiptPath),
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
  );
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  const publishedBinding = readCanonicalOwnedJson(
    initial.paths.bindingReceiptPath,
    64 * 1024,
    context.attemptRoot
  );
  const publishedState = readCanonicalOwnedJson(
    initial.paths.statePath,
    16 * 1024,
    context.attemptRoot
  );
  if (!publishedBinding.bytes.equals(Buffer.from(`${canonicalJson(nextBinding)}\n`, 'utf8')))
    throw new Error('RELEASE_STATE_BINDING_PUBLICATION_INVALID');
  assertCanonicalRecordEqual(publishedState, terminalState, 'RELEASE_STATE_CHANGED_AFTER_REFRESH');
  validateStateBinding(spec);
}

function storePostconditionFailure(spec, result, error) {
  return syntheticResult(
    spec.profileId,
    false,
    error instanceof Error ? error.message : 'RELEASE_STORE_POSTCONDITION_FAILED',
    result.output.stdout.text,
    result.output.stderr.text,
    {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      cancelled: result.cancelled,
      escalation: result.escalation,
      closeObserved: result.closeObserved,
      pipeDrainObserved: result.pipeDrainObserved,
      output: result.output
    }
  );
}

function wrapStoreCompletion(handle, initial) {
  if (!initial) return handle;
  return {
    ...handle,
    completion: handle.completion.then((result) => {
      try {
        refreshStoreStateBinding(handle.spec, initial, result);
        return result;
      } catch (error) {
        return storePostconditionFailure(handle.spec, result, error);
      }
    })
  };
}

function assertFirefoxExecutionPreconditions(spec) {
  const context = spec.commandContext;
  if (!context?.firefoxExecution) return;
  const runId = spec.env.GITHUB_RUN_ID;
  const runAttempt = spec.env.GITHUB_RUN_ATTEMPT;
  const job = spec.env.GITHUB_JOB;
  const runnerTemp = spec.env.RUNNER_TEMP;
  const expectedAttemptRoot =
    context.firefoxExecutionClass === 'release'
      ? spec.env.CI === 'true'
        ? join(realpathSync(runnerTemp), `zendio-firefox-${runId}-${runAttempt}`)
        : spec.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT
      : context.firefoxExecutionClass === 'ordinary-ci'
        ? join(realpathSync(runnerTemp), `zendio-ci-node-${runId}-${runAttempt}-${job}`)
        : context.firefoxExecutionClass === 'protected-verifier'
          ? join(realpathSync(runnerTemp), `zendio-firefox-submit-${runId}-${runAttempt}`)
          : null;
  if (expectedAttemptRoot !== context.attemptRoot)
    throw new Error('PLAYWRIGHT_PHASE_ATTEMPT_ROOT_INVALID');
  releaseDirectoryIdentity(context.attemptRoot);
  releaseDirectoryIdentity(join(context.attemptRoot, 'install'));
  if (
    context.userconfig !== join(context.attemptRoot, 'install/npm-userconfig') ||
    context.globalconfig !== join(context.attemptRoot, 'install/npm-globalconfig')
  )
    throw new Error('NPM_CONFIG_IDENTITY_INVALID');
  for (const path of [context.userconfig, context.globalconfig]) {
    const record = readStableOwnedFile(path, 0, context.attemptRoot);
    if (record.bytes.length !== 0) throw new Error('NPM_CONFIG_IDENTITY_INVALID');
  }
  if (
    spec.env.NPM_CONFIG_USERCONFIG !== context.userconfig ||
    spec.env.NPM_CONFIG_GLOBALCONFIG !== context.globalconfig
  )
    throw new Error('NPM_CONFIG_IDENTITY_INVALID');
  if (context.firefoxExecutionClass === 'protected-verifier') {
    if (
      context.browserRootState !== 'none' ||
      context.browsersPath !== null ||
      spec.env.PLAYWRIGHT_BROWSERS_PATH !== undefined ||
      spec.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== undefined
    )
      throw new Error('PLAYWRIGHT_PROTECTED_VERIFIER_ISOLATION_INVALID');
    return;
  }
  const expectedBrowserRoot = join(
    context.attemptRoot,
    context.firefoxExecutionClass === 'release' ? 'playwright-browsers' : 'browsers'
  );
  if (
    context.browsersPath !== expectedBrowserRoot ||
    spec.env.PLAYWRIGHT_BROWSERS_PATH !== context.browsersPath ||
    (context.firefoxExecutionClass === 'release'
      ? spec.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== context.attemptRoot
      : spec.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== undefined)
  )
    throw new Error('PLAYWRIGHT_EXECUTION_BINDING_INVALID');
  if (context.browserRootState === 'absent') {
    try {
      lstatSync(context.browsersPath);
      throw new Error('PLAYWRIGHT_BROWSER_ROOT_REUSED');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } else if (context.browserRootState === 'empty') {
    releaseDirectoryIdentity(context.browsersPath);
    if (readdirSync(context.browsersPath).length !== 0)
      throw new Error('PLAYWRIGHT_BROWSER_ROOT_INVALID');
  } else if (context.browserRootState === 'existing') {
    releaseDirectoryIdentity(context.browsersPath);
  } else {
    throw new Error('PLAYWRIGHT_BROWSER_ROOT_STATE_INVALID');
  }
}

function validateActionOutput(spec) {
  const context = spec.commandContext;
  if (!context?.actionOutputKey) return;
  if (typeof context.githubOutputPath !== 'string') throw new Error('CI_OUTPUT_INVALID');
  const expected = Buffer.from(`${context.actionOutputKey}=${context.actionOutputValue}\n`, 'utf8');
  if (!readFileSync(context.githubOutputPath).equals(expected))
    throw new Error('CI_OUTPUT_CONTRACT_INVALID');
}

function startCompositeLifecycle(spec, dependencies, operation) {
  let activeHandle = null;
  let cancellationReason = null;
  let settled = false;

  async function awaitActive(handle, profileId) {
    activeHandle = handle;
    if (cancellationReason) handle.cancel(cancellationReason);
    try {
      const result = await handle.completion;
      return cancellationReason
        ? remapPhaseResult(profileId, result, cancellationReason, true)
        : result;
    } catch (error) {
      if (!cancellationReason) throw error;
      return syntheticResult(profileId, false, cancellationReason, '', '', {
        spawnError: error instanceof Error ? error.message : String(error),
        cancelled: true
      });
    } finally {
      if (activeHandle === handle) activeHandle = null;
    }
  }

  const lifecycle = Object.freeze({
    get cancellationReason() {
      return cancellationReason;
    },
    runInvocation(invocation) {
      if (cancellationReason)
        return Promise.resolve(
          syntheticResult(invocation.profileId, false, cancellationReason, '', '', {
            cancelled: true
          })
        );
      return awaitActive(startBoundedCommand(invocation, dependencies), invocation.profileId);
    },
    runResolved(resolvedSpec) {
      if (cancellationReason)
        return Promise.resolve(
          syntheticResult(resolvedSpec.profileId, false, cancellationReason, '', '', {
            cancelled: true
          })
        );
      return awaitActive(startResolvedCommand(resolvedSpec, dependencies), resolvedSpec.profileId);
    }
  });

  const completion = (async () => {
    try {
      const result = await operation(lifecycle);
      return cancellationReason
        ? remapPhaseResult(spec.profileId, result, cancellationReason, true)
        : result;
    } catch (error) {
      if (!cancellationReason) throw error;
      return syntheticResult(spec.profileId, false, cancellationReason, '', '', {
        spawnError: error instanceof Error ? error.message : String(error),
        cancelled: true
      });
    }
  })().finally(() => {
    activeHandle = null;
    settled = true;
  });

  return {
    cancel(reason = 'cancelled') {
      if (settled || cancellationReason) return false;
      cancellationReason = reason;
      activeHandle?.cancel(reason);
      return true;
    },
    completion,
    get child() {
      return activeHandle?.child ?? null;
    },
    spec
  };
}

function gitValue(args) {
  try {
    return execFileSync('/usr/bin/git', args, {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
    }).trim();
  } catch {
    return 'ABSENT';
  }
}

function validateHuskyProvisioning() {
  if (gitValue(['config', '--get', 'core.hooksPath']) !== '.husky/_') {
    throw new Error('HUSKY_HOOKS_PATH_INVALID');
  }
  const wrapper = resolve(REPOSITORY_ROOT, '.husky/_/pre-commit');
  const stats = lstatSync(wrapper);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o111) === 0) {
    throw new Error('HUSKY_WRAPPER_INVALID');
  }
  const target = readFileSync(resolve(REPOSITORY_ROOT, '.husky/pre-commit'), 'utf8');
  if (
    target !==
    '#!/usr/bin/env sh\nnode scripts/run-bounded-command.mjs --profile lint-staged-hook-v1\n'
  ) {
    throw new Error('HUSKY_TARGET_INVALID');
  }
}

async function runSequence(profileId, phases, lifecycle) {
  let combinedStdout = '';
  let combinedStderr = '';
  for (const phase of phases) {
    const result = await lifecycle.runInvocation(phase);
    combinedStdout += result.output.stdout.text;
    combinedStderr += result.output.stderr.text;
    if (!result.ok)
      return syntheticResult(
        profileId,
        false,
        result.terminalReason,
        combinedStdout,
        combinedStderr,
        {
          exitCode: result.exitCode,
          signal: result.signal,
          spawnError: result.spawnError,
          timedOut: result.timedOut,
          cancelled: result.cancelled,
          escalation: result.escalation,
          closeObserved: result.closeObserved,
          pipeDrainObserved: result.pipeDrainObserved
        }
      );
  }
  return syntheticResult(profileId, true, 'success', combinedStdout, combinedStderr);
}

async function runComposite(profileId, args, dependencies, lifecycle) {
  if (profileId === 'coverage-summary-v1') {
    const path = resolve(REPOSITORY_ROOT, 'coverage/coverage-summary.json');
    const summary = JSON.parse(readFileSync(path, 'utf8')).total;
    const text = `Lines: ${summary.lines.pct}%\nStatements: ${summary.statements.pct}%\nFunctions: ${summary.functions.pct}%\nBranches: ${summary.branches.pct}%\n`;
    if (dependencies.mirrorOutput) process.stdout.write(text);
    return syntheticResult(profileId, true, 'success', text);
  }
  if (profileId === 'generated-artifact-check-v1') {
    const generation =
      args[0] === 'locales'
        ? ['npm-script-standard-v1', ['i18n:generate']]
        : ['npm-script-standard-v1', ['manifest:generate']];
    const paths =
      args[0] === 'locales'
        ? ['public/_locales']
        : ['public/manifest.json', 'public/manifest.firefox.json'];
    const first = await lifecycle.runInvocation({
      profileId: generation[0],
      arguments: generation[1]
    });
    if (!first.ok) return remapPhaseResult(profileId, first);
    const gitSpec = {
      profileId: 'generated-artifact-check-v1',
      cwd: realpathSync(REPOSITORY_ROOT),
      executable: realpathSync('/usr/bin/git'),
      argv: ['diff', '--exit-code', '--', ...paths],
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      shell: false,
      tty: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'pipe', 'pipe'],
      limits: {
        activeMs: 60_000,
        termMs: 5_000,
        killMs: 5_000,
        stdoutBytes: 8 << 20,
        stderrBytes: 8 << 20,
        fd4Bytes: 1 << 20,
        fd5Bytes: 1 << 20
      },
      argvDigest: ''
    };
    const second = await lifecycle.runResolved(gitSpec);
    return second.ok
      ? syntheticResult(
          profileId,
          true,
          'success',
          first.output.stdout.text + second.output.stdout.text,
          first.output.stderr.text + second.output.stderr.text
        )
      : syntheticResult(
          profileId,
          false,
          second.terminalReason,
          first.output.stdout.text + second.output.stdout.text,
          first.output.stderr.text + second.output.stderr.text,
          {
            exitCode: second.exitCode,
            signal: second.signal,
            spawnError: second.spawnError,
            timedOut: second.timedOut,
            cancelled: second.cancelled,
            escalation: second.escalation,
            closeObserved: second.closeObserved,
            pipeDrainObserved: second.pipeDrainObserved
          }
        );
  }
  if (profileId === 'stitch-secondary-v1') {
    const shellTests = readdirSync(resolve(REPOSITORY_ROOT, 'tests/unit/options'))
      .filter((name) => /^productionStitchShell.*\.test\.ts$/u.test(name))
      .sort()
      .map((name) => `tests/unit/options/${name}`);
    return runSequence(
      profileId,
      [
        { profileId: 'node-script-standard-v1', arguments: ['scripts/preview-freeze-check.mjs'] },
        {
          profileId: 'vitest-v1',
          arguments: [
            'run',
            ...shellTests,
            'tests/unit/options/stitchSharedRegistry.test.ts',
            'tests/unit/options/optionsIndexHtmlModalHosts.test.ts',
            'tests/unit/options/nativeLeafWidgets.test.ts',
            'tests/unit/optionsPreviewRuntime.test.ts'
          ]
        },
        { profileId: 'npm-script-browser-v1', arguments: ['visual:stitch'] },
        {
          profileId: 'playwright-v1',
          arguments: [
            'test',
            'tests/visual/preview.runtime.alignment.spec.ts',
            'tests/visual/preview.task-success.layout.spec.ts',
            '--project=chromium-desktop'
          ]
        }
      ],
      lifecycle
    );
  }
  throw new Error(`Unsupported composite profile: ${profileId}`);
}

export function startBoundedCommand({ profileId, arguments: args = [] }, dependencies = {}) {
  const resolver = dependencies.resolveProfile ?? resolveCommandProfile;
  const spec = resolver(profileId, args, { environment: dependencies.environment ?? process.env });
  if (spec.operation) return startInProcessProfile(spec);
  assertFirefoxExecutionPreconditions(spec);
  const storeInitial = assertStoreProfilePreconditions(spec);
  const verificationSnapshot =
    ['chrome-verify-v1', 'firefox-verify-v1'].includes(profileId) &&
    spec.commandContext?.transport === 'github-artifact-v1'
      ? releaseFileSnapshot(
          spec.commandContext.attemptRoot,
          spec.commandContext.manifestPath,
          32 << 20
        )
      : undefined;
  if (
    verificationSnapshot &&
    verificationSnapshot.sha256 !== spec.commandContext.expectedManifestSha256
  )
    throw new Error('RELEASE_MANIFEST_DIGEST_MISMATCH');
  if (spec.composite || profileId === 'vitest-v1' || profileId === 'playwright-v1') {
    return startCompositeLifecycle(spec, dependencies, async (lifecycle) => {
      if (profileId === 'vitest-v1' || profileId === 'playwright-v1') {
        const guard = await lifecycle.runInvocation({
          profileId: 'node-script-standard-v1',
          arguments: ['scripts/verify-runtime.mjs']
        });
        if (!guard.ok) return remapPhaseResult(profileId, guard);
        return lifecycle.runResolved(spec);
      }
      return runComposite(profileId, args, dependencies, lifecycle);
    });
  }
  return wrapStoreCompletion(
    { ...startResolvedCommand(spec, dependencies), verificationSnapshot },
    storeInitial
  );
}

export async function runBoundedCommand(invocation, dependencies = {}) {
  const hookInvariant = invocation.profileId === 'lint-staged-hook-v1';
  const before = hookInvariant
    ? {
        tree: gitValue(['write-tree']),
        stash: gitValue(['rev-parse', '-q', '--verify', 'refs/stash'])
      }
    : null;
  const handle = startBoundedCommand(invocation, dependencies);
  let result = await handle.completion;
  if (result.ok) {
    try {
      if (['chrome-verify-v1', 'firefox-verify-v1'].includes(invocation.profileId))
        publishArtifactVerificationReceipt(handle.spec, handle.verificationSnapshot);
      if (invocation.profileId === 'release-provenance-v1') validateActionOutput(handle.spec);
    } catch (error) {
      result = syntheticResult(
        invocation.profileId,
        false,
        error instanceof Error ? error.message : 'PROFILE_POSTCONDITION_FAILED',
        result.output.stdout.text,
        result.output.stderr.text,
        {
          exitCode: result.exitCode,
          signal: result.signal,
          closeObserved: result.closeObserved,
          pipeDrainObserved: result.pipeDrainObserved,
          output: result.output
        }
      );
    }
  }
  if (hookInvariant) {
    const after = {
      tree: gitValue(['write-tree']),
      stash: gitValue(['rev-parse', '-q', '--verify', 'refs/stash'])
    };
    if (before.tree !== after.tree || before.stash !== after.stash) {
      return syntheticResult(invocation.profileId, false, 'hook-index-mutated');
    }
  }
  if (invocation.profileId === 'husky-provision-v1' && result.ok) {
    try {
      validateHuskyProvisioning();
    } catch (error) {
      return syntheticResult(
        invocation.profileId,
        false,
        error instanceof Error ? error.message : 'HUSKY_PROVISION_INVALID'
      );
    }
  }
  if (invocation.profileId === 'github-ci-install-v1' && result.ok) {
    try {
      publishCiInstallOutputs(handle.spec);
    } catch (error) {
      return syntheticResult(
        invocation.profileId,
        false,
        error instanceof Error ? error.message : 'CI_OUTPUT_INVALID'
      );
    }
  }
  return result;
}

export function readCanonicalCommandRequest(environment = process.env) {
  const rawRoot = environment.ZENDIO_COMMAND_ATTEMPT_ROOT;
  if (typeof rawRoot !== 'string' || !isAbsolute(rawRoot) || resolve(rawRoot) !== rawRoot)
    throw new Error('COMMAND_REQUEST_ROOT_INVALID');
  const root = realpathSync(rawRoot);
  const rootStats = lstatSync(rawRoot);
  if (
    !rootStats.isDirectory() ||
    rootStats.isSymbolicLink() ||
    rootStats.uid !== process.getuid() ||
    (rootStats.mode & 0o077) !== 0
  )
    throw new Error('COMMAND_REQUEST_ROOT_INVALID');
  const requestPath = join(root, COMMAND_REQUEST_FILE);
  if (dirname(requestPath) !== root) throw new Error('COMMAND_REQUEST_FILE_INVALID');
  const { value: request } = readCanonicalJsonDescriptor(requestPath, 64 * 1024, 4, root, 'pretty');
  assertClosedKeys(request, ['arguments', 'profileId'], 'command request');
  if (
    typeof request.profileId !== 'string' ||
    !Array.isArray(request.arguments) ||
    request.arguments.some((value) => typeof value !== 'string')
  )
    throw new Error('COMMAND_REQUEST_SCHEMA_INVALID');
  validateProfileArguments(request.profileId, request.arguments);
  return deepFreeze({
    profileId: request.profileId,
    arguments: [...request.arguments],
    root,
    requestPath
  });
}

export async function runCanonicalCommandRequest(environment = process.env, dependencies = {}) {
  const request = readCanonicalCommandRequest(environment);
  return runBoundedCommand(request, { ...dependencies, environment });
}

export const _internal = Object.freeze({ startResolvedCommand });
