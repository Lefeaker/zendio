import type { UsageStatsHistoryEntry } from '@shared/types/usage';

export const USAGE_CHART_GEOMETRY_RUNTIME_MARKER = new Set<string>();

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
  minimumTopValue?: number;
  tickCount?: number;
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
    xPadding = DEFAULT_CHART_BOUNDS.xPadding,
    minimumTopValue = 0,
    tickCount
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

  const totals = history.map(
    (entry) =>
      normalizeChartCount(entry.aiChat) +
      normalizeChartCount(entry.fragment) +
      normalizeChartCount(entry.article)
  );
  const maxValue = Math.max(...totals, 0);
  const tickInfo = createTickInfo(Math.max(maxValue, minimumTopValue), tickCount);
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
    const controlX = (current.x + next.x) / 2;

    segments.push(
      `C${controlX.toFixed(2)} ${current.y.toFixed(2)}, ${controlX.toFixed(2)} ${next.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
    );
  }

  return segments.join(' ');
}

export function buildAreaPath(points: ChartPoint[], baseline: number): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildSmoothPath(points)} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

export function generateTicks(maxValue: number): TickInfo {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
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

function createTickInfo(maxValue: number, tickCount?: number): TickInfo {
  const generated = generateTicks(maxValue);
  if (!tickCount || tickCount < 2 || generated.topValue === 0) {
    return generated;
  }
  return {
    topValue: generated.topValue,
    ticks: Array.from(
      { length: tickCount },
      (_, index) => generated.topValue - (generated.topValue * index) / (tickCount - 1)
    )
  };
}

function normalizeChartCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
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
