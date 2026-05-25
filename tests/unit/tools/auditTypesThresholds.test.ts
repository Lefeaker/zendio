import { describe, expect, it } from 'vitest';
import { checkThresholds } from '../../../scripts/audit-types.mjs';

describe('audit-types threshold checks', () => {
  it('passes reports that are exactly at configured thresholds', () => {
    const result = checkThresholds(
      {
        totals: {
          any: 0,
          unknown: 971,
          assertions: 1667,
          nonNullAssertions: 108,
          tsExpectError: 5
        }
      },
      {
        any: 0,
        unknown: 971,
        assertions: 1667,
        nonNullAssertions: 108,
        tsExpectError: 5
      }
    );

    expect(result).toEqual({
      ok: true,
      failures: []
    });
  });

  it('reports failing metric names and deltas above thresholds', () => {
    const result = checkThresholds(
      {
        totals: {
          any: 1,
          unknown: 971,
          assertions: 1670,
          nonNullAssertions: 108,
          tsExpectError: 5
        }
      },
      {
        any: 0,
        unknown: 971,
        assertions: 1667,
        nonNullAssertions: 108,
        tsExpectError: 5
      }
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.metric)).toEqual(['any', 'assertions']);
    expect(result.failures).toEqual([
      {
        metric: 'any',
        actual: 1,
        max: 0,
        delta: 1
      },
      {
        metric: 'assertions',
        actual: 1670,
        max: 1667,
        delta: 3
      }
    ]);
  });

  it('fails src thresholds even when overall thresholds still pass', () => {
    const result = checkThresholds(
      {
        totals: {
          any: 0,
          unknown: 10,
          assertions: 10,
          nonNullAssertions: 0,
          tsExpectError: 0
        },
        scopes: {
          src: {
            any: 0,
            unknown: 7,
            assertions: 8,
            nonNullAssertions: 0,
            tsExpectError: 0
          },
          tests: {
            any: 0,
            unknown: 3,
            assertions: 2,
            nonNullAssertions: 0,
            tsExpectError: 0
          }
        }
      },
      {
        overall: {
          unknown: 10,
          assertions: 10
        },
        src: {
          unknown: 6,
          assertions: 8
        },
        tests: {
          unknown: 3,
          assertions: 2
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      {
        scope: 'src',
        metric: 'unknown',
        actual: 7,
        max: 6,
        delta: 1
      }
    ]);
  });

  it('fails tests thresholds without changing src threshold semantics', () => {
    const result = checkThresholds(
      {
        totals: {
          any: 0,
          unknown: 6,
          assertions: 0,
          nonNullAssertions: 0,
          tsExpectError: 0
        },
        scopes: {
          src: {
            any: 0,
            unknown: 1,
            assertions: 0,
            nonNullAssertions: 0,
            tsExpectError: 0
          },
          tests: {
            any: 0,
            unknown: 5,
            assertions: 0,
            nonNullAssertions: 0,
            tsExpectError: 0
          }
        }
      },
      {
        overall: {
          unknown: 6
        },
        src: {
          unknown: 1
        },
        tests: {
          unknown: 4
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      {
        scope: 'tests',
        metric: 'unknown',
        actual: 5,
        max: 4,
        delta: 1
      }
    ]);
  });
});
