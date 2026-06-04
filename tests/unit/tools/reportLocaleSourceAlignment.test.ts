import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-locale-source-alignment.mjs');

interface LocaleFixture {
  configured: string[];
  loaders: string[];
  modules: string[];
  catalogRelease?: string[];
  generatedRelease?: string[];
  catalogRuntimeSources?: string[];
  catalogStaticSources?: string[];
  catalogSchemaSources?: string[];
  publicFolders?: string[];
  publicFolderMap?: Record<string, string>;
}

function writeFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function writeFixture(fixture: LocaleFixture): string {
  const { configured, loaders, modules } = fixture;
  const folderMap =
    fixture.publicFolderMap ?? Object.fromEntries(configured.map((code) => [code, code]));
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-locale-source-'));

  writeFile(
    root,
    'src/i18n/config.ts',
    `const folders = ${JSON.stringify(folderMap)};\nexport function getConfiguredLanguageCodes() { return ${JSON.stringify(configured)}; }\nexport function getWebExtensionLocaleFolder(code) { return folders[code]; }\n`
  );
  writeFile(
    root,
    'src/i18n/locales.ts',
    `export function getLocaleCodes() { return ${JSON.stringify(loaders)}; }\n`
  );
  writeFile(
    root,
    'src/i18n/catalog/languages.ts',
    `export const RELEASE_LANGUAGE_ORDER = ${JSON.stringify(fixture.catalogRelease ?? configured)};\n`
  );
  writeFile(
    root,
    'src/i18n/generated/localeRegistry.generated.ts',
    `export const GENERATED_RELEASE_LOCALE_CODES = ${JSON.stringify(
      fixture.generatedRelease ?? fixture.catalogRelease ?? configured
    )};\n`
  );

  for (const code of modules) {
    writeFile(root, `src/i18n/generated/locales/${code}.generated.ts`, 'export default {};\n');
  }
  for (const code of fixture.catalogRuntimeSources ?? fixture.catalogRelease ?? configured) {
    writeFile(root, `src/i18n/catalog/messages/${code}/runtime.json`, '{}\n');
  }
  for (const code of fixture.catalogStaticSources ?? fixture.catalogRelease ?? configured) {
    writeFile(root, `src/i18n/catalog/messages/${code}/static.json`, '{}\n');
  }
  for (const code of fixture.catalogSchemaSources ?? fixture.catalogRelease ?? configured) {
    writeFile(root, `src/i18n/catalog/messages/${code}/schema.json`, '{}\n');
  }
  for (const folder of fixture.publicFolders ?? configured.map((code) => folderMap[code])) {
    writeFile(root, `public/_locales/${folder}/messages.json`, '{}\n');
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
  it('passes when config, locale loaders, generated modules, and catalog sources match', () => {
    const root = writeFixture({
      configured: ['en', 'zh-CN'],
      loaders: ['en', 'zh-CN'],
      modules: ['en', 'zh-CN']
    });

    try {
      const result = runReport(root);
      const output = reportOutput(result);

      expect(result.status).toBe(0);
      expect(output).toContain('Configured locale codes: 2');
      expect(output).toContain('Registered locale loaders: 2');
      expect(output).toContain('Generated locale modules: 2');
      expect(output).toContain('Catalog release languages: 2');
      expect(output).toContain('Generated release locale codes: 2');
      expect(output).toContain('Catalog runtime source directories: 2');
      expect(output).toContain('Catalog static source directories: 2');
      expect(output).toContain('Catalog schema source directories: 2');
      expect(output).toContain('Public WebExtension locale folders: 2');
      expect(output).toContain('Missing in locale loaders: 0');
      expect(output).toContain('Missing generated locale modules: 0');
      expect(output).toContain('Missing in generated release registry: 0');
      expect(output).toContain('Missing public WebExtension folders: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when config has a code with no locale loader', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en'],
        modules: ['en', 'zh-CN']
      },
      ['Missing in locale loaders: 1', 'Configured but not registered by locale loaders', 'zh-CN']
    );
  });

  it('fails when a locale loader has no matching config code', () => {
    expectReportFailure(
      {
        configured: ['en'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN']
      },
      ['Missing in config: 1', 'Registered by locale loaders but not configured', 'zh-CN']
    );
  });

  it('fails when a generated locale module exists without a locale loader', () => {
    expectReportFailure(
      {
        configured: ['en'],
        loaders: ['en'],
        modules: ['en', 'zh-CN']
      },
      [
        'Unregistered generated locale modules: 1',
        'Generated locale modules not registered in locale loaders',
        'zh-CN'
      ]
    );
  });

  it('fails when a locale loader has no matching generated locale module', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en']
      },
      ['Missing generated locale modules: 1', 'Configured but missing generated locale module', 'zh-CN']
    );
  });

  it('fails when catalog release metadata and generated registry drift', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN'],
        catalogRelease: ['en', 'zh-CN'],
        generatedRelease: ['en']
      },
      [
        'Missing in generated release registry: 1',
        'Catalog release languages missing from generated registry',
        'zh-CN'
      ]
    );
  });

  it('fails when a catalog schema source directory is missing', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN'],
        catalogRelease: ['en', 'zh-CN'],
        catalogSchemaSources: ['en']
      },
      [
        'Missing catalog schema source directories: 1',
        'Catalog release languages missing schema source directory',
        'zh-CN'
      ]
    );
  });

  it('fails when a catalog runtime source directory is missing', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN'],
        catalogRelease: ['en', 'zh-CN'],
        catalogRuntimeSources: ['en']
      },
      [
        'Missing catalog runtime source directories: 1',
        'Catalog release languages missing runtime source directory',
        'zh-CN'
      ]
    );
  });

  it('fails when a catalog static source directory is missing', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN'],
        catalogRelease: ['en', 'zh-CN'],
        catalogStaticSources: ['en']
      },
      [
        'Missing catalog static source directories: 1',
        'Catalog release languages missing static source directory',
        'zh-CN'
      ]
    );
  });

  it('fails when public WebExtension locale folders drift from runtime mapping', () => {
    expectReportFailure(
      {
        configured: ['en', 'zh-CN'],
        loaders: ['en', 'zh-CN'],
        modules: ['en', 'zh-CN'],
        publicFolderMap: { en: 'en', 'zh-CN': 'zh_CN' },
        publicFolders: ['en']
      },
      [
        'Missing public WebExtension folders: 1',
        'Expected public WebExtension locale folders missing from public/_locales',
        'zh_CN'
      ]
    );
  });
});
