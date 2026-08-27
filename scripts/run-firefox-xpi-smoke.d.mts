import type { FirefoxReleaseTransportMode } from './utils/firefoxReleaseArtifactManifest.mjs';

export function createFirefoxSmokeEnvironment(options: {
  attemptRoot: string;
  browserPath: string;
}): Readonly<Record<string, string>>;

export function runFirefoxXpiSmoke(
  argv?: string[],
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
    transportMode?: FirefoxReleaseTransportMode;
  }>
>;
