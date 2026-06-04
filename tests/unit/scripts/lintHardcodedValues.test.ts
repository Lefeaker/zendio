import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface HardcodedIssue {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  match: string;
}

interface HardcodedValueLinterInstance {
  errors: HardcodedIssue[];
  warnings: HardcodedIssue[];
  lintFile(filePath: string, relativePath: string): Promise<void>;
}

type HardcodedValueLinterConstructor = new () => HardcodedValueLinterInstance;

const tempDirs: string[] = [];
const LOCAL_REST_HOST = ['127', '0', '0', '1'].join('.');
const HTTPS_REST_PORT = 27_124;
const HTTP_REST_PORT = 27_123;
const HTTPS_REST_URL = `https://${LOCAL_REST_HOST}:${HTTPS_REST_PORT}/`;
const HTTP_REST_URL = `http://${LOCAL_REST_HOST}:${HTTP_REST_PORT}/`;

async function loadLinter(): Promise<HardcodedValueLinterConstructor> {
  const moduleUrl = new URL('../../../scripts/lint-hardcoded-values.mjs', import.meta.url).href;
  const module = (await import(moduleUrl)) as {
    HardcodedValueLinter: HardcodedValueLinterConstructor;
  };
  return module.HardcodedValueLinter;
}

async function lintSource(
  relativePath: string,
  source: string
): Promise<HardcodedValueLinterInstance> {
  const Linter = await loadLinter();
  const tempDir = await mkdtemp(join(tmpdir(), 'aiiinob-hardcoded-lint-'));
  tempDirs.push(tempDir);
  const filePath = join(tempDir, relativePath.split('/').pop() ?? 'fixture.ts');
  await writeFile(filePath, source, 'utf8');
  const linter = new Linter();
  await linter.lintFile(filePath, relativePath);
  return linter;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('lint-hardcoded-values allowlists', () => {
  it('allows localized REST examples only on onboarding detail keys', async () => {
    const linter = await lintSource(
      'i18n/locales/en.ts',
      [
        'export const en = {',
        `  step1Detail3: 'Note the HTTPS URL (usually ${HTTPS_REST_URL})',`,
        `  step1Detail4: 'Note the HTTP URL (usually ${HTTP_REST_URL})',`,
        '};'
      ].join('\n')
    );

    expect(linter.errors).toEqual([]);
  });

  it('rejects localized REST literals outside onboarding detail keys', async () => {
    const linter = await lintSource(
      'i18n/locales/en.ts',
      ['export const en = {', `  runtimeDefaultUrl: '${HTTPS_REST_URL}',`, '};'].join('\n')
    );

    expect(linter.errors.length).toBeGreaterThan(0);
  });

  it('allows generated localized REST examples only on onboarding detail keys', async () => {
    const allowed = await lintSource(
      'i18n/generated/localeRegistry.generated.ts',
      [
        'export const GENERATED_LOCALE_MESSAGES_EN = {',
        `  step1Detail3: 'Note the HTTPS URL (usually ${HTTPS_REST_URL})',`,
        `  step1Detail4: 'Note the HTTP URL (usually ${HTTP_REST_URL})',`,
        '};'
      ].join('\n')
    );
    expect(allowed.errors).toEqual([]);

    const rejected = await lintSource(
      'i18n/generated/localeRegistry.generated.ts',
      [
        'export const GENERATED_LOCALE_MESSAGES_EN = {',
        `  runtimeDefaultUrl: '${HTTPS_REST_URL}',`,
        '};'
      ].join('\n')
    );
    expect(rejected.errors.length).toBeGreaterThan(0);
  });

  it('allows only exact onboarding fallback REST detail items', async () => {
    const linter = await lintSource(
      'onboarding/index.html',
      [
        '<ul>',
        `  <li data-i18n="step1Detail3">记录 HTTPS URL（通常是 ${HTTPS_REST_URL}）</li>`,
        `  <li data-i18n="step1Detail4">记录 HTTP URL（通常是 ${HTTP_REST_URL}）</li>`,
        '</ul>'
      ].join('\n')
    );

    expect(linter.errors).toEqual([]);
  });

  it('continues to reject runtime REST placeholders outside product examples', async () => {
    const linter = await lintSource(
      'options/app/runtimeConfig.ts',
      `const placeholder = '${HTTPS_REST_URL}';`
    );

    expect(linter.errors.length).toBeGreaterThan(0);
  });

  it('allows exact changelog REST examples but not runtime copies', async () => {
    const changelog = await lintSource(
      'options/app/changelogContent.ts',
      [`<pre><code>HTTPS URL: ${HTTPS_REST_URL}`, `HTTP URL:  ${HTTP_REST_URL}`].join('\n')
    );
    expect(changelog.errors).toEqual([]);

    const runtime = await lintSource(
      'options/app/runtimeConfig.ts',
      `const baseUrl = '${HTTPS_REST_URL}';`
    );
    expect(runtime.errors.length).toBeGreaterThan(0);
  });
});
