import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const PackageTrialConfigSchema = z.object({
  trialDays: z.number(),
  skipBuild: z.boolean(),
  help: z.boolean()
});

const PackageTrialPlanSchema = z.object({
  commands: z.array(
    z.object({
      command: z.string(),
      args: z.array(z.string())
    })
  ),
  mutatesPackageJson: z.boolean()
});

function runPackageTrialJson<T>(code: string, schema: z.ZodType<T>): T {
  const stdout = execFileSync('node', ['-e', code], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return schema.parse(JSON.parse(stdout));
}

describe('package-trial script contract', () => {
  function runInvalidPackageTrialArgs(args: string[]): void {
    execFileSync(
      'node',
      [
        '-e',
        `import('./scripts/package-trial.mjs').then(({ parsePackageTrialArgs }) => parsePackageTrialArgs(${JSON.stringify(args)}));`
      ],
      { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }
    );
  }

  it('parses trial days without accepting unused contact metadata', () => {
    const config = runPackageTrialJson(
      "import('./scripts/package-trial.mjs').then(({ parsePackageTrialArgs }) => process.stdout.write(JSON.stringify(parsePackageTrialArgs(['--days=14']))));",
      PackageTrialConfigSchema
    );

    expect(config).toEqual({
      trialDays: 14,
      skipBuild: false,
      help: false
    });

    expect(() =>
      execFileSync(
        'node',
        [
          '-e',
          "import('./scripts/package-trial.mjs').then(({ parsePackageTrialArgs }) => parsePackageTrialArgs(['--contact=owner@example.com']));"
        ],
        { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }
      )
    ).toThrow('--contact is no longer supported');
  });

  it('rejects non-decimal and out-of-range trial day values', () => {
    for (const args of [
      ['--days=0'],
      ['--days=-1'],
      ['--days=14abc'],
      ['--days=abc'],
      ['--days=31']
    ]) {
      expect(() => runInvalidPackageTrialArgs(args), args.join(' ')).toThrow(
        'must be a base-10 integer from 1 to 30'
      );
    }
  });

  it('uses an isolated Chrome trial dist when a build is requested', () => {
    const plan = runPackageTrialJson(
      "import('./scripts/package-trial.mjs').then(({ createPackageTrialPlan }) => process.stdout.write(JSON.stringify(createPackageTrialPlan({ trialDays: 21, skipBuild: false, help: false }))));",
      PackageTrialPlanSchema
    );

    expect(plan.commands).toEqual([
      {
        command: 'npm',
        args: ['run', 'build:fast', '--', '--outdir', 'build/dist-chrome-trial']
      },
      {
        command: 'node',
        args: [
          'scripts/package.mjs',
          '--dist-dir',
          'build/dist-chrome-trial',
          '--trial',
          '--trial-days=21'
        ]
      }
    ]);
  });

  it('packages an existing isolated trial dist without self-modifying package metadata', () => {
    const plan = runPackageTrialJson(
      "import('./scripts/package-trial.mjs').then(({ createPackageTrialPlan }) => process.stdout.write(JSON.stringify(createPackageTrialPlan({ trialDays: 7, skipBuild: true, help: false }))));",
      PackageTrialPlanSchema
    );

    expect(plan.commands).toEqual([
      {
        command: 'node',
        args: [
          'scripts/package.mjs',
          '--dist-dir',
          'build/dist-chrome-trial',
          '--trial',
          '--trial-days=7'
        ]
      }
    ]);
    expect(plan.mutatesPackageJson).toBe(false);
  });
});
