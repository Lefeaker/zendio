import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const toolPath = resolve('tools/report-build-splitting.mjs');

function createSizedSource(bytes: number) {
  return 'x'.repeat(bytes);
}

function writeFixtureFile(root: string, relativePath: string, bytes: number) {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, createSizedSource(bytes), 'utf8');
}

function createFixtureRoot(chunkFiles: Array<{ path: string; size: number }>) {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-build-splitting-'));

  writeFixtureFile(root, 'build/dist/content/index.js', 256);
  writeFixtureFile(root, 'build/dist/content/runtime.js', 56 * 1024);
  writeFixtureFile(root, 'build/dist/options/index.js', 512);
  writeFixtureFile(root, 'build/dist/onboarding/index.js', 8 * 1024);
  writeFixtureFile(root, 'build/dist/chunks/chunk-a.js', 1024);
  writeFixtureFile(root, 'build/dist/chunks/chunk-b.js', 1024);
  writeFixtureFile(root, 'build/dist/chunks/chunk-c.js', 1024);

  for (const chunkFile of chunkFiles) {
    writeFixtureFile(root, chunkFile.path, chunkFile.size);
  }

  return root;
}

function runReport(root: string) {
  return spawnSync(process.execPath, [toolPath], {
    cwd: root,
    encoding: 'utf8'
  });
}

describe('report-build-splitting', () => {
  it('fails when a generated release locale chunk exceeds the locale budget', () => {
    const root = createFixtureRoot([
      {
        path: 'build/dist/chunks/ja.generated-OVER.js',
        size: 61 * 1024
      },
      {
        path: 'build/dist/chunks/chunk-small.js',
        size: 2048
      }
    ]);

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('chunks/ja.generated-OVER.js exceeds locale chunk budget');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat qps-ploc generated chunks as production locale budget failures', () => {
    const root = createFixtureRoot([
      {
        path: 'build/dist/chunks/qps-ploc.generated-OVER.js',
        size: 61 * 1024
      },
      {
        path: 'build/dist/chunks/chunk-small.js',
        size: 2048
      }
    ]);

    try {
      const result = runReport(root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not apply the locale budget to non-locale chunks below the single chunk limit', () => {
    const root = createFixtureRoot([
      {
        path: 'build/dist/chunks/feature-large.js',
        size: 70 * 1024
      },
      {
        path: 'build/dist/chunks/chunk-small.js',
        size: 2048
      }
    ]);

    try {
      const result = runReport(root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps legacy plain locale chunk names under the locale gate', () => {
    const root = createFixtureRoot([
      {
        path: 'build/dist/chunks/ja-OVER.js',
        size: 61 * 1024
      },
      {
        path: 'build/dist/chunks/chunk-small.js',
        size: 2048
      }
    ]);

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('chunks/ja-OVER.js exceeds locale chunk budget');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
