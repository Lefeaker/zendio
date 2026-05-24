export type TypeAuditTotals = Record<string, number>;

export type ThresholdFailure = {
  metric: string;
  actual: number;
  max: number;
  delta: number;
};

export function checkThresholds(
  report: { totals: TypeAuditTotals },
  limits: TypeAuditTotals
): {
  ok: boolean;
  failures: ThresholdFailure[];
};
