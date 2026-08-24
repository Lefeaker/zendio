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
  writeSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  assertClosedKeys,
  assertSnapshotStable,
  deepFreeze,
  readCanonicalJsonFileBounded,
  snapshotFile
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

function sha256FileBounded(path, maximumBytes = 32 << 20) {
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    stats.nlink !== 1 ||
    stats.size > maximumBytes
  )
    throw new Error('RELEASE_FILE_INVALID');
  const before = realpathSync(path);
  const bytes = readFileSync(path);
  if (bytes.length !== stats.size || realpathSync(path) !== before)
    throw new Error('RELEASE_FILE_CHANGED');
  return createHash('sha256').update(bytes).digest('hex');
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

function writeExclusiveCanonicalJson(path, value) {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (bytes.length > 64 * 1024) throw new Error('RELEASE_JSON_LIMIT');
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.uid !== process.getuid() || opened.nlink !== 1)
      throw new Error('RELEASE_JSON_IDENTITY');
  } finally {
    closeSync(descriptor);
  }
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o777) !== 0o600 ||
    !readFileSync(path).equals(bytes)
  )
    throw new Error('RELEASE_JSON_PUBLICATION');
  const parent = openSync(dirname(path), constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
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
  const value = readCanonicalJsonFileBounded(context.resultPath, 64 * 1024, 16);
  const browser = context.browser;
  const fields = browser === 'chrome' ? ['manifestPath', 'zipPath'] : ['manifestPath', 'xpiPath'];
  const paths = fields.map((field) => value[field]);
  if (paths.some((path) => typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path))
    throw new Error('RELEASE_RESULT_INVALID');
  if (new Set(paths).size !== paths.length) throw new Error('RELEASE_RESULT_ALIAS');
  for (const path of paths) {
    if (!contained(context.attemptRoot, path)) throw new Error('RELEASE_RESULT_OUTSIDE_ATTEMPT');
    sha256FileBounded(path, 64 << 20);
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

function readCanonicalOwnedJson(path, maximumBytes = 64 * 1024) {
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o777) !== 0o600 ||
    stats.size > maximumBytes
  )
    throw new Error('RELEASE_JSON_INVALID');
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('RELEASE_JSON_INVALID');
  if (!bytes.equals(Buffer.from(`${canonicalJson(value)}\n`, 'utf8')))
    throw new Error('RELEASE_JSON_NONCANONICAL');
  return { value, bytes, stats };
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
    const releaseManifestSha256 = sha256FileBounded(result.value.manifestPath, 32 << 20);
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
    const artifact = readCanonicalOwnedJson(paths.artifactReceiptPath);
    const identity = currentReleaseIdentity();
    if (
      artifact.value.schema !== 'zendio-artifact-verification-receipt-v1' ||
      artifact.value.browser !== context.browser ||
      artifact.value.attemptRoot !== context.attemptRoot ||
      artifact.value.releaseSha !== identity.releaseSha ||
      artifact.value.releaseTree !== identity.releaseTree
    )
      throw new Error('ARTIFACT_RECEIPT_INVALID');
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
      artifactReceiptSha256: createHash('sha256').update(artifact.bytes).digest('hex'),
      stage: 'preflight',
      outcome: 'not-started',
      mutationInvoked: false,
      retrySafe: true
    };
    const publication = writeExclusiveCanonicalJson(paths.statePath, state);
    const binding = {
      schema: 'zendio-release-state-binding-v1',
      browser: context.browser,
      attemptRoot: context.attemptRoot,
      statePath: paths.statePath,
      stateSha256: publication.sha256,
      artifactReceiptSha256: state.artifactReceiptSha256,
      releaseSha: identity.releaseSha,
      releaseTree: identity.releaseTree
    };
    writeExclusiveCanonicalJson(paths.bindingReceiptPath, binding);
    return syntheticResult(spec.profileId, true, 'success');
  }
  if (spec.operation === 'release-state-check-v1') {
    const paths = releaseStatePaths(context.attemptRoot, context.browser);
    const { value } = readCanonicalOwnedJson(paths.statePath, 16 * 1024);
    if (
      value.schema !== 'zendio-release-store-state-v1' ||
      value.browser !== context.browser ||
      typeof value.stage !== 'string' ||
      typeof value.outcome !== 'string' ||
      typeof value.mutationInvoked !== 'boolean' ||
      typeof value.retrySafe !== 'boolean' ||
      !/^[0-9a-f]{40}$/u.test(value.releaseSha ?? '') ||
      !/^[0-9a-f]{40}$/u.test(value.releaseTree ?? '')
    )
      throw new Error('RELEASE_STATE_INVALID');
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

function publishArtifactVerificationReceipt(spec) {
  const context = spec.commandContext;
  if (!context || context.transport !== 'github-artifact-v1') return;
  const actualDigest = sha256FileBounded(context.manifestPath, 32 << 20);
  if (actualDigest !== context.expectedManifestSha256)
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
    releaseSha: identity.releaseSha,
    releaseTree: identity.releaseTree,
    manifestPath: context.manifestPath,
    manifestSha256: actualDigest
  };
  writeExclusiveCanonicalJson(
    join(receipts, `${context.browser}-artifact-verification.json`),
    receipt
  );
}

