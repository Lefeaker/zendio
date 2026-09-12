export interface PreflightTask {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly args: readonly string[];
  readonly dependsOn: readonly string[];
}

export function createPreflightTaskGraph(): Readonly<{
  policyId: 'preflight-v1';
  tasks: readonly PreflightTask[];
}>;
export function runPreflight(options?: object): Promise<
  Readonly<{
    ok: boolean;
    failed: readonly Readonly<{ code?: number; name: string }>[];
  }>
>;
