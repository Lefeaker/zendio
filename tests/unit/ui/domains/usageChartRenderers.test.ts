/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { createUsageChartShell, renderUsageChart } from '@ui/domains/usage-chart/usageChart';
import {
  buildSmoothPath,
  computeChartGeometry,
  formatDateLabel,
  formatUsageDate,
  generateTicks,
  measureChartBounds,
  parseDateKey,
  pickLabelIndices,
  prepareHistory,
  resolveUsageDateKey,
  updateAxis,
  updateGridLines,
  updatePoints,
  updateXAxis,
  type ChartGeometry
} from '@ui/domains/usage-chart/usageChartRenderers';
import type { UsageStats, UsageStatsHistoryEntry } from '@shared/types/usage';

function createUsageStats(overrides: Partial<UsageStats> = {}): UsageStats {
  return {
    aiChatSaves: 0,
    fragmentSaves: 0,
    articleSaves: 0,
    videoSaves: 0,
    totalSaves: 0,
    lastUpdatedISO: null,
    history: [],
    ...overrides
  };
}

function createGeometry(points: ChartGeometry['points']): ChartGeometry {
  return {
    points,
    baseline: 140,
    usableHeight: 120,
    svgWidth: 220,
    svgHeight: 160,
    xPadding: 20,
    tickInfo: {
      ticks: [10, 5, 0],
      topValue: 10
    }
  };
}

function installSvgConstructors(): void {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  globalThis.SVGSVGElement ??= svg.constructor as typeof SVGSVGElement;
  globalThis.SVGGElement ??= group.constructor as typeof SVGGElement;
  globalThis.SVGPathElement ??= path.constructor as typeof SVGPathElement;
}

