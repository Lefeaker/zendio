import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const PackageJsonSchema = z.object({
  scripts: z.record(z.string())
});

const runtimeGuardPrefix = 'npm run verify:runtime && ';

function readPackageJson(): z.infer<typeof PackageJsonSchema> {
  return PackageJsonSchema.parse(JSON.parse(readFileSync(resolve('package.json'), 'utf8')));
}

describe('package test script runtime guards', () => {
  it('runs the runtime guard before every test and visual script entrypoint', () => {
    const { scripts } = readPackageJson();
    const guardedScriptNames = Object.keys(scripts)
      .filter((name) => name === 'test' || name.startsWith('test:') || name.startsWith('visual:'))
      .sort();

    expect(guardedScriptNames.length).toBeGreaterThan(0);

    for (const scriptName of guardedScriptNames) {
      expect(scripts[scriptName], `${scriptName} should start with verify:runtime`).toMatch(
        new RegExp(`^${runtimeGuardPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });
});
