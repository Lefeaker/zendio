import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const toolPath = resolve('tools/report-build-splitting.mjs');
const CONTENT_RUNTIME_WARNING = 58564;
const CONTENT_RUNTIME_HARD_STOP = 58752;
const ONBOARDING_WARNING = 17377;
const ONBOARDING_HARD_STOP = 17633;
const CHUNK_COUNT_WARNING = 118;
const CHUNK_COUNT_HARD_STOP = 120;

function createSizedSource(bytes: number) {
  return 'x'.repeat(bytes);
}

function writeFixtureFile(root: string, relativePath: string, bytes: number) {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, createSizedSource(bytes), 'utf8');
}

function createChunkSeries(total: number, prefix: string, size = 128) {
  return Array.from({ length: total }, (_, index) => ({
    path: `build/dist/chunks/${prefix}-${index}.js`,
    size
  }));
}

function createFixtureRoot({
  chunkFiles,
  entrySizes = {}
}: {
  chunkFiles: Array<{ path: string; size: number }>;
  entrySizes?: Partial<{
    contentIndex: number;
    contentRuntime: number;
    optionsIndex: number;
    onboardingIndex: number;
  }>;
}) {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-build-splitting-'));

  writeFixtureFile(root, 'build/dist/content/index.js', entrySizes.contentIndex ?? 256);
  writeFixtureFile(root, 'build/dist/content/runtime.js', entrySizes.contentRuntime ?? 55 * 1024);
  writeFixtureFile(root, 'build/dist/options/index.js', entrySizes.optionsIndex ?? 512);
  writeFixtureFile(root, 'build/dist/onboarding/index.js', entrySizes.onboardingIndex ?? 8 * 1024);
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
    const root = createFixtureRoot({
      chunkFiles: [
        {
          path: 'build/dist/chunks/ja.generated-OVER.js',
          size: 65 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-small.js',
          size: 2048
        }
      ]
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('chunks/ja.generated-OVER.js exceeds locale chunk budget');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat qps-ploc generated chunks as production locale budget failures', () => {
    const root = createFixtureRoot({
      chunkFiles: [
        {
          path: 'build/dist/chunks/qps-ploc.generated-OVER.js',
          size: 65 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-small.js',
          size: 2048
        }
      ]
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not apply the locale budget to non-locale chunks below the single chunk limit', () => {
    const root = createFixtureRoot({
      chunkFiles: [
        {
          path: 'build/dist/chunks/feature-large.js',
          size: 70 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-small.js',
          size: 2048
        }
      ]
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps legacy plain locale chunk names under the locale gate', () => {
    const root = createFixtureRoot({
      chunkFiles: [
        {
          path: 'build/dist/chunks/ja-OVER.js',
          size: 65 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-small.js',
          size: 2048
        }
      ]
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('chunks/ja-OVER.js exceeds locale chunk budget');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns without failing when tight budgets exceed warning targets but stay within hard stops', () => {
    const root = createFixtureRoot({
      chunkFiles: createChunkSeries(CHUNK_COUNT_WARNING + 1 - 3, 'warning-chunk'),
      entrySizes: {
        contentRuntime: CONTENT_RUNTIME_WARNING + 16,
        onboardingIndex: ONBOARDING_WARNING + 16
      }
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `warning target ${CONTENT_RUNTIME_WARNING} B; hard stop ${CONTENT_RUNTIME_HARD_STOP} B`
      );
      expect(result.stdout).toContain(
        `warning target ${ONBOARDING_WARNING} B; hard stop ${ONBOARDING_HARD_STOP} B`
      );
      expect(result.stdout).toContain(
        `warning target ${CHUNK_COUNT_WARNING}; hard stop ${CHUNK_COUNT_HARD_STOP}`
      );
      expect(result.stderr).toContain('build/dist/content/runtime.js is above warning target');
      expect(result.stderr).toContain('build/dist/onboarding/index.js is above warning target');
      expect(result.stderr).toContain('chunk count is above warning target');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when chunk count exceeds the hard stop', () => {
    const root = createFixtureRoot({
      chunkFiles: createChunkSeries(CHUNK_COUNT_HARD_STOP + 1 - 3, 'overflow-chunk')
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `chunk count exceeds hard stop: ${CHUNK_COUNT_HARD_STOP + 1} > ${CHUNK_COUNT_HARD_STOP}`
      );
      expect(result.stdout).toContain(
        `warning target ${CHUNK_COUNT_WARNING}; hard stop ${CHUNK_COUNT_HARD_STOP}`
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when the largest shared chunk exceeds the current shared budget', () => {
    const root = createFixtureRoot({
      chunkFiles: [
        {
          path: 'build/dist/chunks/chunk-over.js',
          size: 214 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-mid.js',
          size: 120 * 1024
        },
        {
          path: 'build/dist/chunks/chunk-third.js',
          size: 100 * 1024
        }
      ]
    });

    try {
      const result = runReport(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('chunks/chunk-over.js exceeds shared #1 budget');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
