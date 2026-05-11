import { describe, it, expect } from 'vitest';
import type { UsageStats } from '@shared/types/usage';
import {
  buildSmoothPath,
  computeChartGeometry,
  pickLabelIndices,
  prepareHistory
} from '@options/components/sections/usageDashboard.utils';

const baseStats = (): UsageStats => ({
  aiChatSaves: 4,
  fragmentSaves: 6,
  articleSaves: 2,
  lastUpdatedISO: '2025-01-15T08:00:00.000Z',
  history: []
});

describe('usageDashboard.utils', () => {
  it('prepareHistory returns empty list when no usage recorded', () => {
    const stats = baseStats();
    stats.aiChatSaves = 0;
    stats.fragmentSaves = 0;
    stats.articleSaves = 0;
    const history = prepareHistory(stats);
    expect(history).toEqual([]);
  });

  it('prepareHistory falls back to aggregate totals when history missing', () => {
    const stats = baseStats();
    const history = prepareHistory(stats);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      date: '2025-01-15',
      aiChat: 4,
      fragment: 6,
      article: 2
    });
  });

  it('prepareHistory pads recorded history to a 30-day dashboard window', () => {
    const stats = baseStats();
    stats.history = [
      { date: '2025-01-14', aiChat: 1, fragment: 0, article: 0 },
      { date: '2025-01-15', aiChat: 0, fragment: 2, article: 0 }
    ];

    const history = prepareHistory(stats);

    expect(history).toHaveLength(30);
    expect(history[0]?.date).toBe('2024-12-17');
    expect(history.at(-1)?.date).toBe('2025-01-15');
    expect(history.find((entry) => entry.date === '2025-01-14')?.aiChat).toBe(1);
  });

  it('computeChartGeometry produces points within bounds', () => {
    const stats = baseStats();
    stats.history = [
      { date: '2025-01-13', aiChat: 1, fragment: 0, article: 0 },
      { date: '2025-01-14', aiChat: 0, fragment: 2, article: 1 },
      { date: '2025-01-15', aiChat: 3, fragment: 4, article: 0 }
    ];

    const geometry = computeChartGeometry(stats.history, { width: 300, height: 180 });
    expect(geometry.points).toHaveLength(3);
    geometry.points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(geometry.xPadding);
      expect(point.x).toBeLessThanOrEqual(geometry.svgWidth - geometry.xPadding);
      expect(point.y).toBeLessThanOrEqual(geometry.baseline);
      expect(point.y).toBeGreaterThanOrEqual(geometry.baseline - geometry.usableHeight - 0.001);
    });
    expect(geometry.tickInfo.topValue).toBeGreaterThan(0);
  });

  it('buildSmoothPath generates cubic Bézier segments', () => {
    const geometry = computeChartGeometry(
      [
        { date: '2025-01-13', aiChat: 1, fragment: 0, article: 0 },
        { date: '2025-01-14', aiChat: 2, fragment: 1, article: 0 }
      ],
      { width: 200, height: 160 }
    );
    const path = buildSmoothPath(geometry.points);
    expect(path.startsWith('M')).toBe(true);
    expect(path.includes('C')).toBe(true);
  });

  it('pickLabelIndices never exceeds requested labels', () => {
    const indices = pickLabelIndices(12, 4);
    expect(indices.length).toBeLessThanOrEqual(4);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(11);
  });
});
