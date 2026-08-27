import { describe, expect, it, vi } from 'vitest';
import { runFirefoxBrowserTests } from '../../../scripts/run-firefox-browser-tests.mjs';

describe('Firefox browser compatibility runner', () => {
  it('uses the lock-owned Playwright CLI without npx or implicit installation', () => {
    const spawnSyncImpl = vi.fn(
      (_command: string, _args: string[], _options: { env: Record<string, string> }) => ({
        status: 0,
        signal: null
      })
    );
    runFirefoxBrowserTests({
      existsImpl: () => true,
      spawnSyncImpl,
      firefoxExecutable: '/private/playwright/firefox',
      cliPath: '/private/repo/node_modules/playwright/cli.js'
    });

    expect(spawnSyncImpl).toHaveBeenCalledWith(
      process.execPath,
      [
        '/private/repo/node_modules/playwright/cli.js',
        'test',
        'tests/visual/yaml-config.interaction.spec.ts',
        '--project=firefox-desktop'
      ],
      expect.objectContaining({
        shell: false,
        env: expect.objectContaining({ PLAYWRIGHT_INCLUDE_FIREFOX: '1' })
      })
    );
    expect(spawnSyncImpl.mock.calls[0]?.[2]?.env).not.toHaveProperty('WEB_EXT_API_SECRET');
  });

  it('stops for host provisioning when the lock-matched Firefox binary is absent', () => {
    const spawnSyncImpl = vi.fn();
    expect(() =>
      runFirefoxBrowserTests({
        existsImpl: () => false,
        spawnSyncImpl,
        firefoxExecutable: '/private/playwright/firefox',
        cliPath: '/private/repo/node_modules/playwright/cli.js'
      })
    ).toThrow('FIREFOX_BROWSER_NOT_INSTALLED');
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });
});
