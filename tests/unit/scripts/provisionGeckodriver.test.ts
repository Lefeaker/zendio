import { createHash } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GECKODRIVER_CACHE_SCHEMA,
  GECKODRIVER_VERSION,
  provisionGeckodriver
} from '../../../scripts/provision-geckodriver.mjs';

const roots: string[] = [];

function successfulSpawn() {
  return vi.fn((executable: string, args: string[]) => {
    if (executable === '/usr/bin/tar' && args[0] === '-tzf') {
      return { status: 0, signal: null, stdout: 'geckodriver\n', stderr: '' };
    }
    if (executable === '/usr/bin/tar' && args[0] === '-xzf') {
      const outputDir = args[3];
      writeFileSync(join(outputDir, 'geckodriver'), 'fixture-geckodriver\n');
      chmodSync(join(outputDir, 'geckodriver'), 0o700);
      return { status: 0, signal: null, stdout: '', stderr: '' };
    }
    if (args[0] === '--version') {
      return {
        status: 0,
        signal: null,
        stdout: `geckodriver ${GECKODRIVER_VERSION}\n`,
        stderr: ''
      };
    }
    return { status: 1, signal: null, stdout: '', stderr: 'unexpected command' };
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('geckodriver provisioner', () => {
  it('downloads, verifies and atomically publishes one pinned host binary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-geckodriver-'));
    roots.push(root);
    const archive = Buffer.from('fixture archive');
    const asset = {
      name: 'geckodriver-fixture.tar.gz',
      sha256: createHash('sha256').update(archive).digest('hex')
    };
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(archive, { status: 200 })));
    const spawnSyncImpl = successfulSpawn();
    const outputDir = join(root, 'geckodriver');

    await expect(
      provisionGeckodriver(['--output-dir', outputDir], {
        platform: 'fixture',
        architecture: 'fixture',
        asset,
        fetchImpl,
        spawnSyncImpl
      })
    ).resolves.toMatchObject({ executablePath: join(outputDir, 'geckodriver') });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({
      schema: GECKODRIVER_CACHE_SCHEMA,
      version: GECKODRIVER_VERSION,
      archiveSha256: asset.sha256
    });
    expect((await lstat(join(outputDir, 'geckodriver'))).mode & 0o777).toBe(0o700);

    const noNetwork = vi.fn(() => Promise.reject(new Error('network should not run')));
    await expect(
      provisionGeckodriver(['--output-dir', outputDir], {
        platform: 'fixture',
        architecture: 'fixture',
        asset,
        fetchImpl: noNetwork,
        spawnSyncImpl
      })
    ).resolves.toMatchObject({ version: GECKODRIVER_VERSION });
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it('rejects a downloaded archive that does not match the pinned digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-geckodriver-digest-'));
    roots.push(root);
    const outputDir = join(root, 'geckodriver');
    await expect(
      provisionGeckodriver(['--output-dir', outputDir], {
        platform: 'fixture',
        architecture: 'fixture',
        asset: { name: 'fixture.tar.gz', sha256: '0'.repeat(64) },
        fetchImpl: () => Promise.resolve(new Response('different', { status: 200 })),
        spawnSyncImpl: successfulSpawn()
      })
    ).rejects.toThrow('GECKODRIVER_ARCHIVE_DIGEST_MISMATCH');
    await expect(lstat(outputDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed on a platform without an official pinned asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-geckodriver-platform-'));
    roots.push(root);
    await expect(
      provisionGeckodriver(['--output-dir', join(root, 'geckodriver')], {
        platform: 'unsupported',
        architecture: 'unsupported'
      })
    ).rejects.toThrow('GECKODRIVER_PLATFORM_UNSUPPORTED');
  });
});
