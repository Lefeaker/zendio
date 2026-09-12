import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import { createReleaseArtifactFileName } from '../../../scripts/utils/releaseArtifactNames.mjs';

const roots: string[] = [];
const sha = 'a'.repeat(40);
const PrepareResultSchema = z.object({
  schema: z.literal('chrome-release-prepare-result-v1'),
  releaseSha: z.string(),
  manifestPath: z.string(),
  zipPath: z.string()
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Chrome release artifact CLIs', () => {
  it('prepares and verifies one immutable standalone ZIP+manifest result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-chrome-prepare-'));
    roots.push(root);
    await chmod(root, 0o700);
    const distDir = join(root, 'dist');
    const parent = join(root, 'outputs');
    const releaseDir = join(parent, 'release');
    const resultPath = join(parent, 'result.json');
    await mkdir(distDir, { mode: 0o700 });
    await mkdir(parent, { mode: 0o700 });
    await writeFile(
      join(distDir, 'manifest.json'),
      JSON.stringify({ version: '0.2.1', name: 'Zendio' })
    );
    const zipName = createReleaseArtifactFileName('0.2.1', 'zip');
    const zipBase64 = buildZipFixture([
      { path: 'manifest.json', content: '{"version":"0.2.1"}\n' }
    ]).toString('base64');
    const argv = [
      '--config-mode',
      'standalone-synthetic',
      '--attempt-root',
      root,
      '--dist-dir',
      distDir,
      '--release-dir',
      releaseDir,
      '--result-json',
      resultPath
    ];
    const code = `
      import { writeFile } from 'node:fs/promises';
      import { join } from 'node:path';
      import { prepareChromeRelease } from './scripts/prepare-chrome-release.mjs';
      const result = await prepareChromeRelease(${JSON.stringify(argv)}, {
        repoRoot: process.cwd(),
        environment: {
          ZENDIO_GA_MEASUREMENT_ID: 'G-ZENDIOFIXTURE1',
          ZENDIO_GA_TRANSPORT_MODE: 'proxy',
          ZENDIO_GA_PROXY_ENDPOINT: 'https://zendio-ga-fixture.invalid/collect'
        },
        gitOperation: (args) => ({
          status: 0,
          stdout: args[0] === 'status' ? '' : args[1] === 'HEAD^{tree}' ? '${'b'.repeat(40)}\\n' : '${sha}\\n'
        }),
        packageOperation: async ({ outputDir }) => {
          await writeFile(join(outputDir, ${JSON.stringify(zipName)}), Buffer.from(${JSON.stringify(zipBase64)}, 'base64'), { mode: 0o600 });
        }
      });
      process.stdout.write(JSON.stringify(result));
    `;
    const result = PrepareResultSchema.parse(
      JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', code], {
          cwd: process.cwd(),
          encoding: 'utf8'
        })
      )
    );
    expect(result.releaseSha).toBe(sha);
    expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
      schema: 'chrome-release-prepare-result-v1',
      releaseSha: sha
    });
    expect(() =>
      execFileSync(
        process.execPath,
        [
          'scripts/verify-chrome-release.mjs',
          '--manifest',
          result.manifestPath,
          '--transport-mode',
          'local-private-v1'
        ],
        { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }
      )
    ).not.toThrow();
  });

  it('rejects missing and mismatched authorization arguments before output', () => {
    for (const argv of [
      ['--config-mode', 'owner-public-vars'],
      ['--config-mode', 'standalone-synthetic', '--authorization-record', '/tmp/auth.json']
    ]) {
      const code = `import('./scripts/prepare-chrome-release.mjs').then(({ prepareChromeRelease }) => prepareChromeRelease(${JSON.stringify(argv)}));`;
      expect(() =>
        execFileSync(process.execPath, ['-e', code], {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow('CHROME_RELEASE_ARGUMENTS_INVALID');
    }
    expect(() =>
      execFileSync(process.execPath, ['scripts/verify-chrome-release.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      })
    ).toThrow('CHROME_RELEASE_VERIFY_ARGUMENTS_INVALID');
  });
});
