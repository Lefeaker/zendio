import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('i18n gate wiring', () => {
  it('runs catalog drift checks from quality before locale lint', () => {
    const source = readFileSync(resolve('scripts/quality-check.mjs'), 'utf8');
    const catalogCheckIndex = source.indexOf("cmd: ['npm', 'run', 'i18n:catalog:check']");
    const lintIndex = source.indexOf("cmd: ['npm', 'run', 'i18n:lint']");

    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(lintIndex).toBeGreaterThan(catalogCheckIndex);
  });

  it('runs English uncatalogued-copy checks from quality after the CJK user-copy gate', () => {
    const source = readFileSync(resolve('scripts/quality-check.mjs'), 'utf8');
    const hardcodedCheckIndex = source.indexOf(
      "cmd: ['npm', 'run', 'audit:i18n-hardcoded-user-copy:check']"
    );
    const englishCheckIndex = source.indexOf(
      "cmd: ['npm', 'run', 'audit:i18n-uncatalogued-user-copy:check']"
    );

    expect(hardcodedCheckIndex).toBeGreaterThan(-1);
    expect(englishCheckIndex).toBeGreaterThan(hardcodedCheckIndex);
  });

  it('runs catalog drift checks from verify:preflight', () => {
    const packageJson = readFileSync(resolve('package.json'), 'utf8');

    expect(packageJson).toContain('"verify:preflight":');
    expect(packageJson).toContain('npm run i18n:catalog:check');
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
