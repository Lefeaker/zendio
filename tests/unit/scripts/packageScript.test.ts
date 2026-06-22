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
