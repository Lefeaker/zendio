import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebExtSigningApi } from '../../../scripts/package-firefox.mjs';
import { signAndAuditFirefoxPackage } from '../../../scripts/package-firefox.mjs';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-package-firefox-test-'));
  tempRoots.push(root);
  return root;
}

function createSigningOptions(root: string) {
  return {
    distDir: join(root, 'dist'),
    artifactsDir: join(root, 'artifacts'),
    zipSafeName: 'all-in-ob',
    version: '0.2.0',
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    channel: 'listed',
    extensionId: 'extension@example.test'
  };
}

describe('Firefox package signing audit', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('copies the signed XPI to the final path and audits that final artifact', async () => {
    const root = await createTempRoot();
    const finalDir = join(root, 'final');
    await mkdir(finalDir, { recursive: true });
    const auditReleaseArchiveImpl = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const webExt = {
      cmd: {
        sign: vi.fn(async (options: Record<string, unknown>) => {
          const artifactsDir = options.artifactsDir;
          if (typeof artifactsDir !== 'string') {
            throw new Error('Expected artifactsDir to be a string.');
          }
          await mkdir(artifactsDir, { recursive: true });
          await writeFile(join(artifactsDir, 'signed-from-mozilla.xpi'), 'signed-xpi-bytes');
        })
      }
    };

    const signedPath = await signAndAuditFirefoxPackage(createSigningOptions(root), {
      auditReleaseArchiveImpl,
      logger,
      resolvePathImpl: (targetName: string) => join(finalDir, targetName),
      webExt
    });

    expect(signedPath).toBe(join(finalDir, 'all-in-ob-v0.2.0-signed.xpi'));
    await expect(readFile(signedPath, 'utf8')).resolves.toBe('signed-xpi-bytes');
    expect(auditReleaseArchiveImpl).toHaveBeenCalledWith(signedPath);
    expect(webExt.cmd.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDir: join(root, 'dist'),
        artifactsDir: join(root, 'artifacts'),
        apiKey: 'api-key',
        apiSecret: 'api-secret',
        channel: 'listed',
        id: 'extension@example.test'
      }),
      { shouldExitProgram: false }
    );
  });

  it('detects a signed XPI when web-ext overwrites an existing artifact name', async () => {
    const root = await createTempRoot();
    const finalDir = join(root, 'final');
    const options = createSigningOptions(root);
    await mkdir(finalDir, { recursive: true });
    await mkdir(options.artifactsDir, { recursive: true });
    await writeFile(join(options.artifactsDir, 'signed-from-mozilla.xpi'), 'old');

    const auditReleaseArchiveImpl = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const webExt: WebExtSigningApi = {
      cmd: {
        sign: vi.fn(async () => {
          await writeFile(
            join(options.artifactsDir, 'signed-from-mozilla.xpi'),
            'signed-xpi-overwritten-by-web-ext'
          );
        })
      }
    };

    const signedPath = await signAndAuditFirefoxPackage(options, {
      auditReleaseArchiveImpl,
      logger,
      resolvePathImpl: (targetName: string) => join(finalDir, targetName),
      webExt
    });

    expect(signedPath).toBe(join(finalDir, 'all-in-ob-v0.2.0-signed.xpi'));
    await expect(readFile(signedPath, 'utf8')).resolves.toBe('signed-xpi-overwritten-by-web-ext');
    expect(auditReleaseArchiveImpl).toHaveBeenCalledWith(signedPath);
  });

  it('fails signing mode when Mozilla signing produces no XPI artifact', async () => {
    const root = await createTempRoot();
    const auditReleaseArchiveImpl = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const webExt = {
      cmd: {
        sign: vi.fn(async (options: Record<string, unknown>) => {
          const artifactsDir = options.artifactsDir;
          if (typeof artifactsDir !== 'string') {
            throw new Error('Expected artifactsDir to be a string.');
          }
          await mkdir(artifactsDir, { recursive: true });
          await writeFile(join(artifactsDir, 'web-ext-output.txt'), 'no signed xpi here');
        })
      }
    };

    await expect(
      signAndAuditFirefoxPackage(createSigningOptions(root), {
        auditReleaseArchiveImpl,
        logger,
        resolvePathImpl: (targetName: string) => join(root, targetName),
        webExt
      })
    ).rejects.toThrow('Firefox signing did not produce a signed XPI artifact.');
    expect(auditReleaseArchiveImpl).not.toHaveBeenCalled();
  });
});
