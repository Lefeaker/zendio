import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const QualityTaskGraphSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      dependsOn: z.array(z.string())
    })
  )
});

const PreflightTaskGraphSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      profile: z.string(),
      args: z.array(z.string()),
      dependsOn: z.array(z.string())
    })
  )
});

function readQualityTaskGraph(): z.infer<typeof QualityTaskGraphSchema> {
  const stdout = execFileSync(
    'node',
    [
      '-e',
      "import('./scripts/quality-check.mjs').then(({ createQualityTaskGraph }) => process.stdout.write(JSON.stringify(createQualityTaskGraph())));"
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );

  return QualityTaskGraphSchema.parse(JSON.parse(stdout));
}

function readPreflightTaskGraph(): z.infer<typeof PreflightTaskGraphSchema> {
  const stdout = execFileSync(
    'node',
    [
      '-e',
      "import('./scripts/verify-preflight.mjs').then(({ createPreflightTaskGraph }) => process.stdout.write(JSON.stringify(createPreflightTaskGraph())));"
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );

  return PreflightTaskGraphSchema.parse(JSON.parse(stdout));
}

describe('i18n gate wiring', () => {
  it('runs quality TypeScript checkers through the loader without the tsx CLI IPC path', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['i18n:catalog:check']).toBe(
      'node --import tsx tools/generate-i18n-catalog.ts --check'
    );
    expect(packageJson.scripts?.['validate:i18n:budgets']).toBe(
      'node --import tsx tools/validate-text-budgets.ts'
    );
  });

  it('runs catalog drift and locale lint checks from quality', () => {
    const taskIds = new Set(readQualityTaskGraph().tasks.map((task) => task.id));

    expect(taskIds.has('i18n-catalog-check')).toBe(true);
    expect(taskIds.has('i18n-lint')).toBe(true);
  });

  it('runs English uncatalogued-copy checks from quality after the CJK user-copy gate', () => {
    const taskById = new Map(readQualityTaskGraph().tasks.map((task) => [task.id, task]));

    expect(taskById.get('audit-hardcoded-user-copy-check')?.dependsOn).toEqual([
      'audit-build-graph-report'
    ]);
    expect(taskById.get('uncatalogued-user-copy-check')?.dependsOn).toEqual([
      'audit-hardcoded-user-copy-check'
    ]);
  });

  it('runs catalog drift checks from verify:preflight', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const catalogTask = readPreflightTaskGraph().tasks.find(
      (task) => task.id === 'i18n-catalog-check'
    );

    expect(packageJson.scripts?.['verify:preflight']).toBe('node scripts/verify-preflight.mjs');
    expect(catalogTask).toMatchObject({
      profile: 'npm-script-standard-v1',
      args: ['i18n:catalog:check']
    });
  });

  it('runs release metadata checks before catalog drift checks from verify:preflight', () => {
    const ids = readPreflightTaskGraph().tasks.map((task) => task.id);
    const releaseMetadataCheckIndex = ids.indexOf('release-metadata-check');
    const catalogCheckIndex = ids.indexOf('i18n-catalog-check');

    expect(releaseMetadataCheckIndex).toBeGreaterThan(-1);
    expect(catalogCheckIndex).toBeGreaterThan(releaseMetadataCheckIndex);
  });

  it('runs English uncatalogued-copy checks from verify:preflight after catalog drift checks', () => {
    const ids = readPreflightTaskGraph().tasks.map((task) => task.id);
    const catalogCheckIndex = ids.indexOf('i18n-catalog-check');
    const englishCheckIndex = ids.indexOf('audit-i18n-uncatalogued-user-copy-check');

    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(englishCheckIndex).toBeGreaterThan(catalogCheckIndex);
  });

  it('runs catalog drift checks from CI before verify:preflight', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const catalogCheckIndex = workflow.indexOf(
      'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- i18n:catalog:check'
    );
    const preflightIndex = workflow.indexOf('node scripts/verify-preflight.mjs');

    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(catalogCheckIndex);
  });
});
