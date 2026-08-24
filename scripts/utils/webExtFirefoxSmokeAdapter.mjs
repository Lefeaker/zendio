import { lstat, mkdir, rm } from 'node:fs/promises';
import process from 'node:process';
import { resolve } from 'node:path';
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
  const promise = new Promise((resolve) => {
    listener = (code, signal) => resolve({ code, signal });
    child.once('close', listener);
  });
  return { promise, remove: () => child.removeListener('close', listener) };
}

export async function runVerifiedFirefoxXpiSmoke(options, dependencies = {}) {
  const { binding, firefoxExecutable, profilePath, bootstrapSourceDir, transportMode } = options;
  assertVerifiedFirefoxArtifactBinding(binding);
  if (binding.transportMode !== transportMode) fail('FIREFOX_SMOKE_TRANSPORT_MODE');
  if (!resolve(firefoxExecutable).startsWith('/')) fail('FIREFOX_SMOKE_EXECUTABLE');
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
    const installed = await withTimeout(
      runnerShape.remote.installTemporaryAddon(binding.xpiPath),
      FIREFOX_XPI_SMOKE_TIMEOUTS.installMs,
      'FIREFOX_SMOKE_INSTALL_TIMEOUT'
    );
    if (installed?.id && installed.id !== binding.geckoId) fail('FIREFOX_SMOKE_ADDON_ID');
    const first = await withTimeout(
      runnerShape.remote.getInstalledAddon(binding.geckoId),
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT'
    );
    if (first?.id !== binding.geckoId || first?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
    await withTimeout(
      runnerShape.remote.reloadAddon(binding.geckoId),
      FIREFOX_XPI_SMOKE_TIMEOUTS.reloadMs,
      'FIREFOX_SMOKE_RELOAD_TIMEOUT'
    );
    const second = await withTimeout(
      runnerShape.remote.getInstalledAddon(binding.geckoId),
      FIREFOX_XPI_SMOKE_TIMEOUTS.queryMs,
      'FIREFOX_SMOKE_QUERY_TIMEOUT'
    );
    if (second?.id !== binding.geckoId || second?.temporarilyInstalled !== true) {
      fail('FIREFOX_SMOKE_ADDON_STATE');
    }
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
