import type { BoundedCommandHandle } from './utils/boundedCommand.mjs';

export interface BrowserShardTask {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly args: readonly string[];
  readonly dependsOn: readonly string[];
}

export function createBrowserShardTaskGraph(suite: 'e2e' | 'visual' | 'bundled'): Readonly<{
  policyId: 'browser-shards-v1';
  tasks: readonly BrowserShardTask[];
}>;
export function createBrowserShardEnvironment(
  taskId: string,
  environment?: NodeJS.ProcessEnv
): NodeJS.ProcessEnv;
export function main(
  argv?: readonly string[],
  options?: Readonly<{
    environment?: NodeJS.ProcessEnv;
    startCommand?: (task: BrowserShardTask) => BoundedCommandHandle;
    startCommandOperation?: (
      invocation: Readonly<{ profileId: string; arguments: readonly string[] }>,
      dependencies: Readonly<{ environment: NodeJS.ProcessEnv }>
    ) => BoundedCommandHandle;
    taskGraphOptions?: object;
  }>
): Promise<Readonly<{ ok: boolean; failed: readonly Readonly<{ code?: number }>[] }>>;
