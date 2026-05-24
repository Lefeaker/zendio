import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-locale-source-alignment.mjs');

interface LocaleFixture {
  configured: string[];
  loaders: string[];
  files: string[];
}

function writeFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function writeFixture({ configured, loaders, files }: LocaleFixture): string {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-locale-source-'));

  writeFile(
    root,
    'src/i18n/config.ts',
    `export function getConfiguredLanguageCodes() { return ${JSON.stringify(configured)}; }\n`
  );
  writeFile(
    root,
    'src/i18n/locales.ts',
    `export function getLocaleCodes() { return ${JSON.stringify(loaders)}; }\n`
  );

  for (const code of files) {
    writeFile(root, `src/i18n/locales/${code}.ts`, 'export default {};\n');
  }

  return root;
}

function runReport(root: string) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8'
  });
}

function reportOutput(result: ReturnType<typeof runReport>): string {
  return `${result.stdout}${result.stderr}`;
}

function expectReportFailure(fixture: LocaleFixture, expected: string[]): void {
  const root = writeFixture(fixture);
  try {
    const result = runReport(root);
    const output = reportOutput(result);

    expect(result.status).not.toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('locale source alignment report', () => {
  it('passes when config, locale loaders, and locale files match', () => {
    const root = writeFixture({
      configured: ['en', 'zh-CN'],
      loaders: ['en', 'zh-CN'],
      files: ['en', 'zh-CN']
    });

    try {
      const result = runReport(root);
      const output = reportOutput(result);

      expect(result.status).toBe(0);
      expect(output).toContain('Configured locale codes: 2');
      expect(output).toContain('Registered locale loaders: 2');
      expect(output).toContain('Locale definition files: 2');
      expect(output).toContain('Missing in locale loaders: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when config has a code with no locale loader', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en'],
        files: ['en', 'zh-CN']
      },
      ['Missing in locale loaders: 1', 'Configured but not registered by locale loaders', 'zh-CN']
    );
  });

  it('fails when a locale loader has no matching config code', () => {
    expectReportFailure(
      {
        configured: ['en'],
        loaders: ['en', 'zh-CN'],
        files: ['en', 'zh-CN']
      },
      ['Missing in config: 1', 'Registered by locale loaders but not configured', 'zh-CN']
    );
  });

  it('fails when a locale file exists without a locale loader', () => {
    expectReportFailure(
      {
        configured: ['en'],
        loaders: ['en'],
        files: ['en', 'zh-CN']
      },
      [
        'Unregistered locale files: 1',
        'Locale definition files not registered in locale loaders',
        'zh-CN'
      ]
    );
  });

  it('fails when a locale loader has no matching locale file', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        files: ['en']
      },
      ['Missing locale files: 1', 'Configured but missing locale definition file', 'zh-CN']
    );
  });
});