function assertStoreProfilePreconditions(spec) {
  if (!['chrome-publish-v1', 'firefox-submit-v1'].includes(spec.profileId)) return;
  const context = spec.commandContext;
  const paths = releaseStatePaths(context.attemptRoot, context.browser);
  if (context.statePath !== paths.statePath) throw new Error('RELEASE_STATE_PATH_INVALID');
  const artifact = readCanonicalOwnedJson(paths.artifactReceiptPath);
  const binding = readCanonicalOwnedJson(paths.bindingReceiptPath);
  const state = readCanonicalOwnedJson(paths.statePath, 16 * 1024);
  const artifactDigest = createHash('sha256').update(artifact.bytes).digest('hex');
  const stateDigest = createHash('sha256').update(state.bytes).digest('hex');
  if (
    artifact.value.schema !== 'zendio-artifact-verification-receipt-v1' ||
    artifact.value.browser !== context.browser ||
    binding.value.schema !== 'zendio-release-state-binding-v1' ||
    binding.value.browser !== context.browser ||
    binding.value.attemptRoot !== context.attemptRoot ||
    binding.value.statePath !== paths.statePath ||
    binding.value.artifactReceiptSha256 !== artifactDigest ||
    binding.value.stateSha256 !== stateDigest ||
    state.value.schema !== 'zendio-release-store-state-v1' ||
    state.value.browser !== context.browser ||
    state.value.stage !== 'preflight' ||
    state.value.mutationInvoked !== false ||
    state.value.retrySafe !== true
  )
    throw new Error('RELEASE_STATE_BINDING_INVALID');
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
  assertStoreProfilePreconditions(spec);
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
  return startResolvedCommand(spec, dependencies);
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
        publishArtifactVerificationReceipt(handle.spec);
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
  const requestStats = lstatSync(requestPath);
  if (
    !requestStats.isFile() ||
    requestStats.isSymbolicLink() ||
    requestStats.uid !== process.getuid() ||
    requestStats.nlink !== 1 ||
    (requestStats.mode & 0o777) !== 0o600
  )
    throw new Error('COMMAND_REQUEST_FILE_INVALID');
  const canonicalPath = realpathSync(requestPath);
  if (!contained(root, canonicalPath) || dirname(canonicalPath) !== root)
    throw new Error('COMMAND_REQUEST_FILE_INVALID');
  const snapshot = snapshotFile(canonicalPath, 64 * 1024);
  const request = readCanonicalJsonFileBounded(canonicalPath, 64 * 1024, 4);
  assertClosedKeys(request, ['arguments', 'profileId'], 'command request');
  if (
    typeof request.profileId !== 'string' ||
    !Array.isArray(request.arguments) ||
    request.arguments.some((value) => typeof value !== 'string')
  )
    throw new Error('COMMAND_REQUEST_SCHEMA_INVALID');
  validateProfileArguments(request.profileId, request.arguments);
  assertSnapshotStable(snapshot, 64 * 1024);
  return deepFreeze({
    profileId: request.profileId,
    arguments: [...request.arguments],
    root,
    requestPath: canonicalPath
  });
}

export async function runCanonicalCommandRequest(environment = process.env, dependencies = {}) {
  const request = readCanonicalCommandRequest(environment);
  return runBoundedCommand(request, { ...dependencies, environment });
}

export const _internal = Object.freeze({ startResolvedCommand });
