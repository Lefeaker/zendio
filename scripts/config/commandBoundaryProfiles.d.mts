export type CommandBoundaryProfileId =
  | 'coverage-summary-v1'
  | 'dependency-cruiser-v1'
  | 'fixture-v1'
  | 'generated-artifact-check-v1'
  | 'husky-provision-v1'
  | 'lint-staged-hook-v1'
  | 'lint-staged-prepare-v1'
  | 'npm-ci-v1'
  | 'npm-script-browser-v1'
  | 'npm-script-build-v1'
  | 'npm-script-quick-v1'
  | 'npm-script-standard-v1'
  | 'node-script-standard-v1'
  | 'playwright-install-v1'
  | 'playwright-v1'
  | 'prettier-v1'
  | 'stitch-secondary-v1'
  | 'stylelint-v1'
  | 'vitest-v1';

export interface CommandLimits {
  readonly activeMs: number;
  readonly termMs: number;
  readonly killMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly fd4Bytes: number;
  readonly fd5Bytes: number;
}

export interface ResolvedCommandProfile {
  readonly profileId: CommandBoundaryProfileId;
  readonly version: string;
  readonly cwd: string;
  readonly executable?: string;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly shell: false;
  readonly tty: false;
  readonly detached: boolean;
  readonly stdio: readonly ('ignore' | 'pipe')[];
  readonly limits: CommandLimits;
  readonly composite?: string;
  readonly fd3Input?: string;
}

export type ManagedCommandInvocation =
  | Readonly<{
      kind: 'profile';
      profileId: CommandBoundaryProfileId;
      arguments: readonly string[];
      separatorPresent: boolean;
    }>
  | Readonly<{
      kind: 'coordinator';
      coordinatorId: string;
      arguments: readonly string[];
    }>;

export class CommandBoundaryInvocationValidationError extends Error {
  readonly code: string;
}

export const COMMAND_BOUNDARY_VERSION: string;
export const COMMAND_REQUEST_FILE: 'command-request.json';
export const REPOSITORY_ROOT: string;
export const COMMAND_LIMITS: Readonly<Record<string, CommandLimits>>;
export const TASK_GRAPH_POLICIES: Readonly<
  Record<string, Readonly<{ concurrency: number; fullMs: number; terminalReserveMs: number }>>
>;
export const DIRECT_ROOT_COORDINATOR_GRAMMARS: readonly Readonly<{
  path: string;
  grammar: string;
}>[];
export const PROFILE_IDS: readonly CommandBoundaryProfileId[];
export const QUICK_NPM_SCRIPTS: readonly string[];
export const STANDARD_NPM_SCRIPTS: readonly string[];
export const BUILD_NPM_SCRIPTS: readonly string[];
export const BROWSER_NPM_SCRIPTS: readonly string[];

export function parseManagedCommandInvocationArgv(
  argv: readonly string[]
): ManagedCommandInvocation;
export function validateProfileArguments(
  profileId: string,
  args: readonly string[]
): readonly string[];
export function buildClosedCommandEnvironment(
  environment?: NodeJS.ProcessEnv,
  additions?: Record<string, string>
): Readonly<Record<string, string>>;
export function resolveCommandProfile(
  profileId: CommandBoundaryProfileId,
  args: readonly string[],
  options?: { environment?: NodeJS.ProcessEnv }
): ResolvedCommandProfile;
