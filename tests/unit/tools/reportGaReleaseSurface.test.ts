import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-ga-release-surface.mjs');

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

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-ga-release-surface-'));
  const distDir = join(root, 'build', 'dist');
  writeFile(distDir, 'content/runtime.js', 'console.info("clean runtime surface");\n');
  return { root, distDir };
}

function runReport(distDir: string, archivePaths: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      '--check',
      '--dist',
      distDir,
      ...archivePaths.flatMap((archivePath) => ['--archive', archivePath])
    ],
    {
      encoding: 'utf8'
    }
  );
}

describe('report-ga-release-surface', () => {
  it('passes clean build output plus separate Chrome ZIP and Firefox XPI artifacts', () => {
    const fixture = createFixture();
    const chromeZip = join(fixture.root, 'fixture.zip');
    const firefoxXpi = join(fixture.root, 'fixture.xpi');
    createZipArchive(chromeZip, { 'content/runtime.js': 'console.info("chrome clean");\n' });
    createZipArchive(firefoxXpi, { 'content/runtime.js': 'console.info("firefox clean");\n' });

    try {
      const result = runReport(fixture.distDir, [chromeZip, firefoxXpi]);

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');
      expect(result.stdout + result.stderr).toContain('fixture.zip');
      expect(result.stdout + result.stderr).toContain('fixture.xpi');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails when build output contains a direct Google Measurement Protocol endpoint', () => {
    const fixture = createFixture();
    writeFile(
      fixture.distDir,
      'content/runtime.js',
      'fetch("https://www.google-analytics.com/debug/mp/collect");\n'
    );

    try {
      const result = runReport(fixture.distDir);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('build/dist');
      expect(result.stdout + result.stderr).toContain('google endpoint');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails when only the Firefox XPI leaks raw event params in a debug success log', () => {
    const fixture = createFixture();
    const chromeZip = join(fixture.root, 'fixture.zip');
    const firefoxXpi = join(fixture.root, 'fixture.xpi');
    createZipArchive(chromeZip, { 'content/runtime.js': 'console.info("chrome clean");\n' });
    createZipArchive(firefoxXpi, {
      'content/runtime.js':
        'console.info("[analytics-events] Event sent (debug):", { eventName, params, transportMode });\n'
    });

    try {
      const result = runReport(fixture.distDir, [chromeZip, firefoxXpi]);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('fixture.xpi');
      expect(result.stdout + result.stderr).toContain('debug success log');
      expect(result.stdout + result.stderr).toContain('params');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
