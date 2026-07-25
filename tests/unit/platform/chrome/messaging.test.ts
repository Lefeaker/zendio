import { describe, expect, it, vi } from 'vitest';
import type {
  MessageListenerResult,
  MessagePayload,
  MessageSendOptions
} from '../../../../src/platform/interfaces/messaging';
import {
  runMessagingContractCases,
  type ContractDispatchResult,
  type ContractRuntimeInvocation,
  type ContractSendOutcome,
  type ContractSenderFixture,
  type ContractTabInvocation,
  type MessagingContractHarness
} from '../messagingContractCases';

interface ChromeTabFixture {
  id?: number;
  windowId?: number;
  url?: string;
}

interface ChromeSenderFixture {
  id?: string;
  tab?: ChromeTabFixture;
  frameId?: number;
  url?: string;
  origin?: string;
}

type ChromeSendCallback = (response?: MessageListenerResult) => void;
type ChromeNativeListener = (
  message: MessagePayload,
  sender: ChromeSenderFixture,
  sendResponse: ChromeSendCallback
) => boolean;

const chromeApi = vi.hoisted(() => ({
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  tabs: {
    sendMessage: vi.fn()
  }
}));
const ensureChromeMock = vi.hoisted(() => vi.fn<() => typeof chromeApi>());
const lastErrorMock = vi.hoisted(() => vi.fn<() => Error | null>(() => null));
const suppressLastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => ensureChromeMock(),
  getChromeLastError: (): Error | null => lastErrorMock(),
  suppressLastError: suppressLastErrorMock,
  normalizePromise: <T>(
    executor: (resolve: (value: T) => void, reject: (reason?: Error) => void) => void
  ) =>
    new Promise<T>((resolve, reject) => {
      executor(resolve, (reason) => reject(reason));
    })
}));

const LISTENER_FAILURE_MARKER: MessagePayload = {
  __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' }
};

const runtimeListeners: ChromeNativeListener[] = [];
let runtimeOutcome: ContractSendOutcome = { kind: 'resolve', response: null };
let tabOutcome: ContractSendOutcome = { kind: 'resolve', response: null };
let lastRuntimeInvocation: ContractRuntimeInvocation | undefined;
let lastTabInvocation: ContractTabInvocation | undefined;

function completeChromeOutcome(outcome: ContractSendOutcome, callback: ChromeSendCallback): void {
  if (outcome.kind === 'throw') {
    throw outcome.error;
  }
  if (outcome.kind === 'reject') {
    lastErrorMock.mockReturnValueOnce(outcome.error);
    callback();
    return;
  }
  callback(outcome.response);
}

function resetChromeState(): void {
  vi.clearAllMocks();
  runtimeListeners.splice(0, runtimeListeners.length);
  runtimeOutcome = { kind: 'resolve', response: null };
  tabOutcome = { kind: 'resolve', response: null };
  lastRuntimeInvocation = undefined;
  lastTabInvocation = undefined;
  ensureChromeMock.mockReturnValue(chromeApi);
  lastErrorMock.mockReturnValue(null);

  chromeApi.runtime.sendMessage.mockImplementation(
    (message: MessagePayload, callback: ChromeSendCallback) => {
      lastRuntimeInvocation = { message };
      completeChromeOutcome(runtimeOutcome, callback);
    }
  );
  chromeApi.tabs.sendMessage.mockImplementation(
    (
      tabId: number,
      message: MessagePayload,
      options: MessageSendOptions,
      callback: ChromeSendCallback
    ) => {
      lastTabInvocation = { tabId, message, options };
      completeChromeOutcome(tabOutcome, callback);
    }
  );
  chromeApi.runtime.onMessage.addListener.mockImplementation((listener: ChromeNativeListener) => {
    runtimeListeners.push(listener);
  });
  chromeApi.runtime.onMessage.removeListener.mockImplementation(
    (listener: ChromeNativeListener) => {
      const index = runtimeListeners.indexOf(listener);
      if (index >= 0) {
        runtimeListeners.splice(index, 1);
      }
    }
  );
}

function toChromeSender(sender: ContractSenderFixture): ChromeSenderFixture {
  const nativeSender: ChromeSenderFixture = {};
  const tab: ChromeTabFixture = {};

  if (sender.id !== undefined) nativeSender.id = sender.id;
  if (sender.tabId !== undefined) tab.id = sender.tabId;
  if (sender.windowId !== undefined) tab.windowId = sender.windowId;
  if (sender.tabUrl !== undefined) tab.url = sender.tabUrl;
  if (Object.keys(tab).length > 0) nativeSender.tab = tab;
  if (sender.frameId !== undefined) nativeSender.frameId = sender.frameId;
  if (sender.url !== undefined) nativeSender.url = sender.url;
  if (sender.origin !== undefined) nativeSender.origin = sender.origin;

  return nativeSender;
}

function dispatchChrome(
  message: MessagePayload = null,
  sender: ContractSenderFixture = {}
): ContractDispatchResult {
  let claimedResponse: Promise<MessageListenerResult> | undefined;

  for (const listener of [...runtimeListeners]) {
    let callbackCalled = false;
    let settleResponse: (value: MessageListenerResult) => void = () => undefined;
    const response = new Promise<MessageListenerResult>((resolve) => {
      settleResponse = resolve;
    });
    const keepAlive = listener(message, toChromeSender(sender), (value) => {
      callbackCalled = true;
      settleResponse(value);
    });

    if (claimedResponse === undefined && (callbackCalled || keepAlive)) {
      claimedResponse = response;
    }
  }

  return claimedResponse === undefined
    ? { kind: 'declined' }
    : { kind: 'claimed', response: claimedResponse };
}

