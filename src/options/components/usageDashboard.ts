import { DEFAULT_USAGE_STATS, USAGE_STATS_STORAGE_KEY, normalizeUsageStats } from '../../shared/constants';
import type { UsageStats, UsageStatsHistoryEntry } from '../../shared/types';

interface UsageDashboardElements {
  root: HTMLElement | null;
  total: HTMLElement | null;
  ai: HTMLElement | null;
  fragment: HTMLElement | null;
  article: HTMLElement | null;
  wavePath: SVGPathElement | null;
  waveSvg: SVGSVGElement | null;
  grid: SVGGElement | null;
  axis: HTMLElement | null;
  xAxis: SVGGElement | null;
  points: SVGGElement | null;
}

declare global {
  interface Window {
    aiobUsageStats?: UsageStats & { total?: number };
  }
}

const elements: UsageDashboardElements = {
  root: null,
  total: null,
  ai: null,
  fragment: null,
  article: null,
  wavePath: null,
  waveSvg: null,
  grid: null,
  axis: null,
  xAxis: null,
  points: null
};

let initialized = false;
let currentStats: UsageStats = { ...DEFAULT_USAGE_STATS };

export async function initializeUsageDashboard(): Promise<void> {
  cacheElements();
  if (!elements.root) {
    return;
  }

  await refreshUsageStats();
  hydrateOutlet();

  if (!initialized) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    initialized = true;
  }
}

async function refreshUsageStats(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(USAGE_STATS_STORAGE_KEY);
    const normalized = normalizeUsageStats(stored[USAGE_STATS_STORAGE_KEY]);
    applyStats(normalized);
  } catch (error) {
    console.error('[usageDashboard] Failed to load usage stats:', error);
    applyStats({ ...DEFAULT_USAGE_STATS });
  }
}

function cacheElements(): void {
  if (!elements.root) {
    const root = document.getElementById('usageDashboard');
    elements.root = root instanceof HTMLElement ? root : null;
  }

  if (!elements.total) {
    const total = document.getElementById('usageTotalCount');
    elements.total = total instanceof HTMLElement ? total : null;
  }

  if (!elements.ai) {
    const ai = document.getElementById('usageAiCount');
    elements.ai = ai instanceof HTMLElement ? ai : null;
  }

  if (!elements.fragment) {
    const fragment = document.getElementById('usageFragmentCount');
    elements.fragment = fragment instanceof HTMLElement ? fragment : null;
  }

  if (!elements.article) {
    const article = document.getElementById('usageArticleCount');
    elements.article = article instanceof HTMLElement ? article : null;
  }

  if (!elements.waveSvg) {
    elements.waveSvg = document.querySelector<SVGSVGElement>('#usageWave');
  }

  if (!elements.wavePath) {
    elements.wavePath = document.querySelector<SVGPathElement>('#usageWavePath');
  }

  if (!elements.grid) {
    elements.grid = document.querySelector<SVGGElement>('#usageGrid');
  }

  if (!elements.axis) {
    const axis = document.getElementById('usageAxis');
    elements.axis = axis instanceof HTMLElement ? axis : null;
  }

  if (!elements.xAxis) {
    elements.xAxis = document.querySelector<SVGGElement>('#usageXAxis');
  }

  if (!elements.points) {
    elements.points = document.querySelector<SVGGElement>('#usagePoints');
  }
}

function applyStats(stats: UsageStats): void {
  currentStats = stats;
  const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;

  updateCount(elements.total, total);
  updateCount(elements.ai, stats.aiChatSaves);
  updateCount(elements.fragment, stats.fragmentSaves);
  updateCount(elements.article, stats.articleSaves);
  const history = prepareHistory(stats);
  const geometry = updateWave(history);
  updateAxis(history, geometry);
  updateXAxis(history, geometry);
  updatePoints(history, geometry);
  updateDataOutlet(stats, total);
}

function updateCount(element: HTMLElement | null, value: number): void {
  if (!element) {
    return;
  }
  element.textContent = value.toString();
}

interface ChartPoint {
  x: number;
  y: number;
  total: number;
  date: string;
}

interface ChartGeometry {
  points: ChartPoint[];
  baseline: number;
  usableHeight: number;
  svgWidth: number;
  svgHeight: number;
  xPadding: number;
  tickInfo: TickInfo;
}

const X_AXIS_LABEL_OFFSET = 12;

