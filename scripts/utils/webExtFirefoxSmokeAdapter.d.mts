import type {
  FirefoxReleaseArtifactBinding,
  FirefoxReleaseTransportMode
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_XPI_SMOKE_TIMEOUTS: Readonly<{
  launchMs: 120000;
  installMs: 60000;
  queryMs: 30000;
  reloadMs: 30000;
  exitMs: 30000;
  gracefulCloseMs: 20000;
  forcedCloseMs: 10000;
  cleanupMs: 30000;
  wholeMs: 420000;
}>;

export function runVerifiedFirefoxXpiSmoke(
  options: {
    binding: FirefoxReleaseArtifactBinding;
    firefoxExecutable: string;
    profilePath: string;
    bootstrapSourceDir: string;
    transportMode: FirefoxReleaseTransportMode;
  },
  dependencies: {
    webExt: {
      cmd: {
        run(
          options: Record<string, unknown>,
          runnerOptions: { shouldExitProgram: false }
        ): Promise<unknown>;
      };
    };
    now?: () => number;
    setTimeoutOperation?: typeof setTimeout;
    clearTimeoutOperation?: typeof clearTimeout;
  }
): Promise<
  Readonly<{
    schema: 'firefox-exact-xpi-smoke-v1';
    geckoId: string;
    temporarilyInstalled: true;
    reloaded: true;
  }>
>;
