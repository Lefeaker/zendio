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

describe('i18n gate wiring', () => {
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
    const packageJson = readFileSync(resolve('package.json'), 'utf8');

    expect(packageJson).toContain('"verify:preflight":');
    expect(packageJson).toContain('npm run i18n:catalog:check');
  });

  it('runs release metadata checks before catalog drift checks from verify:preflight', () => {
    const packageJson = readFileSync(resolve('package.json'), 'utf8');
    const releaseMetadataCheckIndex = packageJson.indexOf('npm run release:metadata:check');
    const catalogCheckIndex = packageJson.indexOf('npm run i18n:catalog:check');

    expect(releaseMetadataCheckIndex).toBeGreaterThan(-1);
    expect(catalogCheckIndex).toBeGreaterThan(releaseMetadataCheckIndex);
  });

  it('runs English uncatalogued-copy checks from verify:preflight after catalog drift checks', () => {
    const packageJson = readFileSync(resolve('package.json'), 'utf8');
    const catalogCheckIndex = packageJson.indexOf('npm run i18n:catalog:check');
    const englishCheckIndex = packageJson.indexOf(
      'npm run audit:i18n-uncatalogued-user-copy:check'
    );

    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(englishCheckIndex).toBeGreaterThan(catalogCheckIndex);
  });

  it('runs catalog drift checks from CI before verify:preflight', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const catalogCheckIndex = workflow.indexOf('npm run i18n:catalog:check');
    const preflightIndex = workflow.indexOf('npm run verify:preflight');

    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(catalogCheckIndex);
  });
});
