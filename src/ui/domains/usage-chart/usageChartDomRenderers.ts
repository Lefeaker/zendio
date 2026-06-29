import type { UsageStats } from '@shared/types/usage';
import type { ChartElements } from './usageChartTypes';
import { formatDateLabel, pickLabelIndices, type ChartGeometry } from './usageChartGeometry';

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
    if (!Number.isFinite(value) || !Number.isFinite(topValue) || topValue <= 0) {
      return;
    }
    const ratio = value / topValue;
    const y = geometry.baseline - ratio * geometry.usableHeight;
    if (!Number.isFinite(y)) {
      return;
    }
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
