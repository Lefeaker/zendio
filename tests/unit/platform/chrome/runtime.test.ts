import { beforeEach, describe, expect, it, vi } from 'vitest';

let installListener: ((details: chrome.runtime.InstalledDetails) => void) | undefined;
const chromeApi = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://${path}`),
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
    openOptionsPage: vi.fn(),
    onInstalled: { addListener: vi.fn((listener: typeof installListener) => { installListener = listener ?? undefined; }), removeListener: vi.fn() },
    onStartup: { addListener: vi.fn(), removeListener: vi.fn() }
  },
  tabs: { create: vi.fn() }
}));
const lastErrorMock = vi.hoisted(() => vi.fn<[], chrome.runtime.LastError | null>(() => null));

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  normalizePromise: <T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) => new Promise<T>(executor)
}));

describe('chromeRuntimeService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); installListener = undefined;
    chromeApi.runtime.openOptionsPage = vi.fn((cb: () => void) => cb());
    chromeApi.tabs.create.mockImplementation((_props: chrome.tabs.CreateProperties, cb: () => void) => cb());
  });

  it('wraps runtime metadata, options opening, and listeners', async () => {
    const { chromeRuntimeService } = await import('../../../../src/platform/chrome/runtime');
    const getURL = chromeRuntimeService.getURL;
    const getManifest = chromeRuntimeService.getManifest;
    if (!getURL || !getManifest) {
      throw new Error('runtime metadata api missing');
    }
    expect(getURL('options/index.html')).toContain('options/index.html');
    expect(getManifest()).toEqual({ version: '1.0.0' });
    await chromeRuntimeService.openOptionsPage();
    const installed = vi.fn();
    chromeRuntimeService.onInstalled(installed);
    if (!installListener) {
      throw new Error('install listener missing');
    }
    installListener({ reason: 'update', previousVersion: '0.9.0' });
    expect(installed).toHaveBeenCalledWith({ reason: 'update', previousVersion: '0.9.0' });
  });

  it('falls back to tabs.create when openOptionsPage is unavailable', async () => {
    chromeApi.runtime.openOptionsPage = undefined as unknown as typeof chromeApi.runtime.openOptionsPage;
    const { chromeRuntimeService } = await import('../../../../src/platform/chrome/runtime');
    await chromeRuntimeService.openOptionsPage();
    expect(chromeApi.tabs.create).toHaveBeenCalled();
  });
});
