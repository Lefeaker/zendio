import { readFileSync } from 'node:fs';
import { lstat, mkdir, rm } from 'node:fs/promises';
import process from 'node:process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertVerifiedFirefoxArtifactBinding } from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_XPI_SMOKE_TIMEOUTS = Object.freeze({
  launchMs: 120_000,
  installMs: 60_000,
  queryMs: 30_000,
  reloadMs: 30_000,
  exitMs: 30_000,
  gracefulCloseMs: 20_000,
  forcedCloseMs: 10_000,
  cleanupMs: 30_000,
  wholeMs: 420_000
});
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function createDeadline(dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimeoutOperation ?? setTimeout;
  const clearTimer = dependencies.clearTimeoutOperation ?? clearTimeout;
  const startedAt = now();
  let fenced = false;
  const remaining = () => FIREFOX_XPI_SMOKE_TIMEOUTS.wholeMs - (now() - startedAt);
  return {
    get fenced() {
      return fenced;
    },
    fence() {
      fenced = true;
    },
    remaining,
    async run(operation, operationMs, code, onLate, { allowFenced = false } = {}) {
      if (fenced && !allowFenced) fail('FIREFOX_SMOKE_LATE_OPERATION');
      const available = remaining();
      if (available <= 0) {
        fenced = true;
        fail('FIREFOX_SMOKE_WHOLE_TIMEOUT');
      }
      let timer;
      let timedOut = false;
      const pending = Promise.resolve().then(operation);
      pending.then(
        (value) => {
          if (timedOut) onLate?.(value);
        },
        () => undefined
      );
      try {
        return await Promise.race([
          pending,
          new Promise((_, reject) => {
            timer = setTimer(
              () => {
                timedOut = true;
                fenced = true;
                reject(new Error(available < operationMs ? 'FIREFOX_SMOKE_WHOLE_TIMEOUT' : code));
              },
              Math.min(operationMs, available)
            );
          })
        ]);
      } finally {
        clearTimer(timer);
      }
    }
  };
}

