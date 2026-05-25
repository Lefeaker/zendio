export type TypeAuditTotals = Record<string, number>;

export type ThresholdFailure = {
  scope?: 'src' | 'tests';
  metric: string;
  actual: number;
  max: number;
  delta: number;
};

export function checkThresholds(
  report: { totals: TypeAuditTotals; scopes?: Record<string, TypeAuditTotals> },
  limits: TypeAuditTotals | Record<string, TypeAuditTotals>
): {
  ok: boolean;
  failures: ThresholdFailure[];
};
