import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;

  for (const [entry, contents] of Object.entries(entries)) {
    const payload = Buffer.from(contents);
    const localEntry = createLocalFileEntry(entry, payload);
    localEntries.push(localEntry);
    centralEntries.push(createCentralDirectoryEntry(entry, payload.length, offset));
    offset += localEntry.length;
  }

  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(archivePath, Buffer.concat([...localEntries, centralDirectory, end]));
}

function createLocalFileEntry(entry: string, payload: Buffer): Buffer {
  const name = Buffer.from(entry);
  const buffer = Buffer.alloc(30 + name.length + payload.length);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt32LE(payload.length, 18);
  buffer.writeUInt32LE(payload.length, 22);
  buffer.writeUInt16LE(name.length, 26);
  name.copy(buffer, 30);
  payload.copy(buffer, 30 + name.length);
  return buffer;
}

function createCentralDirectoryEntry(
  entry: string,
  size: number,
  localHeaderOffset: number
): Buffer {
  const name = Buffer.from(entry);
  const buffer = Buffer.alloc(46 + name.length);
  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(20, 6);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt32LE(size, 20);
  buffer.writeUInt32LE(size, 24);
  buffer.writeUInt16LE(name.length, 28);
  buffer.writeUInt32LE(localHeaderOffset, 42);
  name.copy(buffer, 46);
  return buffer;
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
