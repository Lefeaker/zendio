import { describe, expect, it } from 'vitest';

import {
  assertNodeVersionSatisfiesRange,
  isNodeVersionSupported
} from '../../../scripts/verify-runtime.mjs';

describe('verify-runtime', () => {
  it('accepts the documented Node 20 runtime range', () => {
    expect(isNodeVersionSupported('v20.20.2', '>=20.19 <21')).toBe(true);
  });

  it('rejects Node 20 versions below the transitive engine floor', () => {
    expect(isNodeVersionSupported('v20.18.1', '>=20.19 <21')).toBe(false);
  });

  it('rejects Node versions outside the supported major range', () => {
    expect(isNodeVersionSupported('v23.9.0', '>=20.19 <21')).toBe(false);
  });

  it('throws a clear error for unsupported runtime versions', () => {
    expect(() => assertNodeVersionSatisfiesRange('v23.9.0', '>=20.19 <21')).toThrow(
      'Unsupported Node.js runtime v23.9.0; expected package.json engines.node >=20.19 <21.'
    );
  });
});
