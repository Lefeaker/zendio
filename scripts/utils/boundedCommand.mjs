import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
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

function syntheticResult(profileId, ok, terminalReason, stdout = '', stderr = '') {
  const stamp = performance.now();
  const output = Object.fromEntries(
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
    exitCode: ok ? 0 : 1,
    signal: null,
    spawnError: null,
    timedOut: false,
    cancelled: false,
    escalation: [],
    closeObserved: true,
    pipeDrainObserved: true,
    output
  });
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

async function runSequence(profileId, phases, dependencies) {
  let combinedStdout = '';
  let combinedStderr = '';
  for (const phase of phases) {
    const result = await runBoundedCommand(phase, dependencies);
    combinedStdout += result.output.stdout.text;
    combinedStderr += result.output.stderr.text;
    if (!result.ok)
      return syntheticResult(
        profileId,
        false,
        result.terminalReason,
        combinedStdout,
        combinedStderr
      );
  }
  return syntheticResult(profileId, true, 'success', combinedStdout, combinedStderr);
}

async function runComposite(profileId, args, dependencies) {
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
    const first = await runBoundedCommand(
      { profileId: generation[0], arguments: generation[1] },
      dependencies
    );
    if (!first.ok)
      return syntheticResult(
        profileId,
        false,
        first.terminalReason,
        first.output.stdout.text,
        first.output.stderr.text
      );
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
    const second = await startResolvedCommand(gitSpec, dependencies).completion;
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
          first.output.stderr.text + second.output.stderr.text
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
      dependencies
    );
  }
  throw new Error(`Unsupported composite profile: ${profileId}`);
}

export function startBoundedCommand({ profileId, arguments: args = [] }, dependencies = {}) {
  const resolver = dependencies.resolveProfile ?? resolveCommandProfile;
  const spec = resolver(profileId, args, { environment: dependencies.environment ?? process.env });
  if (spec.composite || profileId === 'vitest-v1' || profileId === 'playwright-v1') {
    let cancelled = false;
    const completion = (async () => {
      if (profileId === 'vitest-v1' || profileId === 'playwright-v1') {
        const guard = await runBoundedCommand(
          { profileId: 'node-script-standard-v1', arguments: ['scripts/verify-runtime.mjs'] },
          dependencies
        );
        if (!guard.ok)
          return syntheticResult(
            profileId,
            false,
            guard.terminalReason,
            guard.output.stdout.text,
            guard.output.stderr.text
          );
        if (cancelled) return syntheticResult(profileId, false, 'cancelled');
        return startResolvedCommand(spec, dependencies).completion;
      }
      return runComposite(profileId, args, dependencies);
    })();
    return { cancel: () => (cancelled = true), completion, child: null, spec };
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
  const result = await handle.completion;
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
