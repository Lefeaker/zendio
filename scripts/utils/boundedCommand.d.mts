import type { CommandBoundaryProfileId } from '../config/commandBoundaryProfiles.mjs';

export interface BoundedOutputResult {
  readonly bytes: number;
  readonly sha256: string;
  readonly overflow: boolean;
  readonly text: string;
}

export interface BoundedCommandResult {
  readonly version: string;
  readonly profileId: string;
  readonly cwd: string;
  readonly executable: string | null;
  readonly argv: readonly string[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly terminalReason: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly spawnError: string | null;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly escalation: readonly Readonly<{ signal: NodeJS.Signals; delivered: boolean }>[];
  readonly closeObserved: boolean;
  readonly pipeDrainObserved: boolean;
  readonly output: Readonly<Record<'stdout' | 'stderr' | 'fd4' | 'fd5', BoundedOutputResult>>;
}

export interface BoundedCommandInvocation {
  readonly profileId: CommandBoundaryProfileId | string;
  readonly arguments?: readonly string[];
}

export interface BoundedCommandHandle {
  readonly completion: Promise<BoundedCommandResult>;
  readonly child: object | null;
  cancel(reason?: string): boolean;
}

export interface BoundedCommandDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly mirrorOutput?: boolean;
  readonly resolveProfile?: (
    profileId: string,
    args: readonly string[],
    options: { environment?: NodeJS.ProcessEnv }
  ) => object;
  readonly spawnOperation?: typeof import('node:child_process').spawn;
  readonly now?: () => number;
  readonly setTimeoutOperation?: typeof setTimeout;
  readonly clearTimeoutOperation?: typeof clearTimeout;
  readonly signalSource?: NodeJS.Process;
}

export function startBoundedCommand(
  invocation: BoundedCommandInvocation,
  dependencies?: BoundedCommandDependencies
): BoundedCommandHandle;
export function runBoundedCommand(
  invocation: BoundedCommandInvocation,
  dependencies?: BoundedCommandDependencies
): Promise<BoundedCommandResult>;
export function readCanonicalCommandRequest(environment?: NodeJS.ProcessEnv): Readonly<{
  profileId: string;
  arguments: readonly string[];
  root: string;
  requestPath: string;
}>;
export function runCanonicalCommandRequest(
  environment?: NodeJS.ProcessEnv,
  dependencies?: BoundedCommandDependencies
): Promise<BoundedCommandResult>;
