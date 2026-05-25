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
});
