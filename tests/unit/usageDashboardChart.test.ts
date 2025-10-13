import { describe, expect, it } from 'vitest';

import { buildSmoothPath } from '../../src/options/components/usageDashboard';

describe('buildSmoothPath', () => {
  const basePoint = {
    total: 0,
    date: '2024-01-01'
  };

  it('creates cubic bezier segments between points', () => {
    const points = [
      { x: 10, y: 20, ...basePoint },
      { x: 30, y: 10, ...basePoint },
      { x: 50, y: 25, ...basePoint }
    ];

    const path = buildSmoothPath(points);

    expect(path.startsWith('M10.00 20.00')).toBe(true);
    const cubicCommands = (path.match(/C/g) || []).length;
    expect(cubicCommands).toBe(points.length - 1);
    expect(path).toMatch(/50\.00 25\.00$/);
  });

  it('returns empty string for no points', () => {
    expect(buildSmoothPath([])).toBe('');
  });
});