async function createChromeHarness(): Promise<MessagingContractHarness> {
  resetChromeState();
  vi.resetModules();
  const messagingModule = await import('../../../../src/platform/chrome/messaging');
  const interfaceModule = await import('../../../../src/platform/interfaces/messaging');

  return {
    service: messagingModule.chromeMessagingService,
    listenerError: {
      name: 'MessageListenerInvocationError',
      code: interfaceModule.MESSAGE_LISTENER_INVOCATION_ERROR_CODE,
      message: interfaceModule.MESSAGE_LISTENER_INVOCATION_ERROR_MESSAGE
    },
    isListenerInvocationError: (error) =>
      error instanceof interfaceModule.MessageListenerInvocationError,
    dispatch: dispatchChrome,
    listenerCount: () => runtimeListeners.length,
    setRuntimeOutcome: (outcome) => {
      runtimeOutcome = outcome;
    },
    setTabOutcome: (outcome) => {
      tabOutcome = outcome;
    },
    lastRuntimeInvocation: () => lastRuntimeInvocation,
    lastTabInvocation: () => lastTabInvocation
  };
}

function requireChromeListener(): ChromeNativeListener {
  const listener = runtimeListeners[0];
  if (listener === undefined) {
    throw new Error('Expected a registered Chrome message listener');
  }
  return listener;
}

describe('chromeMessagingService', () => {
  runMessagingContractCases('Chrome', createChromeHarness);

  describe('native adapter mechanics', () => {
    it('returns false without a callback for synchronous undefined', async () => {
      const { service } = await createChromeHarness();
      service.addListener(() => undefined);
      const sendResponse = vi.fn<ChromeSendCallback>();

      expect(requireChromeListener()(null, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(suppressLastErrorMock).toHaveBeenCalledTimes(1);
    });

    it('returns false and responds immediately for a synchronous payload or throw', async () => {
      const { service } = await createChromeHarness();
      service.addListener(() => ({ value: 'sync' }));
      const payloadResponse = vi.fn<ChromeSendCallback>();
      expect(requireChromeListener()(null, {}, payloadResponse)).toBe(false);
      expect(payloadResponse).toHaveBeenCalledWith({ value: 'sync' });

      resetChromeState();
      service.addListener(() => {
        throw new Error('secret sync detail');
      });
      const errorResponse = vi.fn<ChromeSendCallback>();
      expect(requireChromeListener()(null, {}, errorResponse)).toBe(false);
      expect(errorResponse).toHaveBeenCalledWith(LISTENER_FAILURE_MARKER);
    });

    it('returns true and responds later for asynchronous payload, undefined, or rejection', async () => {
      const { service } = await createChromeHarness();
      service.addListener(() => Promise.resolve({ value: 'async' }));
      const payloadResponse = vi.fn<ChromeSendCallback>();
      expect(requireChromeListener()(null, {}, payloadResponse)).toBe(true);
      await vi.waitFor(() => expect(payloadResponse).toHaveBeenCalledWith({ value: 'async' }));

      resetChromeState();
      service.addListener(() => Promise.resolve(undefined));
      const undefinedResponse = vi.fn<ChromeSendCallback>();
      expect(requireChromeListener()(null, {}, undefinedResponse)).toBe(true);
      await vi.waitFor(() => expect(undefinedResponse).toHaveBeenCalledWith(null));

      resetChromeState();
      service.addListener(() => Promise.reject(new Error('secret async detail')));
      const errorResponse = vi.fn<ChromeSendCallback>();
      expect(requireChromeListener()(null, {}, errorResponse)).toBe(true);
      await vi.waitFor(() => expect(errorResponse).toHaveBeenCalledWith(LISTENER_FAILURE_MARKER));
    });

    it('gives native lastError precedence over a marker response', async () => {
      const { service } = await createChromeHarness();
      const nativeError = new Error('native callback failure');
      chromeApi.runtime.sendMessage.mockImplementationOnce(
        (_message: MessagePayload, callback: ChromeSendCallback) => {
          lastErrorMock.mockReturnValueOnce(nativeError);
          callback(LISTENER_FAILURE_MARKER);
        }
      );

      await expect(service.send<MessagePayload>(null)).rejects.toBe(nativeError);
    });

    it('returns rejected Promises when the Chrome API is unavailable', async () => {
      const { service } = await createChromeHarness();
      const unavailableError = new Error('Chrome API unavailable');
      ensureChromeMock.mockImplementation(() => {
        throw unavailableError;
      });

      const runtimeResult = service.send<MessagePayload>(null);
      const tabResult = service.sendToTab<MessagePayload>(1, null);
      expect(runtimeResult).toBeInstanceOf(Promise);
      expect(tabResult).toBeInstanceOf(Promise);
      await expect(runtimeResult).rejects.toBe(unavailableError);
      await expect(tabResult).rejects.toBe(unavailableError);
    });

    it('removes the exact registered wrapper only once', async () => {
      const { service } = await createChromeHarness();
      const unsubscribe = service.addListener(() => null);
      const registered = requireChromeListener();

      unsubscribe();
      unsubscribe();

      expect(chromeApi.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(chromeApi.runtime.onMessage.removeListener).toHaveBeenCalledWith(registered);
    });
  });
});
