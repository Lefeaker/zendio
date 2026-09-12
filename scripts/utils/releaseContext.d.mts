export type ReleaseBrowser = 'chrome' | 'firefox';
export type ReleaseEvent = 'push-tag' | 'workflow-dispatch';
export type FirefoxReleaseChannel = 'listed' | 'unlisted';

export interface ReleaseContext {
  readonly schema: 'zendio-release-context-v1';
  readonly browser: ReleaseBrowser;
  readonly event: ReleaseEvent;
  readonly releaseSha: string;
  readonly mainSha: string;
  readonly packageVersion: string;
  readonly tag: string | null;
  readonly channel: FirefoxReleaseChannel | null;
}

export const RELEASE_CONTEXT_SCHEMA: 'zendio-release-context-v1';
export const RELEASE_CONTEXT_EVENTS: readonly ReleaseEvent[];
export const FIREFOX_RELEASE_CHANNELS: readonly FirefoxReleaseChannel[];

export function canonicalizeExpectedReleaseSha(value: string): string;
export function resolveReleaseContext(options: {
  eventName: 'push' | 'workflow_dispatch';
  ref: string;
  eventSha: string;
  headSha: string;
  mainSha: string;
  packageVersion: string;
  expectedSha?: string;
  browser: ReleaseBrowser;
  channel?: FirefoxReleaseChannel;
}): ReleaseContext;