function assertPinnedWebExtIdentity() {
  const require = createRequire(import.meta.url);
  const packagePath = resolve(dirname(require.resolve('web-ext')), 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package-lock.json'), 'utf8'));
  if (
    packageJson.version !== '10.4.0' ||
    lock.packages?.['node_modules/web-ext']?.version !== '10.4.0'
  )
    fail('FIREFOX_SMOKE_WEB_EXT_IDENTITY');
  const sourcePath = join(dirname(packagePath), 'lib/extension-runners/firefox-desktop.js');
  const source = readFileSync(sourcePath, 'utf8');
  for (const token of [
    'startFirefoxInstance',
    'runningInfo',
    "runningInfo.firefox.on('close'",
    'runningInfo.firefox.kill'
  ]) {
    if (!source.includes(token)) fail('FIREFOX_SMOKE_WEB_EXT_SOURCE_DRIFT');
  }
  return Object.freeze({ packagePath, sourcePath, version: packageJson.version });
}

async function assertAbsent(path) {
  try {
    await lstat(path);
    fail('FIREFOX_SMOKE_PROFILE_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function assertRunnerShape(result) {
  const runners = result?.extensionRunners;
  if (!Array.isArray(runners) || runners.length !== 1) fail('FIREFOX_SMOKE_RUNNER_SHAPE');
  const runner = runners[0];
  const remote = runner?.remoteFirefox;
  const child = runner?.runningInfo?.firefox;
  if (
    typeof remote?.installTemporaryAddon !== 'function' ||
    typeof remote?.getInstalledAddon !== 'function' ||
    typeof remote?.reloadAddon !== 'function' ||
    typeof runner?.exit !== 'function' ||
    !Number.isSafeInteger(child?.pid) ||
    child.pid <= 0 ||
    typeof child.kill !== 'function' ||
    typeof child.once !== 'function' ||
    typeof child.removeListener !== 'function'
  ) {
    fail('FIREFOX_SMOKE_RUNNER_SHAPE');
  }
  return { runner, remote, child };
}

function createCloseObserver(child) {
  let listener;
  let closeResult =
    child.exitCode != null || child.signalCode != null
      ? { code: child.exitCode ?? null, signal: child.signalCode ?? null }
      : null;
  const promise = new Promise((resolve) => {
    if (closeResult) {
      resolve(closeResult);
      return;
    }
    listener = (code, signal) => {
      closeResult = { code, signal };
      resolve(closeResult);
    };
    child.once('close', listener);
  });
  return {
    promise,
    hasClosed: () => closeResult !== null,
    result: () => closeResult,
    remove: () => {
      if (listener) child.removeListener('close', listener);
    }
  };
}

function assertManagedChildOpen(closeObserver) {
  if (!closeObserver.hasClosed()) return;
  const result = closeObserver.result();
  fail(
    'FIREFOX_SMOKE_PROCESS_CLOSED',
    `code=${String(result?.code ?? 'null')},signal=${String(result?.signal ?? 'null')}`
  );
}

async function runManagedOperation(
  operation,
  closeObserver,
  deadline,
  timeoutMs,
  timeoutCode,
  shape
) {
  assertManagedChildOpen(closeObserver);
  if (shape.runner.runningInfo?.firefox !== shape.child || shape.child.pid !== shape.pid)
    fail('FIREFOX_SMOKE_PROCESS_IDENTITY_CHANGED');
  try {
    const result = await deadline.run(
      () =>
        Promise.race([
          Promise.resolve().then(operation),
          closeObserver.promise.then(() => assertManagedChildOpen(closeObserver))
        ]),
      timeoutMs,
      timeoutCode
    );
    if (shape.runner.runningInfo?.firefox !== shape.child || shape.child.pid !== shape.pid)
      fail('FIREFOX_SMOKE_PROCESS_IDENTITY_CHANGED');
    assertManagedChildOpen(closeObserver);
    return result;
  } catch (error) {
    assertManagedChildOpen(closeObserver);
    throw error;
  }
}

export async function runVerifiedFirefoxXpiSmoke(options, dependencies = {}) {
  const { binding, firefoxExecutable, profilePath, bootstrapSourceDir, transportMode } = options;
  assertVerifiedFirefoxArtifactBinding(binding);
  if (binding.transportMode !== transportMode) fail('FIREFOX_SMOKE_TRANSPORT_MODE');
  if (!isAbsolute(firefoxExecutable)) fail('FIREFOX_SMOKE_EXECUTABLE');
  if (
    !isAbsolute(profilePath) ||
    resolve(profilePath) !== profilePath ||
    dirname(profilePath) !== binding.attemptRoot
  )
    fail('FIREFOX_SMOKE_PROFILE_PATH');
  await assertAbsent(profilePath);
  await mkdir(profilePath, { mode: 0o700 });
  const profileStat = await lstat(profilePath);
  if (
    !profileStat.isDirectory() ||
    profileStat.isSymbolicLink() ||
    profileStat.uid !== process.getuid?.() ||
    (profileStat.mode & 0o777) !== 0o700
  ) {
    fail('FIREFOX_SMOKE_PROFILE_MODE');
  }
  const webExt = dependencies.webExt;
  if (typeof webExt?.cmd?.run !== 'function') fail('FIREFOX_SMOKE_WEB_EXT_API');
  assertPinnedWebExtIdentity();

  let runnerShape;
  let closeObserver;
  let closed = false;
  let operationError;
  const deadline = createDeadline(dependencies);
  try {
    const result = await deadline.run(
      () =>
        webExt.cmd.run(
          {
            firefox: firefoxExecutable,
            target: ['firefox-desktop'],
            sourceDir: bootstrapSourceDir,
            noInput: true,
            noReload: true,
            args: ['-headless'],
            firefoxProfile: profilePath,
            keepProfileChanges: true
          },
          { shouldExitProgram: false }
        ),
      FIREFOX_XPI_SMOKE_TIMEOUTS.launchMs,
      'FIREFOX_SMOKE_LAUNCH_TIMEOUT',
      (lateResult) => {
        try {
          const late = assertRunnerShape(lateResult);
          late.runner.exit().catch?.(() => undefined);
          late.child.kill('SIGKILL');
        } catch {
          // A late malformed result has no trusted process identity to signal.
        }
      }
    );
    runnerShape = assertRunnerShape(result);
    runnerShape.pid = runnerShape.child.pid;
    closeObserver = createCloseObserver(runnerShape.child);
    const installed = await runManagedOperation(
      () => runnerShape.remote.installTemporaryAddon(binding.xpiPath),
      closeObserver,
      deadline,
      FIREFOX_XPI_SMOKE_TIMEOUTS.installMs,
      'FIREFOX_SMOKE_INSTALL_TIMEOUT',
      runnerShape
    );
    if (installed?.id && installed.id !== binding.geckoId) fail('FIREFOX_SMOKE_ADDON_ID');
    const first = await runManagedOperation(
      () => runnerShape.remote.getInstalledAddon(binding.geckoId),
      closeObserver,
      deadline,
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT',
      runnerShape
    );
    if (first?.id !== binding.geckoId || first?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
    await runManagedOperation(
      () => runnerShape.remote.reloadAddon(binding.geckoId),
      closeObserver,
      deadline,
      FIREFOX_XPI_SMOKE_TIMEOUTS.reloadMs,
      'FIREFOX_SMOKE_RELOAD_TIMEOUT',
      runnerShape
    );
    const second = await runManagedOperation(
      () => runnerShape.remote.getInstalledAddon(binding.geckoId),
      closeObserver,
      deadline,
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT',
      runnerShape
    );
    if (second?.id !== binding.geckoId || second?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
    assertManagedChildOpen(closeObserver);
    if (deadline.remaining() <= 0) {
      fail('FIREFOX_SMOKE_WHOLE_TIMEOUT');
    }
    return Object.freeze({
      schema: 'firefox-exact-xpi-smoke-v1',
      geckoId: binding.geckoId,
      temporarilyInstalled: true,
      reloaded: true
    });
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (runnerShape) {
      try {
        const identityStable =
          runnerShape.runner.runningInfo?.firefox === runnerShape.child &&
          runnerShape.child.pid === runnerShape.pid;
        if (!identityStable) {
          const killResult = runnerShape.child.kill('SIGKILL');
          if (killResult !== true) {
            if (!operationError) fail('FIREFOX_SMOKE_FORCE_KILL_FAILED');
          } else {
            try {
              await deadline.run(
                () => closeObserver.promise,
                FIREFOX_XPI_SMOKE_TIMEOUTS.forcedCloseMs,
                'FIREFOX_SMOKE_FORCED_CLOSE_TIMEOUT',
                undefined,
                { allowFenced: true }
              );
              closed = true;
            } catch (error) {
              if (!operationError) throw error;
            }
          }
        } else {
          await deadline.run(
            () => runnerShape.runner.exit(),
            FIREFOX_XPI_SMOKE_TIMEOUTS.exitMs,
            'FIREFOX_SMOKE_EXIT_TIMEOUT',
            undefined,
            { allowFenced: true }
          );
          await deadline.run(
            () => closeObserver.promise,
            FIREFOX_XPI_SMOKE_TIMEOUTS.gracefulCloseMs,
            'FIREFOX_SMOKE_GRACEFUL_CLOSE_TIMEOUT',
            undefined,
            { allowFenced: true }
          );
          closed = true;
        }
      } catch {
        if (closeObserver.hasClosed()) {
          closed = true;
        } else if (
          runnerShape.runner.runningInfo?.firefox !== runnerShape.child ||
          runnerShape.child.pid !== runnerShape.pid
        ) {
          if (!operationError) fail('FIREFOX_SMOKE_PROCESS_IDENTITY_CHANGED');
        } else {
          const killResult = runnerShape.child.kill('SIGKILL');
          if (killResult !== true) {
            if (!operationError) fail('FIREFOX_SMOKE_FORCE_KILL_FAILED');
          } else {
            try {
              await deadline.run(
                () => closeObserver.promise,
                FIREFOX_XPI_SMOKE_TIMEOUTS.forcedCloseMs,
                'FIREFOX_SMOKE_FORCED_CLOSE_TIMEOUT',
                undefined,
                { allowFenced: true }
              );
              closed = true;
            } catch (error) {
              if (!operationError) throw error;
            }
          }
        }
      } finally {
        closeObserver?.remove();
      }
    }
    if (closed || (!runnerShape && !deadline.fenced)) {
      deadline.fence();
      await deadline.run(
        () => rm(profilePath, { recursive: true }),
        FIREFOX_XPI_SMOKE_TIMEOUTS.cleanupMs,
        'FIREFOX_SMOKE_PROFILE_CLEANUP_TIMEOUT',
        undefined,
        { allowFenced: true }
      );
      try {
        await lstat(profilePath);
        fail('FIREFOX_SMOKE_PROFILE_CLEANUP_INCOMPLETE');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
}
