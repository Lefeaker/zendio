import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('../../../../src/shared/errors', () => ({
  handleError: handleErrorMock
}));

describe('firefox platform utils', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports unsupported firefox environment before throwing', async () => {
    const originalBrowser = (globalThis as typeof globalThis & { browser?: typeof browser })
      .browser;
    Reflect.deleteProperty(
      globalThis as typeof globalThis & { browser?: typeof browser },
      'browser'
    );

    const { ensureFirefox } = await import('../../../../src/platform/firefox/utils');

    expect(() => ensureFirefox()).toThrow('Firefox browser API is not available in this context');
    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CHROME_API_UNSUPPORTED_ENVIRONMENT',
        domain: 'chrome-api',
        context: expect.objectContaining({
          api: 'browser',
          operation: 'ensureFirefox'
        })
      }),
      { suppressConsole: true, suppressNotifications: true }
    );

    if (originalBrowser) {
      (globalThis as typeof globalThis & { browser?: typeof browser }).browser = originalBrowser;
    }
  });
});
