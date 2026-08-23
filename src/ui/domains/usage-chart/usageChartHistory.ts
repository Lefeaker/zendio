import type { UsageStatsHistoryEntry } from '@shared/types/usage';
import type { UsageChartSeriesPoint } from './usageChartTypes';

export { formatUsageDate, parseDateKey, resolveUsageDateKey } from '@shared/usage/usageHistory';
export { prepareUsageHistory as prepareHistory } from '@shared/usage/usageHistory';

export function prepareUsageChartSeries(
  points: readonly UsageChartSeriesPoint[]
): UsageStatsHistoryEntry[] {
  return points.map(({ label, value }) => ({
    date: label,
    aiChat: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0,
    fragment: 0,
    article: 0
  }));
}
