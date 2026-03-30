import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessagePayload } from '../../../../src/platform/interfaces/messaging';

let runtimeMessageListener: ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean) | undefined;
const chromeApi = vi.hoisted(() => ({
  runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn((listener: typeof runtimeMessageListener) => { runtimeMessageListener = listener ?? undefined; }), removeListener: vi.fn() } },
  tabs: { sendMessage: vi.fn() }
}));
const lastErrorMock = vi.hoisted(() => vi.fn<[], chrome.runtime.LastError | null>(() => null));
const suppressLastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  suppressLastError: suppressLastErrorMock,
  normalizePromise: <T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) => new Promise<T>(executor)
}));

describe('chromeMessagingService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); runtimeMessageListener = undefined;
    chromeApi.runtime.sendMessage.mockImplementation((_msg: unknown, cb: (response?: unknown) => void) => cb({ pong: true }));
    chromeApi.tabs.sendMessage.mockImplementation((_id: number, _msg: unknown, _opt: { frameId?: number }, cb: (response?: unknown) => void) => cb({ tab: true }));
  });

  it('sends runtime and tab messages and supports sync listeners', async () => {
    const { chromeMessagingService } = await import('../../../../src/platform/chrome/messaging');
    await expect(chromeMessagingService.send({ ping: true })).resolves.toEqual({ pong: true });
    await expect(chromeMessagingService.sendToTab(1, { ping: true })).resolves.toEqual({ tab: true });

    const off = chromeMessagingService.addListener((message, sender) => {
      const normalizedSender: Record<string, MessagePayload> = {};
      if (sender.id !== undefined) {
        normalizedSender.id = sender.id;
      }
      if (sender.tabId !== undefined) {
        normalizedSender.tabId = sender.tabId;
      }
      if (sender.frameId !== undefined) {
        normalizedSender.frameId = sender.frameId;
      }
      if (sender.url !== undefined) {
        normalizedSender.url = sender.url;
      }

      return {
        message: normalizeMessagePayload(message),
        sender: normalizedSender
      };
    });
    const sendResponse = vi.fn();
    expect(runtimeMessageListener?.({ ping: true }, { id: 'ext', tab: { id: 1, url: 'https://example.com' } as chrome.tabs.Tab, frameId: 2 }, sendResponse)).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ message: { ping: true }, sender: { id: 'ext', tabId: 1, frameId: 2, url: 'https://example.com' } });
    off();
  });
});

function normalizeMessagePayload(message: unknown): MessagePayload {
  if (typeof message === 'object' && message !== null && typeof (message as { ping?: unknown }).ping === 'boolean') {
    return { ping: (message as { ping: boolean }).ping };
  }

  return null;
}