function updateWave(history: UsageStats['history']): ChartGeometry {
  const geometry = computeChartGeometry(history);
  if (!elements.wavePath) {
    return geometry;
  }

  const { points, baseline, svgWidth, xPadding, tickInfo, usableHeight } = geometry;
  if (elements.waveSvg) {
    elements.waveSvg.setAttribute('viewBox', `0 0 ${svgWidth.toFixed(2)} ${geometry.svgHeight.toFixed(2)}`);
    elements.waveSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  if (!points.length) {
    elements.wavePath.setAttribute('d', `M0 ${baseline} L${svgWidth} ${baseline}`);
    updateGridLines([], baseline, usableHeight, svgWidth);
    return geometry;
  }

  if (points.length === 1) {
    const y = points[0].y;
    const startX = xPadding;
    const endX = svgWidth - xPadding;
    const path = `M${startX.toFixed(2)} ${y.toFixed(2)} L${endX.toFixed(2)} ${y.toFixed(2)}`;
    elements.wavePath.setAttribute('d', path);
  } else {
    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');
    elements.wavePath.setAttribute('d', path);
  }

  updateGridLines(tickInfo.ticks.map(value => ({ value, topValue: tickInfo.topValue })), baseline, usableHeight, svgWidth);
  return geometry;
}

function updateDataOutlet(stats: UsageStats, total: number): void {
  if (!elements.root) {
    return;
  }

  const outletPayload = {
    ...stats,
    total,
    lastUpdatedISO: stats.lastUpdatedISO ?? null
  };

  elements.root.setAttribute('data-stats', JSON.stringify(outletPayload));
  window.aiobUsageStats = outletPayload;
  window.dispatchEvent(new CustomEvent('aiob-usage-stats', { detail: outletPayload }));
}

function handleStorageChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: 'sync' | 'local' | 'managed'
): void {
  if (areaName !== 'local') {
    return;
  }

  const change = changes[USAGE_STATS_STORAGE_KEY];
  if (!change) {
    return;
  }

  const normalized = normalizeUsageStats(change.newValue);
  applyStats(normalized);
}

function hydrateOutlet(): void {
  const total = currentStats.aiChatSaves + currentStats.fragmentSaves + currentStats.articleSaves;
  updateDataOutlet(currentStats, total);
}

