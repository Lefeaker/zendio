import type { FirefoxBrowserInput } from '../config/commandBoundaryProfiles.mjs';
import type { FirefoxSaveScenarioResult } from './firefoxWebDriverBidiSaveScenario.mjs';
import type {
  FirefoxReleaseArtifactBinding,
  FirefoxReleaseTransportMode
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA: 'webdriver-bidi-v1';
export function createDeadline(): {
  readonly fenced: boolean;
  fence(): void;
  remaining(): number;
  run<T>(this: void, operation: () => Promise<T>, timeoutMs: number, code: string): Promise<T>;
};
export const FIREFOX_XPI_SMOKE_TIMEOUTS: Readonly<{
  driverStartMs: 30000;
  sessionMs: 120000;
  installMs: 60000;
  bootstrapMs: 60000;
  uninstallMs: 30000;
  sessionStatusMs: 30000;
  sessionDeleteMs: 30000;
  gracefulCloseMs: 20000;
  forcedCloseMs: 10000;
  cleanupMs: 30000;
  wholeMs: 420000;
}>;

export function runVerifiedFirefoxXpiSmoke(
  options: {
    binding: FirefoxReleaseArtifactBinding;
    firefoxExecutable: string;
    geckodriverExecutable: string;
    profileRoot: string;
    transportMode: FirefoxReleaseTransportMode;
    driverEnvironment: Readonly<Record<string, string>>;
    browserInput?: FirefoxBrowserInput;
    scenario?: 'save-retry-v1';
  },
  dependencies?: Record<string, unknown>
): Promise<
  Readonly<{
    schema: 'firefox-exact-xpi-smoke-v2';
    adapter: 'webdriver-bidi-v1';
    geckoId: string;
    installed: true;
    bootstrapped: true;
    uninstalled: true;
    reinstalled: true;
    rebootstrapped: true;
    saveScenario?: FirefoxSaveScenarioResult;
  }>
>;
