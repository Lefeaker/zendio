import { describe, expect, it } from 'vitest';
import { checkThresholds } from '../../../scripts/audit-types.mjs';

describe('audit-types threshold checks', () => {
  it('passes reports that are exactly at configured thresholds', () => {
    const result = checkThresholds(
      {
        totals: {
          any: 12,
          unknown: 1091,
          assertions: 1849,
          nonNullAssertions: 129,
          tsExpectError: 5
        }
      },
      {
        any: 12,
        unknown: 1091,
        assertions: 1849,
        nonNullAssertions: 129,
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
          any: 13,
          unknown: 1091,
          assertions: 1852,
          nonNullAssertions: 129,
          tsExpectError: 5
        }
      },
      {
        any: 12,
        unknown: 1091,
        assertions: 1849,
        nonNullAssertions: 129,
        tsExpectError: 5
      }
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.metric)).toEqual(['any', 'assertions']);
    expect(result.failures).toEqual([
      {
        metric: 'any',
        actual: 13,
        max: 12,
        delta: 1
      },
      {
        metric: 'assertions',
        actual: 1852,
        max: 1849,
        delta: 3
      }
    ]);
  });
});
