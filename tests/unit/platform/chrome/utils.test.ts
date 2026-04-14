import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('../../../../src/shared/errors', () => ({
  handleError: handleErrorMock
}));

describe('chrome platform utils', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports unsupported chrome environment before throwing', async () => {
    const originalChrome = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    Reflect.deleteProperty(globalThis as typeof globalThis & { chrome?: typeof chrome }, 'chrome');

    const { ensureChrome } = await import('../../../../src/platform/chrome/utils');

    expect(() => ensureChrome()).toThrow('Chrome runtime API is not available in this context');
    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CHROME_API_UNSUPPORTED_ENVIRONMENT',
        domain: 'chrome-api',
        context: expect.objectContaining({
          api: 'chrome',
          operation: 'ensureChrome'
        })
      }),
      { suppressNotifications: true }
    );

    if (originalChrome) {
      (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome = originalChrome;
    }
  });
});
