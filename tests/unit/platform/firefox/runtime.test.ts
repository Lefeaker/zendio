import { beforeEach, describe, expect, it, vi } from 'vitest';

let installListener: ((details: { reason?: string; previousVersion?: string }) => void) | undefined;
const firefoxApi = vi.hoisted(() => ({
  i18n: {
    getUILanguage: vi.fn(() => 'fr-FR')
  },
  runtime: {
    getURL: vi.fn((path: string) => `moz-extension://${path}`),
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn(),
    onInstalled: {
      addListener: vi.fn((listener: typeof installListener) => {
        installListener = listener ?? undefined;
      }),
      removeListener: vi.fn()
    },
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  tabs: {
    create: vi.fn()
  }
}));

vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof firefoxApi => firefoxApi
}));

describe('firefoxRuntimeService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installListener = undefined;
    firefoxApi.runtime.openOptionsPage.mockResolvedValue(undefined);
    firefoxApi.runtime.sendMessage.mockResolvedValue({ ok: true });
    firefoxApi.tabs.create.mockResolvedValue({ id: 2 });
  });

  it('wraps runtime messaging, UI language, options opening, and listeners', async () => {
    const { firefoxRuntimeService } = await import('../../../../src/platform/firefox/runtime');
    const getUILanguage = firefoxRuntimeService.getUILanguage;
    if (!getUILanguage) {
      throw new Error('runtime ui language api missing');
    }

    expect(firefoxRuntimeService.getURL('options/index.html')).toContain('options/index.html');
    expect(getUILanguage()).toBe('fr-FR');
    await expect(firefoxRuntimeService.sendMessage?.({ ping: true })).resolves.toEqual({
      ok: true
    });

    await firefoxRuntimeService.openOptionsPage();

    const installed = vi.fn();
    firefoxRuntimeService.onInstalled(installed);
    installListener?.({ reason: 'update', previousVersion: '0.9.0' });
    expect(installed).toHaveBeenCalledWith({ reason: 'update', previousVersion: '0.9.0' });
  });

  it('falls back to opening the options page in a tab when the runtime method is unavailable', async () => {
    firefoxApi.runtime.openOptionsPage =
      undefined as unknown as typeof firefoxApi.runtime.openOptionsPage;
    const { firefoxRuntimeService } = await import('../../../../src/platform/firefox/runtime');
    await firefoxRuntimeService.openOptionsPage();
    expect(firefoxApi.tabs.create).toHaveBeenCalledWith({
      url: 'moz-extension://options/index.html'
    });
  });
});
