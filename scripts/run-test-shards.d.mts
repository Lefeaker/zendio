export interface TestShardTask {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly args: readonly string[];
  readonly dependsOn: readonly string[];
}

export function createTestShardTaskGraph(
  suite: 'unit' | 'e2e',
  shardId?: string
): Readonly<{ policyId: 'vitest-shards-v1'; tasks: readonly TestShardTask[] }>;
export function main(
  argv?: readonly string[],
  options?: object
): Promise<Readonly<{ ok: boolean; failed: readonly Readonly<{ code?: number }>[] }>>;
