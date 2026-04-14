import { beforeEach, describe, expect, it, vi } from 'vitest';

let clickListener: ((tab: browser.tabs.Tab) => void) | undefined;
const firefoxApi = vi.hoisted(() => ({
  browserAction: {
    onClicked: { addListener: vi.fn((listener: typeof clickListener) => { clickListener = listener ?? undefined; }), removeListener: vi.fn() },
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve())
  },
  action: undefined
}));
vi.mock('../../../../src/platform/firefox/utils', () => ({ ensureFirefox: (): typeof firefoxApi => firefoxApi }));

describe('firefoxActionService', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); clickListener = undefined; });

  it('uses browserAction handlers and badge apis', async () => {
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const listener = vi.fn();
    const off = firefoxActionService.onClicked(listener);
    if (!clickListener) {
      throw new Error('click listener missing');
    }
    clickListener({ id: 1 } as browser.tabs.Tab);
    expect(listener).toHaveBeenCalled();
    off();
    const setBadgeText = firefoxActionService.setBadgeText;
    const setBadgeBackgroundColor = firefoxActionService.setBadgeBackgroundColor;
    if (!setBadgeText || !setBadgeBackgroundColor) {
      throw new Error('badge apis missing');
    }
    await setBadgeText({ text: '2' });
    await setBadgeBackgroundColor({ color: '#fff' });
    expect(firefoxApi.browserAction.setBadgeText).toHaveBeenCalled();
  });

  it('returns a noop disposer when no click api is available', async () => {
    firefoxApi.browserAction = undefined as unknown as typeof firefoxApi.browserAction;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const off = firefoxActionService.onClicked(vi.fn());
    off();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

});
