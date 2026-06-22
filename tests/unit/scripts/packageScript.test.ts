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
  it('normalizes trial days to a positive default', () => {
    const values = runPackageScriptJson(
      "import('./scripts/package.mjs').then(({ normalizeTrialDays }) => process.stdout.write(JSON.stringify([normalizeTrialDays(['node', 'scripts/package.mjs']), normalizeTrialDays(['node', 'scripts/package.mjs', '--trial-days=14']), normalizeTrialDays(['node', 'scripts/package.mjs', '--trial-days=-1']), normalizeTrialDays(['node', 'scripts/package.mjs', '--trial-days=0'])])));",
      z.array(z.number())
    );

    expect(values).toEqual([7, 14, 7, 7]);
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
