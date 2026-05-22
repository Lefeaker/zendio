import type { UsageStats, UsageStatsHistoryEntry } from '@shared/types/usage';
import type { ChartElements } from './usageChartTypes';

export const DEFAULT_CHART_BOUNDS = {
  width: 200,
  height: 160,
  paddingTop: 16,
  paddingBottom: 20,
  xPadding: 16
} as const;

export interface ChartPoint {
  x: number;
  y: number;
  total: number;
  date: string;
}

export interface TickInfo {
  ticks: number[];
  topValue: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  baseline: number;
  usableHeight: number;
  svgWidth: number;
  svgHeight: number;
  xPadding: number;
  tickInfo: TickInfo;
}

export interface ChartMeasurements {
  width?: number;
  height?: number;
  paddingTop?: number;
  paddingBottom?: number;
  xPadding?: number;
}

export function prepareHistory(stats: UsageStats): UsageStatsHistoryEntry[] {
  const input = Array.isArray(stats.history) ? stats.history : [];
  const sorted = [...input].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    if (total === 0) {
      return [];
    }

    const fallbackDate = resolveUsageDateKey(stats.lastUpdatedISO);
    return [
      {
        date: fallbackDate,
        aiChat: stats.aiChatSaves,
        fragment: stats.fragmentSaves,
        article: stats.articleSaves
      }
    ];
  }

  const endDate = parseDateKey(sorted[sorted.length - 1].date) ?? new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29);

  const values = new Map<string, UsageStatsHistoryEntry>();
  sorted.forEach((entry) => {
    values.set(entry.date, { ...entry });
  });

  const timeline: UsageStatsHistoryEntry[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = formatUsageDate(cursor);
    const existing = values.get(key);
    timeline.push(existing ?? { date: key, aiChat: 0, fragment: 0, article: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const trimmed = timeline.slice(-30);
  const timelineTotal = trimmed.reduce(
    (sum, entry) => sum + entry.aiChat + entry.fragment + entry.article,
    0
  );
  const aggregateTotal = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
  if (aggregateTotal > 0 && timelineTotal === 0 && trimmed.length) {
    const lastIndex = trimmed.length - 1;
    const fallbackDate = resolveUsageDateKey(stats.lastUpdatedISO) || trimmed[lastIndex].date;
    trimmed[lastIndex] = {
      date: fallbackDate,
      aiChat: stats.aiChatSaves,
      fragment: stats.fragmentSaves,
      article: stats.articleSaves
    };
  }

  return trimmed;
}

export function computeChartGeometry(
  history: UsageStatsHistoryEntry[],
  measurements: ChartMeasurements = {}
): ChartGeometry {
  const {
    width = DEFAULT_CHART_BOUNDS.width,
    height = DEFAULT_CHART_BOUNDS.height,
    paddingTop = DEFAULT_CHART_BOUNDS.paddingTop,
    paddingBottom = DEFAULT_CHART_BOUNDS.paddingBottom,
    xPadding = DEFAULT_CHART_BOUNDS.xPadding
  } = measurements;

  const usableHeight = Math.max(height - paddingTop - paddingBottom, 0);
  const baseline = Math.max(height - paddingBottom, 0);

  if (!history.length) {
    return {
      points: [],
      baseline,
      usableHeight,
      svgWidth: width,
      svgHeight: height,
      xPadding,
      tickInfo: { ticks: [], topValue: 0 }
    };
  }

  const totals = history.map((entry) => entry.aiChat + entry.fragment + entry.article);
  const maxValue = Math.max(...totals, 0);
  const tickInfo = generateTicks(maxValue);
  const topValue = tickInfo.topValue || 1;

  const pointCount = history.length;
  const xRange = width - xPadding * 2;

  const points: ChartPoint[] = history.map((entry, index) => {
    const total = totals[index] ?? 0;
    const ratio = total / topValue;
    const x = pointCount === 1 ? width / 2 : xPadding + (xRange * index) / (pointCount - 1);
    const y = baseline - ratio * usableHeight;
    const singleX = xPadding + xRange / 2;

    return {
      x: Number.isFinite(x) ? x : singleX,
      y: Number.isFinite(y) ? y : baseline,
      total,
      date: entry.date
    };
  });

  return {
    points,
    baseline,
    usableHeight,
    svgWidth: width,
    svgHeight: height,
    xPadding,
    tickInfo
  };
}

export function buildSmoothPath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  const segments: string[] = [`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    const previous = index > 0 ? points[index - 1] : current;
    const after = index + 2 < points.length ? points[index + 2] : next;

    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (after.x - current.x) / 6;
    const control2Y = next.y - (after.y - current.y) / 6;

    segments.push(
      `C${control1X.toFixed(2)} ${control1Y.toFixed(2)} ${control2X.toFixed(2)} ${control2Y.toFixed(2)} ${next.x.toFixed(
        2
      )} ${next.y.toFixed(2)}`
    );
  }

  return segments.join(' ');
}

export function generateTicks(maxValue: number): TickInfo {
  if (maxValue <= 0) {
    return { ticks: [], topValue: 0 };
  }

  const desiredTicks = 4;
  const rawStep = maxValue / desiredTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let stepNormalized: number;
  if (normalized <= 1) {
    stepNormalized = 1;
  } else if (normalized <= 2) {
    stepNormalized = 2;
  } else if (normalized <= 5) {
    stepNormalized = 5;
  } else {
    stepNormalized = 10;
  }

  const step = stepNormalized * magnitude;
  const topValue = step * Math.ceil(maxValue / step);
  const ticks: number[] = [];
  for (let value = topValue; value >= 0; value -= step) {
    ticks.push(Math.round(value));
    if (ticks.length > desiredTicks + 2) {
      break;
    }
  }
  if (ticks[ticks.length - 1] !== 0) {
    ticks.push(0);
  }
  return { ticks, topValue };
}

export function pickLabelIndices(length: number, maxLabels: number): number[] {
  if (length <= 1) {
    return [0];
  }
  const labels = Math.min(maxLabels, length);
  const step = (length - 1) / (labels - 1);
  const indices: number[] = [];
  for (let i = 0; i < labels; i++) {
    const index = Math.round(i * step);
    indices.push(Math.min(index, length - 1));
  }
  return Array.from(new Set(indices));
}

export function formatDateLabel(date: string): string {
  const parsed = new Date(date + 'T00:00:00Z');
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${month}/${day}`;
  }
  return date;
}

export function resolveUsageDateKey(source?: string | null): string {
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return formatUsageDate(parsed);
    }
  }
  return formatUsageDate(new Date());
}