function prepareHistory(stats: UsageStats): UsageStats['history'] {
  const input = Array.isArray(stats.history) ? stats.history : [];
  const sorted = [...input].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    if (total === 0) {
      return [];
    }

    const fallbackDate = resolveUsageDateKey(stats.lastUpdatedISO);
    return [{
      date: fallbackDate,
      aiChat: stats.aiChatSaves,
      fragment: stats.fragmentSaves,
      article: stats.articleSaves
    }];
  }

  const endDate = parseDateKey(sorted[sorted.length - 1].date) ?? new Date();
  const earliestDate = parseDateKey(sorted[0].date) ?? endDate;
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29);
  if (startDate < earliestDate) {
    startDate.setTime(earliestDate.getTime());
  }

  const values = new Map<string, UsageStatsHistoryEntry>();
  sorted.forEach(entry => {
    values.set(entry.date, {
      date: entry.date,
      aiChat: entry.aiChat,
      fragment: entry.fragment,
      article: entry.article
    });
  });

  const timeline: UsageStatsHistoryEntry[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = formatUsageDate(cursor);
    const existing = values.get(key);
    if (existing) {
      timeline.push(existing);
    } else {
      timeline.push({ date: key, aiChat: 0, fragment: 0, article: 0 });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const trimmed = timeline.slice(-30);
  const timelineTotal = trimmed.reduce((sum, entry) => sum + entry.aiChat + entry.fragment + entry.article, 0);
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

function updateAxis(history: UsageStats['history'], geometry?: ChartGeometry): void {
  if (!elements.axis) {
    return;
  }

  const tickInfo = geometry?.tickInfo ?? generateTicks(Math.max(...history.map(entry => entry.aiChat + entry.fragment + entry.article), 0));
  elements.axis.innerHTML = '';

  if (!tickInfo.ticks.length || tickInfo.topValue === 0) {
    elements.axis.classList.add('usage-axis--hidden');
    return;
  }

  elements.axis.classList.remove('usage-axis--hidden');

  tickInfo.ticks.forEach((tickValue) => {
    const tick = document.createElement('div');
    tick.className = 'usage-axis__tick';
    tick.textContent = tickValue.toString();
    elements.axis?.appendChild(tick);
  });
}

interface GridTickContext {
  value: number;
  topValue: number;
}

function updateGridLines(ticks: GridTickContext[], baseline: number, usableHeight = 0, svgWidth = 200): void {
  if (!elements.grid) {
    return;
  }

  elements.grid.innerHTML = '';

  if (!ticks.length || usableHeight <= 0) {
    return;
  }

  ticks.forEach(({ value, topValue }) => {
    if (topValue <= 0) {
      return;
    }
    const ratio = value / topValue;
    const y = baseline - ratio * usableHeight;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', svgWidth.toString());
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.classList.add('usage-grid-line');
    elements.grid?.appendChild(line);
  });
}

interface TickInfo {
  ticks: number[];
  topValue: number;
}

function generateTicks(maxValue: number): TickInfo {
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

function computeChartGeometry(history: UsageStats['history']): ChartGeometry {
  const svgElement = elements.waveSvg ?? elements.wavePath?.ownerSVGElement ?? null;
  const container = (svgElement?.parentElement ?? null) as (HTMLElement | null);
  const containerBounds = container?.getBoundingClientRect();
  const clientWidth = svgElement instanceof SVGSVGElement ? svgElement.clientWidth : 0;
  const clientHeight = svgElement instanceof SVGSVGElement ? svgElement.clientHeight : 0;
  const bounds = svgElement?.getBoundingClientRect();
  const fallbackWidth = 200;
  const fallbackHeight = 160;
  const containerWidth = containerBounds && containerBounds.width > 0
    ? containerBounds.width
    : (container?.clientWidth ?? 0);
  const containerHeight = containerBounds && containerBounds.height > 0
    ? containerBounds.height
    : (container?.clientHeight ?? 0);
  const measuredWidth = containerWidth || clientWidth || (bounds && bounds.width > 0 ? bounds.width : 0);
  const measuredHeight = containerHeight || clientHeight || (bounds && bounds.height > 0 ? bounds.height : 0);
  const svgWidth = measuredWidth > 0 ? measuredWidth : fallbackWidth;
  const svgHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;
  const paddingTop = 16;
  const paddingBottom = 20;
  const xPadding = 16;
  const usableHeight = Math.max(svgHeight - paddingTop - paddingBottom, 0);
  const baseline = Math.max(svgHeight - paddingBottom, 0);

  if (!history.length) {
    return {
      points: [],
      baseline,
      usableHeight,
      svgWidth,
      svgHeight,
      xPadding,
      tickInfo: { ticks: [], topValue: 0 }
    };
  }

  const totals = history.map(entry => entry.aiChat + entry.fragment + entry.article);
  const maxValue = Math.max(...totals, 0);
  if (!totals.some(value => value > 0)) {
    return {
      points: history.map((entry, index) => ({
        x: xPadding + index * ((svgWidth - xPadding * 2) / Math.max(history.length - 1, 1)),
        y: baseline,
        total: entry.aiChat + entry.fragment + entry.article,
        date: entry.date
      })),
      baseline,
      usableHeight,
      svgWidth,
      svgHeight,
      xPadding,
      tickInfo: { ticks: [], topValue: 0 }
    };
  }
  const tickInfo = generateTicks(maxValue);
  const topValue = tickInfo.topValue || 1;

  const pointCount = history.length;
  const xRange = svgWidth - xPadding * 2;
  const xStep = pointCount > 1 ? xRange / (pointCount - 1) : 0;
  const singleX = xPadding + xRange / 2;

  const points: ChartPoint[] = history.map((entry, index) => {
    const total = totals[index];
    const ratio = topValue ? total / topValue : 0;
    const y = baseline - ratio * usableHeight;
    const x = pointCount > 1 ? xPadding + index * xStep : singleX;
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
    svgWidth,
    svgHeight,
    xPadding,
    tickInfo
  };
}

function updatePoints(history: UsageStats['history'], geometry?: ChartGeometry): void {
  if (!elements.points) {
    return;
  }

  elements.points.innerHTML = '';
  const chart = geometry ?? computeChartGeometry(history);

  if (!chart.points.length) {
    return;
  }

  chart.points.forEach(point => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', point.x.toFixed(2));
    circle.setAttribute('cy', point.y.toFixed(2));
    circle.setAttribute('r', '2.6');
    circle.classList.add('usage-point');
    elements.points?.appendChild(circle);
  });
}

function updateXAxis(history: UsageStats['history'], geometry?: ChartGeometry): void {
  if (!elements.xAxis) {
    return;
  }

  elements.xAxis.innerHTML = '';
  const chart = geometry ?? computeChartGeometry(history);

  if (!chart.points.length) {
    return;
  }

  const baseline = chart.baseline;
  const indices = pickLabelIndices(chart.points.length, 6);

  indices.forEach(index => {
    const point = chart.points[index];
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', point.x.toFixed(2));
    label.setAttribute('y', (baseline + X_AXIS_LABEL_OFFSET).toFixed(2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.textContent = formatDateLabel(history[index].date);
    elements.xAxis?.appendChild(label);

    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', point.x.toFixed(2));
    tick.setAttribute('x2', point.x.toFixed(2));
    tick.setAttribute('y1', baseline.toFixed(2));
    tick.setAttribute('y2', (baseline + 4).toFixed(2));
    tick.classList.add('usage-grid-line');
    elements.xAxis?.appendChild(tick);
  });
}

function pickLabelIndices(length: number, maxLabels: number): number[] {
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

function formatDateLabel(date: string): string {
  const parsed = new Date(date + 'T00:00:00Z');
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${month}/${day}`;
  }
  return date;
}

function resolveUsageDateKey(source?: string | null): string {
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return formatUsageDate(parsed);
    }
  }
  return formatUsageDate(new Date());
}

function formatUsageDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}
