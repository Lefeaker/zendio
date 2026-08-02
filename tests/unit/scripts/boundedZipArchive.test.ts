import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  inventoryBoundedZip,
  readBoundedZipText
} from '../../../scripts/utils/boundedZipArchive.mjs';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';

function withArchive(bytes: Buffer, run: (path: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'zendio-bounded-zip-'));
  const path = join(root, 'fixture.zip');
  writeFileSync(path, bytes, { mode: 0o600 });
  return run(path).finally(() => rmSync(root, { recursive: true, force: true }));
}

describe('bounded ZIP archive owner', () => {
  it('rejects a real FIFO within a short bounded interval without opening it for a blocking read', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zendio-bounded-zip-fifo-'));
    const fifo = join(root, 'archive.zip');
    execFileSync('/usr/bin/mkfifo', [fifo]);
    let timer: NodeJS.Timeout | undefined;
    try {
      const bounded = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('FIFO_TEST_TIMEOUT')), 500);
      });
      await expect(Promise.race([inventoryBoundedZip(fifo), bounded])).rejects.toThrow(
        'ZIP_ARCHIVE_NOT_REGULAR'
      );
    } finally {
      if (timer) clearTimeout(timer);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects symlinks even when O_NOFOLLOW is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zendio-bounded-zip-symlink-'));
    const target = join(root, 'target.zip');
    const link = join(root, 'archive.zip');
    writeFileSync(target, buildZipFixture([{ path: 'ok.txt', content: 'ok' }]));
    symlinkSync(target, link);
    const withoutNoFollow = {
      ...fsConstants,
      O_NOFOLLOW: undefined
    };
    try {
      await expect(
        inventoryBoundedZip(link, {}, { fsConstantsImpl: withoutNoFollow })
      ).rejects.toThrow('ZIP_ARCHIVE_NOT_REGULAR');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('transfers the regular-file descriptor to yauzl and does not close it twice', async () => {
    const closeSyncImpl = vi.fn(closeSync);
    await withArchive(buildZipFixture([{ path: 'ok.txt', content: 'ok' }]), async (archive) => {
      await expect(inventoryBoundedZip(archive, {}, { closeSyncImpl })).resolves.toMatchObject({
        entryCount: 1
      });
      expect(closeSyncImpl).not.toHaveBeenCalled();
    });
  });

  it('closes the caller-owned descriptor exactly once when the path identity changes after open', async () => {
    const closeSyncImpl = vi.fn(closeSync);
    await withArchive(buildZipFixture([{ path: 'ok.txt', content: 'ok' }]), async (archive) => {
      const openAndReplace = (path: string, flags: number) => {
        const fd = openSync(path, flags);
        renameSync(path, `${path}.opened`);
        writeFileSync(path, buildZipFixture([{ path: 'ok.txt', content: 'ok' }]));
        return fd;
      };
      await expect(
        inventoryBoundedZip(archive, {}, { closeSyncImpl, openSyncImpl: openAndReplace })
      ).rejects.toThrow('ZIP_ARCHIVE_IDENTITY_CHANGED');
      expect(closeSyncImpl).toHaveBeenCalledTimes(1);
    });
  });

  it('reads stored, deflated, empty, directory, and both descriptor forms', async () => {
    const bytes = buildZipFixture([
      { path: 'dir/', externalFileAttributes: 0o040755 << 16, versionMadeBy: 3 << 8 },
      {
        path: 'dir/stored.txt',
        content: 'stored',
        externalFileAttributes: 0o100644 << 16,
        versionMadeBy: 3 << 8
      },
      { path: 'deflated.txt', content: 'deflated', method: 8, descriptor: 'signature' },
      { path: 'descriptor.txt', content: 'descriptor', method: 8, descriptor: 'no-signature' },
      { path: 'empty.txt', content: '', method: 8 }
    ]);
    await withArchive(bytes, async (path) => {
      const inventory = await inventoryBoundedZip(path);
      expect(inventory.entryCount).toBe(5);
      expect(inventory.entries.map((entry: { path: string }) => entry.path)).toEqual([
        'dir/',
        'dir/stored.txt',
        'deflated.txt',
        'descriptor.txt',
        'empty.txt'
      ]);
      expect(await readBoundedZipText(inventory.entries[0])).toBeNull();
      expect(await readBoundedZipText(inventory.entries[2])).toBe('deflated');
    });
  });

  it.each([
    { label: 'absolute', path: '/escape', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'drive', path: 'C:/escape', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'backslash', path: 'a\\b', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'traversal', path: 'a/../b', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'dot', path: 'a/./b', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'repeat separator', path: 'a//b', code: 'ZIP_PATH_UNSAFE', flags: 0 },
    { label: 'non-NFC', path: 'e\u0301.txt', code: 'ZIP_PATH_NOT_NFC', flags: 0x0800 }
  ])('rejects $label paths', async ({ path, code, flags }) => {
    await withArchive(buildZipFixture([{ path, content: 'x', flags }]), async (archive) => {
      await expect(inventoryBoundedZip(archive)).rejects.toThrow(code);
    });
  });

  it('rejects duplicate, case-ambiguous, and file-prefix collisions', async () => {
    const cases = [
      [
        { path: 'same', content: 'a' },
        { path: 'same', content: 'b' }
      ],
      [
        { path: 'Case', content: 'a' },
        { path: 'case', content: 'b' }
      ],
      [
        { path: 'a', content: 'a' },
        { path: 'a/b', content: 'b' }
      ]
    ];
    for (const entries of cases) {
      await withArchive(buildZipFixture(entries), async (archive) => {
        await expect(inventoryBoundedZip(archive)).rejects.toThrow(/ZIP_(?:DUPLICATE|CASE|FILE)/u);
      });
    }
  });

  it.each([
    [
      'local extra',
      [{ path: 'x', content: 'x', localExtra: Buffer.from([1]) }],
      {},
      'ZIP_LOCAL_EXTRA_FORBIDDEN'
    ],
    [
      'central extra',
      [{ path: 'x', content: 'x', centralExtra: Buffer.from([1]) }],
      {},
      'ZIP_CENTRAL_EXTRA_FORBIDDEN'
    ],
    [
      'entry comment',
      [{ path: 'x', content: 'x', comment: Buffer.from([1]) }],
      {},
      'ZIP_ENTRY_COMMENT_FORBIDDEN'
    ],
    [
      'archive comment',
      [{ path: 'x', content: 'x' }],
      { archiveComment: Buffer.from([1]) },
      'ZIP_ARCHIVE_COMMENT_FORBIDDEN'
    ],
    [
      'leading byte',
      [{ path: 'x', content: 'x' }],
      { prefix: Buffer.from([1]) },
      'ZIP_HIDDEN_OR_OVERLAPPING_BYTES'
    ],
    [
      'inter-entry byte',
      [
        { path: 'a', content: 'a' },
        { path: 'b', content: 'b' }
      ],
      { interEntryPadding: Buffer.from([1]) },
      'ZIP_HIDDEN_OR_OVERLAPPING_BYTES'
    ],
    [
      'pre-central byte',
      [{ path: 'x', content: 'x' }],
      { preCentralPadding: Buffer.from([1]) },
      'ZIP_HIDDEN_OR_OVERLAPPING_BYTES'
    ],
    [
      'post-EOCD byte',
      [{ path: 'x', content: 'x' }],
      { trailer: Buffer.from([1]) },
      'ZIP_EOCD_MISSING'
    ]
  ])('rejects %s', async (_label, entries, options, code) => {
    await withArchive(buildZipFixture(entries, options), async (archive) => {
      await expect(inventoryBoundedZip(archive)).rejects.toThrow(code);
    });
  });

  it('rejects unsupported flags, methods, and Unix special types', async () => {
    const cases = [
      buildZipFixture([{ path: 'x', content: 'x', flags: 1 }]),
      buildZipFixture([{ path: 'x', content: 'x', method: 99 }]),
      buildZipFixture([
        {
          path: 'pipe',
          content: '',
          versionMadeBy: 3 << 8,
          externalFileAttributes: 0o010644 << 16
        }
      ])
    ];
    for (const bytes of cases) {
      await withArchive(bytes, async (archive) => {
        await expect(inventoryBoundedZip(archive)).rejects.toThrow(
          /ZIP_(?:FLAGS|METHOD|ENTRY_TYPE)/u
        );
      });
    }
  });

  it('rejects CRC drift before delivering entries to the consumer', async () => {
    const bytes = buildZipFixture([{ path: 'x', content: 'payload' }]);
    bytes[30 + 1] ^= 0xff;
    const delivered: string[] = [];
    await withArchive(bytes, async (archive) => {
      await expect(
        inventoryBoundedZip(archive, {
          onEntry(entry: { path: string }) {
            delivered.push(entry.path);
          }
        })
      ).rejects.toThrow(/CRC|invalid stored block|size mismatch/iu);
      expect(delivered).toEqual([]);
    });
  });

  it('keeps yauzl/crc ownership unique and removes consumer-local parsers', () => {
    const owner = readFileSync('scripts/utils/boundedZipArchive.mjs', 'utf8');
    expect(owner).toContain("from 'yauzl'");
    expect(owner).toContain("from 'crc-32'");
    for (const path of [
      'scripts/utils/firefoxAmoSourceArchive.mjs',
      'tools/audit-release-archive.mjs',
      'tools/report-release-surface.mjs',
      'tools/report-ga-client-secret.mjs',
      'tools/report-ga-release-surface.mjs'
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toContain('inflateRawSync');
      expect(source).not.toContain('0x06054b50');
      expect(source).not.toContain('0x02014b50');
      expect(source).not.toContain('0x04034b50');
    }
  });
});
