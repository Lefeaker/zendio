import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { RUNTIME_POLICY } from '../../../scripts/config/runtimePolicy.mjs';

import {
  assertNodeVersionSatisfiesRange,
  isNodeVersionSupported
} from '../../../scripts/verify-runtime.mjs';

describe('verify-runtime', () => {
  it('aligns the active policy with package, lock and CI nvm runtime inputs', () => {
    const engines = z.object({ node: z.string(), npm: z.string() });
    const packageJson = z
      .object({ engines })
      .parse(JSON.parse(readFileSync('package.json', 'utf8')));
    const lock = z
      .object({ packages: z.object({ '': z.object({ engines }) }) })
      .parse(JSON.parse(readFileSync('package-lock.json', 'utf8')));
    expect(packageJson.engines).toEqual({
      node: RUNTIME_POLICY.nodeEngine,
      npm: RUNTIME_POLICY.npmEngine
    });
    expect(lock.packages[''].engines).toEqual(packageJson.engines);
    expect(readFileSync('.nvmrc', 'utf8')).toBe(`${RUNTIME_POLICY.nodeVersion.slice(1)}\n`);
    const historical = z
      .object({ runtime: z.object({ nodeVersion: z.string() }) })
      .parse(
        JSON.parse(
          readFileSync('tools/npm-audit-regression/manifests/r02-transition-v10.json', 'utf8')
        )
      );
    expect(historical.runtime.nodeVersion).toBe('v20.20.2');
  });

  it('accepts the documented Node 24 runtime range', () => {
    expect(isNodeVersionSupported('v24.21.0', '>=24.21 <25')).toBe(true);
  });

  it('rejects Node 24 versions below the pinned LTS floor', () => {
    expect(isNodeVersionSupported('v24.20.0', '>=24.21 <25')).toBe(false);
  });

  it('rejects Node versions outside the supported major range', () => {
    expect(isNodeVersionSupported('v23.9.0', '>=24.21 <25')).toBe(false);
  });

  it('throws a clear error for unsupported runtime versions', () => {
    expect(() => assertNodeVersionSatisfiesRange('v23.9.0', '>=24.21 <25')).toThrow(
      'Unsupported Node.js runtime v23.9.0; expected package.json engines.node >=24.21 <25.'
    );
  });
});
