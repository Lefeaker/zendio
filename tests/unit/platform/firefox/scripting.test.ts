import { beforeEach, describe, expect, it, vi } from 'vitest';

type FirefoxScriptingApiMock = {
  scripting: {
    executeScript?: ReturnType<typeof vi.fn>;
  };
  tabs: {
    executeScript: ReturnType<typeof vi.fn>;
  };
};

const firefoxApi = vi.hoisted<FirefoxScriptingApiMock>(() => ({
  scripting: {
    executeScript: vi.fn()
  },
  tabs: {
    executeScript: vi.fn()
  }
}));

vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof firefoxApi => firefoxApi
}));

function stringMatcher(value: string): object {
  return expect.stringContaining(value) as object;
}

describe('firefoxScriptingService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    firefoxApi.scripting.executeScript = vi
      .fn()
      .mockResolvedValue([{ documentId: 'document-0', frameId: 0, result: true }]);
    firefoxApi.tabs.executeScript = vi.fn().mockResolvedValue([{ ready: true }]);
  });

  it('wraps modern browser.scripting.executeScript', async () => {
    const { firefoxScriptingService } = await import('../../../../src/platform/firefox/scripting');
    const options: chrome.scripting.ScriptInjection<[], object> = {
      target: { tabId: 7 },
      files: ['content/index.js']
    };

    await expect(firefoxScriptingService.executeScript(options)).resolves.toEqual([
      { documentId: 'document-0', frameId: 0, result: true }
    ]);
    expect(firefoxApi.scripting.executeScript).toHaveBeenCalledWith(options);
  });

  it('returns inline fallback results from tabs.executeScript', async () => {
    firefoxApi.scripting.executeScript = undefined;
    const { firefoxScriptingService } = await import('../../../../src/platform/firefox/scripting');

    await expect(
      firefoxScriptingService.executeScript({
        target: { tabId: 9, frameIds: [4] },
        func: () => ({ ready: true })
      })
    ).resolves.toEqual([
      {
        documentId: 'firefox-tabs-execute-script-4-0',
        frameId: 4,
        result: { ready: true }
      }
    ]);

    expect(firefoxApi.tabs.executeScript).toHaveBeenCalledWith(9, {
      code: stringMatcher('ready'),
      frameId: 4
    });
  });
});
