import { lstat, mkdir, rm } from 'node:fs/promises';
import process from 'node:process';
import { isAbsolute } from 'node:path';
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

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function withTimeout(promise, timeoutMs, code) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
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

async function runManagedOperation(operation, closeObserver, timeoutMs, timeoutCode) {
  assertManagedChildOpen(closeObserver);
  try {
    const result = await withTimeout(
      Promise.race([
        Promise.resolve().then(operation),
        closeObserver.promise.then(() => assertManagedChildOpen(closeObserver))
      ]),
      timeoutMs,
      timeoutCode
    );
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
  await assertAbsent(profilePath);
  await mkdir(profilePath, { mode: 0o700 });
  const profileStat = await lstat(profilePath);
  if (
    !profileStat.isDirectory() ||
    profileStat.isSymbolicLink() ||
    (profileStat.mode & 0o777) !== 0o700
  ) {
    fail('FIREFOX_SMOKE_PROFILE_MODE');
  }
  const webExt = dependencies.webExt;
  if (typeof webExt?.cmd?.run !== 'function') fail('FIREFOX_SMOKE_WEB_EXT_API');

  let runnerShape;
  let closeObserver;
  let closed = false;
  let operationError;
  const started = Date.now();
  try {
    const result = await withTimeout(
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
      'FIREFOX_SMOKE_LAUNCH_TIMEOUT'
    );
    runnerShape = assertRunnerShape(result);
    closeObserver = createCloseObserver(runnerShape.child);
    const installed = await runManagedOperation(
      () => runnerShape.remote.installTemporaryAddon(binding.xpiPath),
      closeObserver,
      FIREFOX_XPI_SMOKE_TIMEOUTS.installMs,
      'FIREFOX_SMOKE_INSTALL_TIMEOUT'
    );
    if (installed?.id && installed.id !== binding.geckoId) fail('FIREFOX_SMOKE_ADDON_ID');
    const first = await runManagedOperation(
      () => runnerShape.remote.getInstalledAddon(binding.geckoId),
      closeObserver,
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT'
    );
    if (first?.id !== binding.geckoId || first?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
    await runManagedOperation(
      () => runnerShape.remote.reloadAddon(binding.geckoId),
      closeObserver,
      FIREFOX_XPI_SMOKE_TIMEOUTS.reloadMs,
      'FIREFOX_SMOKE_RELOAD_TIMEOUT'
    );
    const second = await runManagedOperation(
      () => runnerShape.remote.getInstalledAddon(binding.geckoId),
      closeObserver,
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT'
    );
    if (second?.id !== binding.geckoId || second?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
    assertManagedChildOpen(closeObserver);
    if (Date.now() - started > FIREFOX_XPI_SMOKE_TIMEOUTS.wholeMs) {
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
        await withTimeout(
          runnerShape.runner.exit(),
          FIREFOX_XPI_SMOKE_TIMEOUTS.exitMs,
          'FIREFOX_SMOKE_EXIT_TIMEOUT'
        );
        await withTimeout(
          closeObserver.promise,
          FIREFOX_XPI_SMOKE_TIMEOUTS.gracefulCloseMs,
          'FIREFOX_SMOKE_GRACEFUL_CLOSE_TIMEOUT'
        );
        closed = true;
      } catch {
        if (closeObserver.hasClosed()) {
          closed = true;
        } else {
          const killResult = runnerShape.child.kill('SIGKILL');
          if (killResult !== true) {
            if (!operationError) fail('FIREFOX_SMOKE_FORCE_KILL_FAILED');
          } else {
            try {
              await withTimeout(
                closeObserver.promise,
                FIREFOX_XPI_SMOKE_TIMEOUTS.forcedCloseMs,
                'FIREFOX_SMOKE_FORCED_CLOSE_TIMEOUT'
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
    if (closed || !runnerShape) {
      await withTimeout(
        rm(profilePath, { recursive: true }),
        FIREFOX_XPI_SMOKE_TIMEOUTS.cleanupMs,
        'FIREFOX_SMOKE_PROFILE_CLEANUP_TIMEOUT'
      );
    }
  }
}
