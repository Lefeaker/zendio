import type { UsageStats } from '@shared/types/usage';
import {
  measureChartBounds,
  updateAxis,
  updateGridLines,
  updatePoints,
  updateXAxis
} from './usageChartDomRenderers';
import { buildSmoothPath, computeChartGeometry, type ChartGeometry } from './usageChartGeometry';
import { prepareHistory } from './usageChartHistory';
import type { ChartElements } from './usageChartTypes';

export type { ChartElements } from './usageChartTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';

const isSVGSVGElement = (node: Element): node is SVGSVGElement => node instanceof SVGSVGElement;
const isSVGGElement = (node: Element): node is SVGGElement => node instanceof SVGGElement;
const isSVGPathElement = (node: Element): node is SVGPathElement => node instanceof SVGPathElement;

function createSvgElement<T extends Element>(
  tagName: string,
  guard: (node: Element) => node is T,
  label: string
): T {
  const element = document.createElementNS(SVG_NS, tagName);
  if (!guard(element)) {
    throw new Error(`[UsageSection] Failed to create ${label} element for <${tagName}>`);
  }
  return element;
}

export function createUsageChartShell(createElement: (tagName: string) => HTMLElement): {
  host: HTMLElement;
  chart: ChartElements;
} {
  const chartHost = createElement('div');
  chartHost.className = [
    'relative',
    'w-full',
    'h-[200px]',
    'mt-4',
    'bg-base-100',
    'border',
    'border-base-300/50',
    'rounded-lg',
    'overflow-hidden'
  ].join(' ');

  const axis = createElement('div');
  axis.className = [
    'absolute',
    'inset-0',
    'pointer-events-none',
    'opacity-0',
    'transition-opacity',
    'duration-200'
  ].join(' ');
  axis.id = 'usageAxis';
  chartHost.append(axis);

  const graph = createElement('div');
  graph.className = 'absolute inset-0';

  const svg = createSvgElement('svg', isSVGSVGElement, 'root SVG');
  svg.setAttribute('id', 'usageWave');
  svg.setAttribute('viewBox', '0 0 200 160');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('w-full', 'h-full');

  const grid = createSvgElement('g', isSVGGElement, 'grid');
  grid.setAttribute('id', 'usageGrid');

  const path = createSvgElement('path', isSVGPathElement, 'wave path');
  path.setAttribute('id', 'usageWavePath');
  path.setAttribute('d', 'M0 150 L200 150');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.classList.add('fill-none', 'stroke-accent', 'stroke-2');

  const points = createSvgElement('g', isSVGGElement, 'points layer');
  points.setAttribute('id', 'usagePoints');

  const xAxis = createSvgElement('g', isSVGGElement, 'x-axis layer');
  xAxis.setAttribute('id', 'usageXAxis');

  svg.append(grid, path, points, xAxis);
  graph.append(svg);
  chartHost.append(graph);

  return {
    host: chartHost,
    chart: {
      axis,
      graph,
      svg,
      path,
      grid,
      points,
      xAxis
    }
  };
}

export function renderUsageChart(chart: ChartElements, stats: UsageStats): void {
  const history = prepareHistory(stats);
  const geometry = updateWave(chart, history);
  updateAxis(chart, geometry);
  updateXAxis(chart, history, geometry);
  updatePoints(chart, geometry);
}

function updateWave(chart: ChartElements, history: UsageStats['history']): ChartGeometry {
  const measurements = measureChartBounds(chart.graph, chart.svg);
  const geometry = computeChartGeometry(history, measurements);
  if (chart.svg) {
    chart.svg.setAttribute(
      'viewBox',
      `0 0 ${geometry.svgWidth.toFixed(2)} ${geometry.svgHeight.toFixed(2)}`
    );
    chart.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  if (!chart.path) {
    return geometry;
  }

  if (!geometry.points.length) {
    chart.path.setAttribute(
      'd',
      `M0 ${geometry.baseline} L${geometry.svgWidth} ${geometry.baseline}`
    );
    updateGridLines(chart, [], geometry);
    return geometry;
  }

  if (geometry.points.length === 1) {
    const point = geometry.points[0];
    const startX = geometry.xPadding;
    const endX = geometry.svgWidth - geometry.xPadding;
    chart.path.setAttribute(
      'd',
      `M${startX.toFixed(2)} ${point.y.toFixed(2)} L${endX.toFixed(2)} ${point.y.toFixed(2)}`
    );
  } else {
    chart.path.setAttribute('d', buildSmoothPath(geometry.points));
  }

  const tickContexts = geometry.tickInfo.ticks.map((value) => ({
    value,
    topValue: geometry.tickInfo.topValue
  }));
  updateGridLines(chart, tickContexts, geometry);
  return geometry;
}
