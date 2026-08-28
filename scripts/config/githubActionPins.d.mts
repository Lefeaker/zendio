export interface GithubActionPin {
  readonly action: string;
  readonly alias: `v${number}`;
  readonly commit: string;
  readonly actionManifestSha256: string;
  readonly runtime: Readonly<{
    using: 'node24';
    main: string;
    post?: string;
    postIf?: string;
  }>;
  readonly capabilities: Readonly<Record<string, boolean | number | string | readonly string[]>>;
}

export const GITHUB_ACTION_PIN_VERSION: 'github-action-pins-v1';
export const GITHUB_ACTION_PIN_RESOLUTION_DATE: '2026-08-28';
export const GITHUB_ACTION_PINS: readonly Readonly<GithubActionPin>[];
