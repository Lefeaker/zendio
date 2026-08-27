import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firefox } from '@playwright/test';

const repoRoot = process.cwd();
const playwrightCli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function browserTestEnvironment(environment) {
  const temporary = environment.TMPDIR ?? tmpdir();
  return Object.freeze({
    HOME: environment.HOME ?? dirname(process.execPath),
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    TMPDIR: temporary,
    TMP: environment.TMP ?? temporary,
    TEMP: environment.TEMP ?? temporary,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    ...(typeof environment.CI === 'string' ? { CI: environment.CI } : {}),
    ...(typeof environment.PLAYWRIGHT_BROWSERS_PATH === 'string'
      ? { PLAYWRIGHT_BROWSERS_PATH: environment.PLAYWRIGHT_BROWSERS_PATH }
      : {}),
    PLAYWRIGHT_INCLUDE_FIREFOX: '1'
  });
}

export function runFirefoxBrowserTests(dependencies = {}) {
  const existsImpl = dependencies.existsImpl ?? existsSync;
  const spawnSyncImpl = dependencies.spawnSyncImpl ?? spawnSync;
  const firefoxExecutable = dependencies.firefoxExecutable ?? firefox.executablePath();
  const cliPath = dependencies.cliPath ?? playwrightCli;
  if (!existsImpl(firefoxExecutable)) {
    fail('FIREFOX_BROWSER_NOT_INSTALLED', firefoxExecutable);
  }
  if (!existsImpl(cliPath)) fail('PLAYWRIGHT_CLI_NOT_INSTALLED', cliPath);
  const result = spawnSyncImpl(
    process.execPath,
    [cliPath, 'test', 'tests/visual/yaml-config.interaction.spec.ts', '--project=firefox-desktop'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: browserTestEnvironment(process.env),
      shell: false,
      windowsHide: true
    }
  );
  if (result.error || result.status !== 0 || result.signal) {
    fail(
      'FIREFOX_BROWSER_TEST_FAILED',
      result.error?.message ?? result.signal ?? String(result.status)
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runFirefoxBrowserTests();
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
