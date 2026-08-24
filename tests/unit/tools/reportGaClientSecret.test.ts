import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';

const scriptPath = resolve('tools/report-ga-client-secret.mjs');

interface FixtureOptions {
  sourceFiles?: Record<string, string>;
  distFiles?: Record<string, string>;
  archives?: Array<{ fileName: string; entries: Record<string, string> }>;
}

function writeFile(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

function createZipArchive(archivePath: string, entries: Record<string, string>): void {
  writeFileSync(
    archivePath,
    buildZipFixture(Object.entries(entries).map(([path, content]) => ({ path, content })))
  );
}

function createFixture({ sourceFiles = {}, distFiles = {}, archives = [] }: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-ga-client-secret-'));
  const sourceDir = join(root, 'src');
  const distDir = join(root, 'build', 'dist');

  writeFile(sourceDir, 'shared/analytics/runtime.ts', 'export const telemetry = "proxy-only";\n');
  writeFile(distDir, 'content/runtime.js', 'console.info("clean runtime bundle");\n');

  for (const [relativePath, contents] of Object.entries(sourceFiles)) {
    writeFile(sourceDir, relativePath, contents);
  }

  for (const [relativePath, contents] of Object.entries(distFiles)) {
    writeFile(distDir, relativePath, contents);
  }

  const archivePaths = archives.map(({ fileName, entries }) => {
    const archivePath = join(root, fileName);
    createZipArchive(archivePath, entries);
    return archivePath;
  });

  return { root, sourceDir, distDir, archivePaths };
}

function runReport(sourceDir: string, distDir: string, archivePaths: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      '--check',
      '--source',
      sourceDir,
      '--dist',
      distDir,
      ...archivePaths.flatMap((archivePath) => ['--archive', archivePath])
    ],
    {
      encoding: 'utf8'
    }
  );
}

describe('report-ga-client-secret', () => {
  it('passes clean client source, build output, and package artifacts', () => {
    const fixture = createFixture({
      sourceFiles: {
        'shared/analytics/ownerProxy.ts':
          'export const ownerProxy = "https://analytics.example.test/debug/mp/collect";\n'
      },
      archives: [
        {
          fileName: 'clean.zip',
          entries: {
            'content/runtime.js': 'console.info("clean chrome package");\n'
          }
        },
        {
          fileName: 'clean.xpi',
          entries: {
            'content/runtime.js': 'console.info("clean firefox package");\n'
          }
        }
      ]
    });

    try {
      const result = runReport(fixture.sourceDir, fixture.distDir, fixture.archivePaths);

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails when build output contains a direct Google endpoint or secret-like GA token', () => {
    const fixture = createFixture({
      distFiles: {
        'content/runtime.js':
          'const endpoint = "https://www.google-analytics.com/mp/collect"; const secret = "GA4_API_SECRET";\n'
      }
    });

    try {
      const result = runReport(fixture.sourceDir, fixture.distDir);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('build/dist');
      expect(result.stdout + result.stderr).toContain('google endpoint');
      expect(result.stdout + result.stderr).toContain('GA4_API_SECRET');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails on canonical-equivalent Google endpoint variants in source, dist, and archives', () => {
    const fixture = createFixture({
      sourceFiles: {
        'shared/analytics/sourceLeak.ts':
          'export const endpoint = "https://www.google-analytics.com./mp/collect";\n'
      },
      distFiles: {
        'content/runtime.js':
          'const endpoint = "https://www.google-analytics.com/%6d%70/%63ollect";\n'
      },
      archives: [
        {
          fileName: 'encoded.zip',
          entries: {
            'content/runtime.js': 'fetch("https://google-analytics.com./debug/%6d%70/collect");\n'
          }
        }
      ]
    });

    try {
      const result = runReport(fixture.sourceDir, fixture.distDir, fixture.archivePaths);
      const output = result.stdout + result.stderr;

      expect(result.status).not.toBe(0);
      expect(output).toContain('src');
      expect(output).toContain('build/dist');
      expect(output).toContain('encoded.zip');
      expect(output.match(/google endpoint/g)?.length).toBeGreaterThanOrEqual(3);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails when a packaged runtime archive leaks owner-only GA secret names', () => {
    const fixture = createFixture({
      archives: [
        {
          fileName: 'fixture.xpi',
          entries: {
            'content/runtime.js':
              'const leaked = "AIIINOB_GA_API_SECRET"; const debugProxySecret = "owner-only";\n'
          }
        }
      ]
    });

    try {
      const result = runReport(fixture.sourceDir, fixture.distDir, fixture.archivePaths);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('fixture.xpi');
      expect(result.stdout + result.stderr).toContain('AIIINOB_GA_API_SECRET');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
