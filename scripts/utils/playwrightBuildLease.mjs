import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export function resolvePlaywrightBuildLeaseDir(rootDir = process.cwd()) {
  return path.resolve(rootDir, 'build', '.playwright-build.lock');
}

export async function acquirePlaywrightBuildLease(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const now = options.now ?? (() => Date.now());
  const delay =
    options.delay ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)));
  const buildDir = path.resolve(rootDir, 'build');
  const leaseDir = resolvePlaywrightBuildLeaseDir(rootDir);
  const startedAt = now();

  while (true) {
    try {
      await mkdir(buildDir, { recursive: true });
      await mkdir(leaseDir);
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await rm(leaseDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (now() - startedAt > timeoutMs) {
        throw new Error(`[playwright-build] Timed out waiting for build lease: ${leaseDir}`);
      }
      await delay(pollIntervalMs);
    }
  }
}
