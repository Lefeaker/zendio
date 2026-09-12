import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const TrialConfigSchema = z.object({
  isTrial: z.literal(true),
  expirationTime: z.number(),
  trialDays: z.number(),
  createdAt: z.number(),
  version: z.literal('trial')
});

function runPackageScriptJson<T>(code: string, schema: z.ZodType<T>): T {
  const stdout = execFileSync('node', ['-e', code], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return schema.parse(JSON.parse(stdout));
}

describe('package script trial config contract', () => {
  function runInvalidPackageArgs(args: string[]): void {
    execFileSync(
      'node',
      [
        '-e',
        `import('./scripts/package.mjs').then(({ normalizeTrialDays }) => normalizeTrialDays(${JSON.stringify(args)}));`
      ],
      { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }
    );
  }

  it('normalizes missing trial days to the default and parses valid values strictly', () => {
    const values = runPackageScriptJson(
      "import('./scripts/package.mjs').then(({ normalizeTrialDays }) => process.stdout.write(JSON.stringify([normalizeTrialDays(['node', 'scripts/package.mjs']), normalizeTrialDays(['node', 'scripts/package.mjs', '--trial-days=14'])])));",
      z.array(z.number())
    );

    expect(values).toEqual([7, 14]);
  });

  it('rejects non-decimal and out-of-range trial day values', () => {
    for (const args of [
      ['node', 'scripts/package.mjs', '--trial-days=0'],
      ['node', 'scripts/package.mjs', '--trial-days=-1'],
      ['node', 'scripts/package.mjs', '--trial-days=14abc'],
      ['node', 'scripts/package.mjs', '--trial-days=abc'],
      ['node', 'scripts/package.mjs', '--trial-days=31']
    ]) {
      expect(() => runInvalidPackageArgs(args), args.join(' ')).toThrow(
        'must be a base-10 integer from 1 to 30'
      );
    }
  });

  it('creates a valid local trial channel config', () => {
    const config = runPackageScriptJson(
      "import('./scripts/package.mjs').then(({ createTrialConfig }) => process.stdout.write(JSON.stringify(createTrialConfig(14, 1700000000000))));",
      TrialConfigSchema
    );

    expect(config).toEqual({
      isTrial: true,
      expirationTime: 1_701_209_600_000,
      trialDays: 14,
      createdAt: 1_700_000_000_000,
      version: 'trial'
    });
  });
});

describe('Edge distribution contract', () => {
  it('selects a separate Edge directory and preserves the Chrome release grammar', () => {
    const result = runPackageScriptJson(
      `import('./scripts/package.mjs').then(({ parsePackageArguments }) => {
        let releaseError = '';
        try { parsePackageArguments(['--dist-dir', '/tmp/dist', '--output-dir', '/tmp/release', '--require-absent-output', '--edge']); }
        catch (error) { releaseError = error.message; }
        process.stdout.write(JSON.stringify({
          chrome: parsePackageArguments([]).distDir,
          edge: parsePackageArguments(['--edge']).distDir,
          explicit: parsePackageArguments(['--dist-dir', 'build/custom-edge', '--edge']).distDir,
          releaseError
        }));
      });`,
      z.object({
        chrome: z.string(),
        edge: z.string(),
        explicit: z.string(),
        releaseError: z.string()
      })
    );
    expect(result).toEqual({
      chrome: 'build/dist',
      edge: 'build/dist-edge',
      explicit: 'build/custom-edge',
      releaseError: 'PACKAGE_RELEASE_ARGUMENTS_INVALID'
    });
  });

  it('rejects Firefox manifests, custom update URLs and Chrome-branded localized store metadata', () => {
    const errors = runPackageScriptJson(
      `Promise.all([import('./scripts/package.mjs'), import('node:fs/promises'), import('node:os'), import('node:path')]).then(async ([{ packageExtension }, fs, os, path]) => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zendio-edge-package-'));
        const base = {manifest_version: 3, name: '__MSG_extName__', description: '__MSG_extDescription__', version: '0.3.0', default_locale: 'en', background: {service_worker: 'background/index.js'}};
        const cases = [
          {manifest: {...base, background: {scripts: ['background/index.js']}}},
          {manifest: {...base, update_url: 'https://example.test/update'}},
          {manifest: base, enName: 'Zendio for Chrome'},
          {manifest: base, zhDescription: 'Chrome 剪藏插件'}
        ];
        const errors = [];
        try {
          for (let i = 0; i < cases.length; i++) {
            const input = cases[i]; const dist = path.join(root, String(i));
            for (const locale of ['en', 'zh_CN']) {
              await fs.mkdir(path.join(dist, '_locales', locale), {recursive: true});
              await fs.writeFile(path.join(dist, '_locales', locale, 'messages.json'), JSON.stringify({
                extName: {message: locale === 'en' ? (input.enName ?? 'Zendio') : 'Zendio'},
                extDescription: {message: locale === 'zh_CN' ? (input.zhDescription ?? '剪藏插件') : 'Web clipper'}
              }));
            }
            await fs.writeFile(path.join(dist, 'manifest.json'), JSON.stringify(input.manifest));
            try { await packageExtension({argv: ['--edge', '--dist-dir', dist]}); errors.push('accepted'); }
            catch (error) { errors.push(error.message); }
          }
          process.stdout.write(JSON.stringify(errors));
        } finally { await fs.rm(root, {recursive: true, force: true}); }
      });`,
      z.array(z.string())
    );
    expect(errors).toEqual([
      'EDGE_PACKAGE_MANIFEST_INVALID',
      'EDGE_PACKAGE_MANIFEST_INVALID',
      'EDGE_PACKAGE_CHROME_BRANDING:en',
      'EDGE_PACKAGE_CHROME_BRANDING:zh_CN'
    ]);
  });
});
