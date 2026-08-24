export type CommandBoundaryProfileId =
  | 'chrome-dry-run-v1'
  | 'chrome-prepare-v1'
  | 'chrome-publish-v1'
  | 'chrome-verify-v1'
  | 'coverage-summary-v1'
  | 'dependency-cruiser-v1'
  | 'fixture-v1'
  | 'firefox-prepare-v1'
  | 'firefox-smoke-v1'
  | 'firefox-submit-v1'
  | 'firefox-verify-v1'
  | 'generated-artifact-check-v1'
  | 'github-ci-install-v1'
  | 'husky-provision-v1'
  | 'isolated-build-v1'
  | 'lint-staged-hook-v1'
  | 'lint-staged-prepare-v1'
  | 'local-install-v1'
  | 'npm-audit-context-v1'
  | 'npm-ci-v1'
  | 'npm-script-browser-v1'
  | 'npm-script-build-v1'
  | 'npm-script-quick-v1'
  | 'npm-script-standard-v1'
  | 'npm-tree-read-v1'
  | 'node-script-standard-v1'
  | 'playwright-browser-install-v1'
  | 'playwright-host-deps-platform-v1'
  | 'playwright-install-v1'
  | 'playwright-v1'
  | 'prettier-v1'
  | 'release-job-outputs-v1'
  | 'release-provenance-v1'
  | 'release-result-field-v1'
  | 'release-runtime-check-v1'
  | 'release-state-check-v1'
  | 'release-state-init-v1'
  | 'stitch-secondary-v1'
  | 'stylelint-v1'
  | 'vitest-v1';

export interface CommandLimits {
  readonly activeMs: number | null;
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
  readonly operation?: string;
  readonly fd3Input?: string;
  readonly platformOwned?: boolean;
  readonly commandContext?: Readonly<Record<string, unknown>>;
  readonly ciInstallOutputs?: Readonly<{
    path: string;
    lines: readonly string[];
  }>;
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
export const R03_CI_JOB_SEQUENCE_RESERVATIONS: Readonly<
  Record<string, readonly Readonly<{ owner: string; fullMs: number }>[]>
>;
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
  options?: {
    environment?: NodeJS.ProcessEnv;
    operations?: object;
  }
): ResolvedCommandProfile;
