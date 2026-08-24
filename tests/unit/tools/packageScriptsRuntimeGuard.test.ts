import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const PackageSchema = z.object({
  scripts: z.record(z.string()),
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()),
  overrides: z.record(z.unknown())
});
const LockSchema = z.object({
  packages: z.record(
    z
      .object({
        dependencies: z.record(z.string()).optional(),
        devDependencies: z.record(z.string()).optional()
      })
      .passthrough()
  )
});

const exactTransitions = {
  'verify:preflight': 'node scripts/verify-preflight.mjs',
  'verify:stitch-secondary': 'node scripts/run-bounded-command.mjs --profile stitch-secondary-v1',
  test: 'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run',
  'test:unit':
    'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts',
  'test:e2e':
    'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.e2e.config.ts',
  'test:coverage':
    'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts --coverage',
  format:
    'node scripts/run-bounded-command.mjs --profile prettier-v1 -- --write "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"',
  'format:check':
    'node scripts/run-bounded-command.mjs --profile prettier-v1 -- --check "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"',
  'lint:options-css':
    'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css"'
};

function readPackage() {
  return PackageSchema.parse(JSON.parse(readFileSync(resolve('package.json'), 'utf8')));
}

function executableTokens(value: string): string[] {
  const commands = value.split(/&&|\|\||;/u);
  return commands.map((command) => command.trim().split(/\s+/u)[0] ?? '');
}

function findForbiddenRoutes(scripts: Record<string, string>): string[] {
  const violations: string[] = [];
  for (const [name, value] of Object.entries(scripts)) {
    for (const executable of executableTokens(value)) {
      if (['npx', 'pnpx', 'vitest', 'prettier', 'stylelint'].includes(executable)) {
        violations.push(`${name}:${executable}`);
      }
    }
    if (/\bnpm\s+exec\b/iu.test(value)) violations.push(`${name}:npm-exec`);
  }
  return violations.sort();
}

describe('package command-boundary routes', () => {
  it('freezes the exact nine script-value transitions', () => {
    const { scripts } = readPackage();

    expect(
      Object.fromEntries(Object.keys(exactTransitions).map((name) => [name, scripts[name]]))
    ).toEqual(exactTransitions);
  });

  it('keeps dependency and override projection byte-equivalent to the root lock row', () => {
    const packageJson = readPackage();
    const lockJson = LockSchema.parse(
      JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'))
    );
    const root = lockJson.packages[''];

    expect(root?.dependencies).toEqual(packageJson.dependencies);
    expect(root?.devDependencies).toEqual(packageJson.devDependencies);
    expect(
      createHash('sha256')
        .update(
          JSON.stringify({
            dependencies: packageJson.dependencies,
            devDependencies: packageJson.devDependencies,
            overrides: packageJson.overrides
          })
        )
        .digest('hex')
    ).toBe('dd316fd69631a01b11981503008ec4100fc24257ca3cc3649f8853b111b5513c');
  });

  it('rejects executable npx, npm exec, pnpx and bare tool routes', () => {
    const { scripts } = readPackage();

    expect(findForbiddenRoutes(scripts)).toEqual([]);
    for (const mutation of [
      'npx vitest run',
      'npm exec vitest -- run',
      'pnpx prettier --check src',
      'vitest run',
      'prettier --check src',
      'stylelint src/options/app.css'
    ]) {
      expect(findForbiddenRoutes({ ...scripts, mutation })).not.toEqual([]);
    }
  });

  it('keeps every test and visual entry behind a runtime-owning route', () => {
    const { scripts } = readPackage();
    const managed = 'node scripts/run-bounded-command.mjs --profile ';
    const guardedNames = Object.keys(scripts).filter(
      (name) => name === 'test' || name.startsWith('test:') || name.startsWith('visual:')
    );

    for (const name of guardedNames) {
      const value = scripts[name] ?? '';
      expect(
        value.startsWith('npm run verify:runtime && ') ||
          value.startsWith(managed) ||
          value === 'node scripts/verify-preflight.mjs',
        `${name} must retain a runtime-owning route`
      ).toBe(true);
    }
  });
});
