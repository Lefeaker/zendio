import type { UsageStats, UsageStatsHistoryEntry } from '@shared/types/usage';
import {
  USAGE_CHART_DOM_RENDERERS_RUNTIME_MARKER,
  USAGE_CHART_GEOMETRY_RUNTIME_MARKER,
  USAGE_CHART_RENDERERS_RUNTIME_MARKER,
  prepareHistory,
  prepareUsageChartSeries
} from './usageChartRenderers';
import {
  USAGE_CHART_PRESENTATIONS,
  type ChartElements,
  type UsageChartPresentation,
  type UsageChartSeriesPoint
} from './usageChartTypes';

export type {
  ChartElements,
  UsageChartPresentation,
  UsageChartSeriesPoint
} from './usageChartTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';
USAGE_CHART_DOM_RENDERERS_RUNTIME_MARKER.add('usage-chart-owner');
USAGE_CHART_GEOMETRY_RUNTIME_MARKER.add('usage-chart-owner');
USAGE_CHART_RENDERERS_RUNTIME_MARKER.add('usage-chart-owner');

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName) as SVGElementTagNameMap[K];
}

export function createUsageChartShell(
  createElement: (tagName: string) => HTMLElement,
  presentation: UsageChartPresentation = USAGE_CHART_PRESENTATIONS[0]
): { host: HTMLElement; chart: ChartElements } {
  void presentation;

  const host = createElement('div');
  host.className = 'usage-chart-shell';
  const axis = createElement('div');
  axis.className = 'usage-axis';
  axis.id = 'usageAxis';
  const graph = createElement('div');
  graph.className = 'usage-graph';
  const svg = createSvgElement('svg');
  svg.id = 'usageWave';
  svg.setAttribute('class', 'usage-svg');
  svg.setAttribute('viewBox', '0 0 200 160');
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  const grid = createSvgElement('g');
  grid.id = 'usageGrid';
  const fillPath = createSvgElement('path');
  fillPath.id = 'usageFillPath';
  fillPath.setAttribute('class', 'usage-fill');
  const path = createSvgElement('path');
  path.id = 'usageWavePath';
  path.setAttribute('class', 'usage-wave');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  const xAxis = createSvgElement('g');
  xAxis.id = 'usageXAxis';
  svg.append(grid, fillPath, path, xAxis);
  graph.append(svg);
  host.append(axis, graph);
  return {
    host,
    chart: { axis, graph, svg, path, fillPath, grid, points: null, xAxis, presentation }
  };
}

export function renderUsageChart(
  chart: ChartElements,
  data: UsageStats | readonly UsageChartSeriesPoint[]
): void {
  const history = isUsageChartSeries(data) ? prepareUsageChartSeries(data) : prepareHistory(data);
  const graphBounds = chart.graph?.getBoundingClientRect();
  const hostBounds = chart.graph?.parentElement?.getBoundingClientRect();
  const width = Math.max(Math.round(graphBounds?.width ?? 0), 480);
  const height = Math.max(Math.round(hostBounds?.height ?? 0), 180);
  const baseline = height - 32;
  const usableHeight = baseline - 18;
  const values = history.map((item) => item.aiChat + item.fragment + item.article);
  const topValue = Math.max(Math.ceil(Math.max(0, ...values) / 20) * 20, 20);
  const points = history.map((item, index) => ({
    ...item,
    x: 8 + (index / Math.max(history.length - 1, 1)) * (width - 16),
    y: baseline - (values[index] / topValue) * usableHeight
  }));

  chart.svg?.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.axis?.replaceChildren();
  chart.grid?.replaceChildren();
  chart.xAxis?.replaceChildren();

  [0, topValue / 3, (topValue / 3) * 2, topValue].forEach((value) => {
    const y = baseline - (value / topValue) * usableHeight;
    const label = document.createElement('div');
    label.className = 'usage-axis-label';
    label.style.setProperty('--usage-label-y', `${y}px`);
    label.textContent = String(Math.round(value));
    chart.axis?.append(label);
    const line = createSvgElement('line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(width));
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.setAttribute('class', 'usage-grid-line');
    chart.grid?.append(line);
  });

  chart.path?.setAttribute('d', buildSmoothPath(points));
  chart.fillPath?.setAttribute('d', buildAreaPath(points, baseline));
  const labelStep = history.length > 12 ? Math.max(1, Math.ceil(history.length / 5)) : 1;
  points.forEach((point, index) => {
    if (index !== 0 && index !== points.length - 1 && index % labelStep !== 0) return;
    const tick = createSvgElement('line');
    tick.setAttribute('x1', point.x.toFixed(2));
    tick.setAttribute('x2', point.x.toFixed(2));
    tick.setAttribute('y1', baseline.toFixed(2));
    tick.setAttribute('y2', String(baseline + 4));
    tick.setAttribute('class', 'usage-xaxis-tick');
    const label = createSvgElement('text');
    label.setAttribute('x', point.x.toFixed(2));
    label.setAttribute('y', String(baseline + 18));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'usage-xaxis-label');
    label.textContent = formatChartDateLabel(point.date);
    chart.xAxis?.append(tick, label);
  });
}

function isUsageChartSeries(
  data: UsageStats | readonly UsageChartSeriesPoint[]
): data is readonly UsageChartSeriesPoint[] {
  return Array.isArray(data);
}

function formatChartDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[2]}/${match[3]}` : date;
}

function buildSmoothPath(points: Array<UsageStatsHistoryEntry & { x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const middle = (current.x + next.x) / 2;
    path += ` C${middle.toFixed(2)} ${current.y.toFixed(2)}, ${middle.toFixed(2)} ${next.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function buildAreaPath(
  points: Array<UsageStatsHistoryEntry & { x: number; y: number }>,
  baseline: number
): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildSmoothPath(points)} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}
