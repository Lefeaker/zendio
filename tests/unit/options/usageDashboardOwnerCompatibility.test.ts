import { describe, expect, it } from 'vitest';
import * as usageChartOwner from '@ui/domains/usage-chart';
import * as usageDashboardOwner from '@options/app/usage-dashboard';
import * as sectionUsageChart from '@options/components/sections/usageChart';
import * as sectionUsageChartRenderers from '@options/components/sections/usageChartRenderers';
import * as sectionUsageDashboardUtils from '@options/components/sections/usageDashboard.utils';
import * as sectionUsageDashboardLayout from '@options/components/sections/usageDashboardLayout';
import * as sectionUsageDashboardState from '@options/components/sections/usageDashboardState';
import * as widgetUsageChart from '@options/widgets/shared/usage/usageChart';
import * as widgetUsageChartRenderers from '@options/widgets/shared/usage/usageChartRenderers';
import * as widgetUsageDashboardUtils from '@options/widgets/shared/usage/usageDashboard.utils';
import * as widgetUsageDashboardLayout from '@options/widgets/shared/usage/usageDashboardLayout';
import * as widgetUsageDashboardState from '@options/widgets/shared/usage/usageDashboardState';

describe('usage dashboard owner compatibility', () => {
  it('keeps legacy chart imports pointed at the Usage chart owner', () => {
    expect(sectionUsageChart.createUsageChartShell).toBe(usageChartOwner.createUsageChartShell);
    expect(sectionUsageChart.renderUsageChart).toBe(usageChartOwner.renderUsageChart);
    expect(widgetUsageChart.createUsageChartShell).toBe(usageChartOwner.createUsageChartShell);
    expect(widgetUsageChart.renderUsageChart).toBe(usageChartOwner.renderUsageChart);

    expect(sectionUsageChartRenderers.measureChartBounds).toBe(usageChartOwner.measureChartBounds);
    expect(sectionUsageChartRenderers.updateAxis).toBe(usageChartOwner.updateAxis);
    expect(sectionUsageChartRenderers.updateGridLines).toBe(usageChartOwner.updateGridLines);
    expect(sectionUsageChartRenderers.updatePoints).toBe(usageChartOwner.updatePoints);
    expect(sectionUsageChartRenderers.updateXAxis).toBe(usageChartOwner.updateXAxis);
    expect(widgetUsageChartRenderers.measureChartBounds).toBe(usageChartOwner.measureChartBounds);
    expect(widgetUsageChartRenderers.updateAxis).toBe(usageChartOwner.updateAxis);
    expect(widgetUsageChartRenderers.updateGridLines).toBe(usageChartOwner.updateGridLines);
    expect(widgetUsageChartRenderers.updatePoints).toBe(usageChartOwner.updatePoints);
    expect(widgetUsageChartRenderers.updateXAxis).toBe(usageChartOwner.updateXAxis);
  });

  it('keeps legacy dashboard helper imports pointed at the Options dashboard owner', () => {
    expect(sectionUsageDashboardUtils.prepareHistory).toBe(usageDashboardOwner.prepareHistory);
    expect(sectionUsageDashboardUtils.computeChartGeometry).toBe(
      usageDashboardOwner.computeChartGeometry
    );
    expect(sectionUsageDashboardUtils.buildSmoothPath).toBe(usageDashboardOwner.buildSmoothPath);
    expect(sectionUsageDashboardUtils.generateTicks).toBe(usageDashboardOwner.generateTicks);
    expect(sectionUsageDashboardUtils.pickLabelIndices).toBe(usageDashboardOwner.pickLabelIndices);
    expect(sectionUsageDashboardUtils.formatDateLabel).toBe(usageDashboardOwner.formatDateLabel);
    expect(sectionUsageDashboardUtils.resolveUsageDateKey).toBe(
      usageDashboardOwner.resolveUsageDateKey
    );
    expect(sectionUsageDashboardUtils.formatUsageDate).toBe(usageDashboardOwner.formatUsageDate);
    expect(sectionUsageDashboardUtils.parseDateKey).toBe(usageDashboardOwner.parseDateKey);

    expect(widgetUsageDashboardUtils.prepareHistory).toBe(usageDashboardOwner.prepareHistory);
    expect(widgetUsageDashboardUtils.computeChartGeometry).toBe(
      usageDashboardOwner.computeChartGeometry
    );
    expect(widgetUsageDashboardUtils.buildSmoothPath).toBe(usageDashboardOwner.buildSmoothPath);
    expect(widgetUsageDashboardUtils.generateTicks).toBe(usageDashboardOwner.generateTicks);
    expect(widgetUsageDashboardUtils.pickLabelIndices).toBe(usageDashboardOwner.pickLabelIndices);
    expect(widgetUsageDashboardUtils.formatDateLabel).toBe(usageDashboardOwner.formatDateLabel);
    expect(widgetUsageDashboardUtils.resolveUsageDateKey).toBe(
      usageDashboardOwner.resolveUsageDateKey
    );
    expect(widgetUsageDashboardUtils.formatUsageDate).toBe(usageDashboardOwner.formatUsageDate);
    expect(widgetUsageDashboardUtils.parseDateKey).toBe(usageDashboardOwner.parseDateKey);
  });

  it('keeps legacy layout and state imports pointed at the Options dashboard owner', () => {
    expect(sectionUsageDashboardLayout.buildUsageDashboardLayout).toBe(
      usageDashboardOwner.buildUsageDashboardLayout
    );
    expect(widgetUsageDashboardLayout.buildUsageDashboardLayout).toBe(
      usageDashboardOwner.buildUsageDashboardLayout
    );

    expect(sectionUsageDashboardState.cloneDefaultUsageStats).toBe(
      usageDashboardOwner.cloneDefaultUsageStats
    );
    expect(sectionUsageDashboardState.resolveUsageStatsFromOptions).toBe(
      usageDashboardOwner.resolveUsageStatsFromOptions
    );
    expect(sectionUsageDashboardState.emitUsageStatsWindowEvent).toBe(
      usageDashboardOwner.emitUsageStatsWindowEvent
    );
    expect(sectionUsageDashboardState.buildUsageSnapshot).toBe(
      usageDashboardOwner.buildUsageSnapshot
    );
    expect(sectionUsageDashboardState.reportUsageIncrementChanges).toBe(
      usageDashboardOwner.reportUsageIncrementChanges
    );

    expect(widgetUsageDashboardState.cloneDefaultUsageStats).toBe(
      usageDashboardOwner.cloneDefaultUsageStats
    );
    expect(widgetUsageDashboardState.resolveUsageStatsFromOptions).toBe(
      usageDashboardOwner.resolveUsageStatsFromOptions
    );
    expect(widgetUsageDashboardState.emitUsageStatsWindowEvent).toBe(
      usageDashboardOwner.emitUsageStatsWindowEvent
    );
    expect(widgetUsageDashboardState.buildUsageSnapshot).toBe(
      usageDashboardOwner.buildUsageSnapshot
    );
    expect(widgetUsageDashboardState.reportUsageIncrementChanges).toBe(
      usageDashboardOwner.reportUsageIncrementChanges
    );
  });
});
