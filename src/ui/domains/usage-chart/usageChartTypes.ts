export const USAGE_CHART_PRESENTATIONS = ['default', 'stitch'] as const;

export type UsageChartPresentation = (typeof USAGE_CHART_PRESENTATIONS)[number];

export interface ChartElements {
  axis: HTMLElement | null;
  graph: HTMLElement | null;
  svg: SVGSVGElement | null;
  path: SVGPathElement | null;
  fillPath?: SVGPathElement | null;
  grid: SVGGElement | null;
  points: SVGGElement | null;
  xAxis: SVGGElement | null;
  presentation?: UsageChartPresentation;
}

export interface UsageChartSeriesPoint {
  label: string;
  value: number;
}