describe('usage chart renderers', () => {
  it('prepares fallback and rolling history entries', () => {
    expect(prepareHistory(createUsageStats())).toEqual([]);

    expect(
      prepareHistory(
        createUsageStats({
          aiChatSaves: 2,
          fragmentSaves: 1,
          articleSaves: 3,
          lastUpdatedISO: '2026-05-20T08:30:00.000Z'
        })
      )
    ).toEqual([
      {
        date: '2026-05-20',
        aiChat: 2,
        fragment: 1,
        article: 3
      }
    ]);

    const timeline = prepareHistory(
      createUsageStats({
        history: [
          { date: '2026-05-03', aiChat: 3, fragment: 0, article: 0 },
          { date: '2026-05-01', aiChat: 1, fragment: 1, article: 0 }
        ],
        aiChatSaves: 4,
        fragmentSaves: 1
      })
    );

    expect(timeline).toHaveLength(30);
    expect(timeline[0]?.date).toBe('2026-04-04');
    expect(timeline.at(-3)).toMatchObject({ date: '2026-05-01', aiChat: 1, fragment: 1 });
    expect(timeline.at(-1)).toMatchObject({ date: '2026-05-03', aiChat: 3 });
  });

  it('computes chart geometry, ticks, labels, and date keys', () => {
    expect(computeChartGeometry([], { width: 120, height: 80 })).toMatchObject({
      points: [],
      baseline: 60,
      usableHeight: 44,
      svgWidth: 120,
      svgHeight: 80
    });

    const history: UsageStatsHistoryEntry[] = [
      { date: '2026-05-01', aiChat: 1, fragment: 0, article: 0 },
      { date: '2026-05-02', aiChat: 2, fragment: 2, article: 0 },
      { date: '2026-05-03', aiChat: 4, fragment: 1, article: 0 }
    ];
    const geometry = computeChartGeometry(history, {
      width: 240,
      height: 180,
      paddingTop: 20,
      paddingBottom: 30,
      xPadding: 24
    });

    expect(geometry.points.map((point) => point.total)).toEqual([1, 4, 5]);
    expect(geometry.points[0]).toMatchObject({ x: 24, date: '2026-05-01' });
    expect(geometry.points[2]?.x).toBe(216);
    expect(geometry.baseline).toBe(150);
    expect(geometry.tickInfo.ticks.at(-1)).toBe(0);

    expect(computeChartGeometry([history[0]], { width: 100 }).points[0]?.x).toBe(50);
    expect(buildSmoothPath(geometry.points)).toContain('C');
    expect(buildSmoothPath([])).toBe('');
    expect(generateTicks(0)).toEqual({ ticks: [], topValue: 0 });
    expect(generateTicks(17)).toMatchObject({ topValue: 20 });
    expect(pickLabelIndices(1, 6)).toEqual([0]);
    expect(pickLabelIndices(10, 4)).toEqual([0, 3, 6, 9]);
    expect(formatDateLabel('2026-05-03')).toBe('05/03');
    expect(formatDateLabel('not-a-date')).toBe('not-a-date');
    expect(formatUsageDate(new Date(2026, 4, 3))).toBe('2026-05-03');
    expect(resolveUsageDateKey('2026-05-03T12:00:00.000Z')).toBe('2026-05-03');
    expect(parseDateKey('2026-05-03')?.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    expect(parseDateKey('bad-date')).toBeNull();
  });

  it('updates SVG and axis DOM layers', () => {
    const axis = document.createElement('div');
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const points = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const geometry = createGeometry([
      { x: 20, y: 130, total: 1, date: '2026-05-01' },
      { x: 120, y: 90, total: 5, date: '2026-05-02' },
      { x: 220, y: 20, total: 10, date: '2026-05-03' }
    ]);

    updateGridLines(
      { axis, graph: null, svg: null, path: null, grid, points, xAxis },
      [
        { value: 10, topValue: 10 },
        { value: 0, topValue: 10 },
        { value: 5, topValue: 0 }
      ],
      geometry
    );
    expect(grid.querySelectorAll('line')).toHaveLength(2);

    updateAxis({ axis, graph: null, svg: null, path: null, grid, points, xAxis }, geometry);
    expect(axis.classList.contains('opacity-0')).toBe(false);
    expect(axis.querySelectorAll('div')).toHaveLength(3);

    updateXAxis(
      { axis, graph: null, svg: null, path: null, grid, points, xAxis },
      [
        { date: '2026-05-01', aiChat: 1, fragment: 0, article: 0 },
        { date: '2026-05-02', aiChat: 5, fragment: 0, article: 0 },
        { date: '2026-05-03', aiChat: 10, fragment: 0, article: 0 }
      ],
      geometry
    );
    expect(xAxis.querySelectorAll('text')).toHaveLength(3);
    expect(xAxis.textContent).toContain('05/03');

    updatePoints({ axis, graph: null, svg: null, path: null, grid, points, xAxis }, geometry);
    expect(points.querySelectorAll('circle')).toHaveLength(3);

    updateAxis(
      { axis, graph: null, svg: null, path: null, grid, points, xAxis },
      { ...geometry, tickInfo: { ticks: [], topValue: 0 } }
    );
    expect(axis.classList.contains('opacity-0')).toBe(true);
  });

  it('measures chart bounds and renders the full chart shell', () => {
    installSvgConstructors();

    const graph = document.createElement('div');
    Object.defineProperty(graph, 'clientWidth', { value: 320 });
    Object.defineProperty(graph, 'clientHeight', { value: 180 });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(measureChartBounds(graph, svg)).toEqual({ width: 320, height: 180 });
    expect(measureChartBounds(null, null)).toEqual({ width: 200, height: 160 });

    const { host, chart } = createUsageChartShell((tagName) => document.createElement(tagName));
    document.body.append(host);
    Object.defineProperty(chart.graph, 'clientWidth', { value: 240 });
    Object.defineProperty(chart.graph, 'clientHeight', { value: 180 });

    renderUsageChart(
      chart,
      createUsageStats({
        history: [
          { date: '2026-05-01', aiChat: 1, fragment: 0, article: 0 },
          { date: '2026-05-02', aiChat: 2, fragment: 1, article: 0 }
        ]
      })
    );

    expect(chart.svg?.getAttribute('viewBox')).toBe('0 0 240.00 180.00');
    expect(chart.path?.getAttribute('d')).toContain('C');
    expect(chart.grid?.querySelectorAll('line').length).toBeGreaterThan(0);
    expect(chart.points?.querySelectorAll('circle')).toHaveLength(30);
    expect(chart.xAxis?.textContent).toContain('05/02');

    renderUsageChart(chart, createUsageStats());
    expect(chart.path?.getAttribute('d')).toBe('M0 160 L240 160');
  });
});