export function formatUsageDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date | null {
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const X_AXIS_LABEL_OFFSET = 12;

export function updateGridLines(
  chart: ChartElements,
  ticks: Array<{ value: number; topValue: number }>,
  geometry: ChartGeometry
): void {
  if (!chart.grid) {
    return;
  }
  chart.grid.innerHTML = '';
  if (!ticks.length || geometry.usableHeight <= 0) {
    return;
  }

  ticks.forEach(({ value, topValue }) => {
    if (topValue <= 0) {
      return;
    }
    const ratio = value / topValue;
    const y = geometry.baseline - ratio * geometry.usableHeight;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', geometry.svgWidth.toString());
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.classList.add('stroke-border/40', 'stroke-[1px]');
    chart.grid?.appendChild(line);
  });
}

export function updateAxis(chart: ChartElements, geometry: ChartGeometry): void {
  if (!chart.axis) {
    return;
  }
  chart.axis.innerHTML = '';

  if (!geometry.tickInfo.ticks.length || geometry.tickInfo.topValue === 0) {
    chart.axis.classList.add('opacity-0');
    return;
  }

  chart.axis.classList.remove('opacity-0');
  geometry.tickInfo.ticks.forEach((value) => {
    const tick = document.createElement('div');
    tick.className = 'absolute left-2 text-xs text-base-content/60/50 transform -translate-y-1/2';
    tick.textContent = value.toString();
    chart.axis?.appendChild(tick);
  });
}

export function updateXAxis(
  chart: ChartElements,
  history: UsageStats['history'],
  geometry: ChartGeometry
): void {
  if (!chart.xAxis) {
    return;
  }
  chart.xAxis.innerHTML = '';
  if (!geometry.points.length) {
    return;
  }

  const baseline = geometry.baseline;
  const indices = pickLabelIndices(geometry.points.length, 6);

  indices.forEach((index) => {
    const point = geometry.points[index];
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', point.x.toFixed(2));
    label.setAttribute('y', (baseline + X_AXIS_LABEL_OFFSET).toFixed(2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('class', 'fill-text-muted text-[10px]');
    label.textContent = formatDateLabel(history[index].date);
    chart.xAxis?.appendChild(label);

    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', point.x.toFixed(2));
    tick.setAttribute('x2', point.x.toFixed(2));
    tick.setAttribute('y1', baseline.toFixed(2));
    tick.setAttribute('y2', (baseline + 4).toFixed(2));
    tick.classList.add('stroke-border/40', 'stroke-[1px]');
    chart.xAxis?.appendChild(tick);
  });
}

export function updatePoints(chart: ChartElements, geometry: ChartGeometry): void {
  if (!chart.points) {
    return;
  }
  chart.points.innerHTML = '';
  if (!geometry.points.length) {
    return;
  }

  geometry.points.forEach((point) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', point.x.toFixed(2));
    circle.setAttribute('cy', point.y.toFixed(2));
    circle.setAttribute('r', '2.8');
    circle.classList.add('fill-accent', 'stroke-surface-0', 'stroke-2');
    chart.points?.appendChild(circle);
  });
}

export function measureChartBounds(
  graph: HTMLElement | null,
  svg: SVGSVGElement | null
): { width?: number; height?: number } {
  const fallbackWidth = 200;
  const fallbackHeight = 160;
  const graphBounds = graph?.getBoundingClientRect();
  const containerWidth =
    graphBounds && graphBounds.width > 0 ? graphBounds.width : (graph?.clientWidth ?? 0);
  const containerHeight =
    graphBounds && graphBounds.height > 0 ? graphBounds.height : (graph?.clientHeight ?? 0);
  const svgBounds = svg?.getBoundingClientRect();
  const measuredWidth =
    containerWidth ||
    svg?.clientWidth ||
    (svgBounds && svgBounds.width > 0 ? svgBounds.width : 0) ||
    fallbackWidth;
  const measuredHeight =
    containerHeight ||
    svg?.clientHeight ||
    (svgBounds && svgBounds.height > 0 ? svgBounds.height : 0) ||
    fallbackHeight;

  return { width: measuredWidth, height: measuredHeight };
}
