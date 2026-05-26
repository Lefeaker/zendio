import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_BOUNDS,
  buildSmoothPath,
  buildUsageDashboardLayout,
  buildUsageSnapshot,
  cloneDefaultUsageStats,
  computeChartGeometry,
  createUsageStatsEventDetail,
  emitUsageStatsWindowEvent,
  formatDateLabel,
  formatUsageDate,
  generateTicks,
  parseDateKey,
  pickLabelIndices,
  prepareHistory,
  reportUsageIncrementChanges,
  resolveUsageDateKey,
  resolveUsageStatsFromOptions
} from '@options/app/usage-dashboard';
import {
  createUsageChartShell,
  measureChartBounds,
  renderUsageChart,
  updateAxis,
  updateGridLines,
  updatePoints,
  updateXAxis
} from '@ui/domains/usage-chart';

describe('usage dashboard owner compatibility', () => {
  it('exposes usage chart behavior from the current UI domain owner', () => {
    expect(createUsageChartShell).toBeTypeOf('function');
    expect(renderUsageChart).toBeTypeOf('function');
    expect(measureChartBounds).toBeTypeOf('function');
    expect(updateAxis).toBeTypeOf('function');
    expect(updateGridLines).toBeTypeOf('function');
    expect(updatePoints).toBeTypeOf('function');
    expect(updateXAxis).toBeTypeOf('function');
  });

  it('exposes usage dashboard math helpers from the current Options owner', () => {
    expect(DEFAULT_CHART_BOUNDS).toBeTypeOf('object');
    expect(prepareHistory).toBeTypeOf('function');
    expect(computeChartGeometry).toBeTypeOf('function');
    expect(buildSmoothPath).toBeTypeOf('function');
    expect(generateTicks).toBeTypeOf('function');
    expect(pickLabelIndices).toBeTypeOf('function');
    expect(formatDateLabel).toBeTypeOf('function');
    expect(resolveUsageDateKey).toBeTypeOf('function');
    expect(formatUsageDate).toBeTypeOf('function');
    expect(parseDateKey).toBeTypeOf('function');
  });

  it('exposes usage dashboard layout and state helpers from the current Options owner', () => {
    expect(buildUsageDashboardLayout).toBeTypeOf('function');
    expect(cloneDefaultUsageStats).toBeTypeOf('function');
    expect(resolveUsageStatsFromOptions).toBeTypeOf('function');
    expect(createUsageStatsEventDetail).toBeTypeOf('function');
    expect(emitUsageStatsWindowEvent).toBeTypeOf('function');
    expect(buildUsageSnapshot).toBeTypeOf('function');
    expect(reportUsageIncrementChanges).toBeTypeOf('function');
  });
});
