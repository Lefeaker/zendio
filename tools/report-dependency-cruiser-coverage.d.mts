export interface DependencyCruiserViolation {
  readonly from?: string;
  readonly to?: string;
  readonly rule?: { readonly name?: string };
}

export interface DependencyCruiserSummary {
  readonly modules: number;
  readonly dependencies: number;
  readonly violations: readonly DependencyCruiserViolation[];
}

export const MIN_MODULES: 400;
export const MIN_DEPENDENCIES: 300;
export const MAX_INPUT_JSON_BYTES: number;

export function parseCruiseJson(bytes: Buffer | string): Record<string, unknown>;
export function summarizeCruise(cruiseResult: Record<string, unknown>): DependencyCruiserSummary;
export function evaluateCruise(summary: DependencyCruiserSummary): string[];
export function runDependencyCruiserReport(
  args?: readonly string[],
  dependencies?: {
    runLockedDependencyCruiser?: () => { readonly stdout: Buffer };
  }
): Readonly<{ summary: DependencyCruiserSummary; failures: readonly string[] }>;
