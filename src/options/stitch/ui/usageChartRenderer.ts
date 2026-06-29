import { el } from './dom';
import type { UsagePoint } from '../types';

export function renderUsageChart(root: HTMLElement, history: UsagePoint[]): void {
  const normalizedHistory = history.map((item) => ({
    ...item,
    value: normalizeChartValue(item.value)
  }));
  const shellBounds = root.getBoundingClientRect();
  const graphBounds =
    root.querySelector<HTMLElement>('.usage-graph')?.getBoundingClientRect() ??
    root.getBoundingClientRect();
  const width = Math.max(Math.round(graphBounds.width), 480);
  const height = Math.max(Math.round(shellBounds.height), 180);
  const leftPadding = 8;
  const rightPadding = 8;
  const topPadding = 18;
  const bottomPadding = 32;
  const baseline = height - bottomPadding;
  const usableHeight = baseline - topPadding;
  const maxValue = Math.max(0, ...normalizedHistory.map((item) => item.value));
  const topValue = Math.max(Math.ceil(maxValue / 20) * 20, 20);

  const points = normalizedHistory.map((item, index) => {
    const x =
      leftPadding +
      (index / Math.max(normalizedHistory.length - 1, 1)) * (width - leftPadding - rightPadding);
    const y = baseline - (item.value / topValue) * usableHeight;
    return { ...item, x, y };
  });
  const labelStep =
    normalizedHistory.length > 12 ? Math.max(1, Math.ceil(normalizedHistory.length / 5)) : 1;

  const axis = root.querySelector('#usageAxis');
  const grid = root.querySelector('#usageGrid');
  const fillPath = root.querySelector('#usageFillPath');
  const svg = root.querySelector('#usageWave');
  const wavePath = root.querySelector('#usageWavePath');
  const xAxis = root.querySelector('#usageXAxis');

  if (!axis || !grid || !fillPath || !svg || !wavePath || !xAxis) {
    return;
  }

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  axis.replaceChildren();
  grid.replaceChildren();
  xAxis.replaceChildren();

  [0, topValue / 3, (topValue / 3) * 2, topValue].forEach((tick) => {
    const y = baseline - (tick / topValue) * usableHeight;
    if (!Number.isFinite(y)) {
      return;
    }
    axis.append(
      el('div', {
        className: 'usage-axis-label',
        style: { '--usage-label-y': `${y}px` },
        text: String(Math.round(tick))
      })
    );

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(width));
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.setAttribute('class', 'usage-grid-line');
    grid.append(line);
  });

  fillPath.setAttribute('d', buildAreaPath(points, baseline));
  wavePath.setAttribute('d', buildSmoothPath(points));

  points.forEach((point, index) => {
    const shouldRenderLabel = index === 0 || index === points.length - 1 || index % labelStep === 0;
    if (!shouldRenderLabel) {
      return;
    }

    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', point.x.toFixed(2));
    tick.setAttribute('x2', point.x.toFixed(2));
    tick.setAttribute('y1', baseline.toFixed(2));
    tick.setAttribute('y2', (baseline + 4).toFixed(2));
    tick.setAttribute('class', 'usage-xaxis-tick');
    xAxis.append(tick);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', point.x.toFixed(2));
    text.setAttribute('y', (baseline + 18).toFixed(2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'usage-xaxis-label');
    text.textContent = point.label;
    xAxis.append(text);
  });
}

function normalizeChartValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function buildSmoothPath(points: Array<UsagePoint & { x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    path += ` C${midX.toFixed(2)} ${current.y.toFixed(2)}, ${midX.toFixed(2)} ${next.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function buildAreaPath(
  points: Array<UsagePoint & { x: number; y: number }>,
  baseline: number
): string {
  if (!points.length) return '';
  const linePath = buildSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L${lastPoint.x.toFixed(2)} ${baseline.toFixed(2)} L${firstPoint.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}
