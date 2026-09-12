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

interface FirefoxTabFixture {
  id?: number;
  windowId?: number;
  url?: string;
}

interface FirefoxSenderFixture {
  id?: string;
  tab?: FirefoxTabFixture;
  frameId?: number;
  url?: string;
  origin?: string;
}

type FirefoxSendResponse = (response?: MessageListenerResult) => void;
type FirefoxNativeListenerResult = Promise<MessageListenerResult> | boolean | undefined;
type FirefoxNativeListener = (
  message: MessagePayload,
  sender: FirefoxSenderFixture,
  sendResponse: FirefoxSendResponse
) => FirefoxNativeListenerResult;

const browserApi = vi.hoisted(() => ({
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

vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof browserApi => browserApi
}));

const LISTENER_FAILURE_MARKER: MessagePayload = {
  __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' }
};

const runtimeListeners: FirefoxNativeListener[] = [];
let runtimeOutcome: ContractSendOutcome = { kind: 'resolve', response: null };
let tabOutcome: ContractSendOutcome = { kind: 'resolve', response: null };
let lastRuntimeInvocation: ContractRuntimeInvocation | undefined;
let lastTabInvocation: ContractTabInvocation | undefined;

function completeFirefoxOutcome(outcome: ContractSendOutcome): Promise<MessageListenerResult> {
  if (outcome.kind === 'throw') {
    throw outcome.error;
  }
  if (outcome.kind === 'reject') {
    return Promise.reject(outcome.error);
  }
  return Promise.resolve(outcome.response);
}

function resetFirefoxState(): void {
  vi.clearAllMocks();
  runtimeListeners.splice(0, runtimeListeners.length);
  runtimeOutcome = { kind: 'resolve', response: null };
  tabOutcome = { kind: 'resolve', response: null };
  lastRuntimeInvocation = undefined;
  lastTabInvocation = undefined;

  browserApi.runtime.sendMessage.mockImplementation((message: MessagePayload) => {
    lastRuntimeInvocation = { message };
    return completeFirefoxOutcome(runtimeOutcome);
  });
  browserApi.tabs.sendMessage.mockImplementation(
    (tabId: number, message: MessagePayload, options?: MessageSendOptions) => {
      const invocation: ContractTabInvocation = { tabId, message };
      if (options !== undefined) {
        invocation.options = options;
      }
      lastTabInvocation = invocation;
      return completeFirefoxOutcome(tabOutcome);
    }
  );
  browserApi.runtime.onMessage.addListener.mockImplementation((listener: FirefoxNativeListener) => {
    runtimeListeners.push(listener);
  });
  browserApi.runtime.onMessage.removeListener.mockImplementation(
    (listener: FirefoxNativeListener) => {
      const index = runtimeListeners.indexOf(listener);
      if (index >= 0) {
        runtimeListeners.splice(index, 1);
      }
    }
  );
}

function toFirefoxSender(sender: ContractSenderFixture): FirefoxSenderFixture {
  const nativeSender: FirefoxSenderFixture = {};
  const tab: FirefoxTabFixture = {};

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

function dispatchFirefox(
  message: MessagePayload = null,
  sender: ContractSenderFixture = {}
): ContractDispatchResult {
  let claimedResponse: Promise<MessageListenerResult> | undefined;

  for (const listener of [...runtimeListeners]) {
    let callbackCalled = false;
    let settleCallback: (value: MessageListenerResult) => void = () => undefined;
    const callbackResponse = new Promise<MessageListenerResult>((resolve) => {
      settleCallback = resolve;
    });
    const nativeResult = listener(message, toFirefoxSender(sender), (value) => {
      callbackCalled = true;
      settleCallback(value);
    });

    if (claimedResponse === undefined) {
      if (nativeResult instanceof Promise) {
        claimedResponse = nativeResult;
      } else if (nativeResult === true || callbackCalled) {
        claimedResponse = callbackResponse;
      }
    }
  }

  return claimedResponse === undefined
    ? { kind: 'declined' }
    : { kind: 'claimed', response: claimedResponse };
}

async function createFirefoxHarness(): Promise<MessagingContractHarness> {
  resetFirefoxState();
  vi.resetModules();
  const messagingModule = await import('../../../../src/platform/firefox/messaging');
  const interfaceModule = await import('../../../../src/platform/interfaces/messaging');

  return {
    service: messagingModule.firefoxMessagingService,
    listenerError: {
      name: 'MessageListenerInvocationError',
      code: interfaceModule.MESSAGE_LISTENER_INVOCATION_ERROR_CODE,
      message: interfaceModule.MESSAGE_LISTENER_INVOCATION_ERROR_MESSAGE
    },
    isListenerInvocationError: (error) =>
      error instanceof interfaceModule.MessageListenerInvocationError,
    dispatch: dispatchFirefox,
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

function requireFirefoxListener(): FirefoxNativeListener {
  const listener = runtimeListeners[0];
  if (listener === undefined) {
    throw new Error('Expected a registered Firefox message listener');
  }
  return listener;
}

describe('firefoxMessagingService', () => {
  runMessagingContractCases('Firefox', createFirefoxHarness);

  describe('native adapter mechanics', () => {
    it('应该使用 Firefox messaging API', async () => {
      const { service } = await createFirefoxHarness();
      const testMessage: MessagePayload = { action: 'test' };
      await service.send(testMessage);

      expect(browserApi.runtime.sendMessage).toHaveBeenCalledWith(testMessage);
    });

    it('returns literal undefined without using the callback for synchronous undefined', async () => {
      const { service } = await createFirefoxHarness();
      service.addListener(() => undefined);
      const sendResponse = vi.fn<FirefoxSendResponse>();

      expect(requireFirefoxListener()(null, {}, sendResponse)).toBeUndefined();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('returns native Promises without callbacks for synchronous payload or throw', async () => {
      const { service } = await createFirefoxHarness();
      service.addListener(() => ({ value: 'sync' }));
      const payloadResponse = vi.fn<FirefoxSendResponse>();
      const payloadResult = requireFirefoxListener()(null, {}, payloadResponse);
      expect(payloadResult).toBeInstanceOf(Promise);
      await expect(payloadResult).resolves.toEqual({ value: 'sync' });
      expect(payloadResponse).not.toHaveBeenCalled();

      resetFirefoxState();
      service.addListener(() => {
        throw new Error('secret sync detail');
      });
      const errorResponse = vi.fn<FirefoxSendResponse>();
      const errorResult = requireFirefoxListener()(null, {}, errorResponse);
      expect(errorResult).toBeInstanceOf(Promise);
      await expect(errorResult).resolves.toEqual(LISTENER_FAILURE_MARKER);
      expect(errorResponse).not.toHaveBeenCalled();
    });

    it('returns normalized Promises without callbacks for asynchronous payload, undefined, or rejection', async () => {
      const { service } = await createFirefoxHarness();
      service.addListener(() => Promise.resolve({ value: 'async' }));
      const payloadResponse = vi.fn<FirefoxSendResponse>();
      const payloadResult = requireFirefoxListener()(null, {}, payloadResponse);
      expect(payloadResult).toBeInstanceOf(Promise);
      expect(payloadResult).not.toBe(true);
      await expect(payloadResult).resolves.toEqual({ value: 'async' });
      expect(payloadResponse).not.toHaveBeenCalled();

      resetFirefoxState();
      service.addListener(() => Promise.resolve(undefined));
      const undefinedResponse = vi.fn<FirefoxSendResponse>();
      const undefinedResult = requireFirefoxListener()(null, {}, undefinedResponse);
      expect(undefinedResult).not.toBe(true);
      await expect(undefinedResult).resolves.toBeNull();
      expect(undefinedResponse).not.toHaveBeenCalled();

      resetFirefoxState();
      service.addListener(() => Promise.reject(new Error('secret async detail')));
      const errorResponse = vi.fn<FirefoxSendResponse>();
      const errorResult = requireFirefoxListener()(null, {}, errorResponse);
      expect(errorResult).not.toBe(true);
      await expect(errorResult).resolves.toEqual(LISTENER_FAILURE_MARKER);
      expect(errorResponse).not.toHaveBeenCalled();
    });

    it('removes the exact registered wrapper only once', async () => {
      const { service } = await createFirefoxHarness();
      const unsubscribe = service.addListener(() => null);
      const registered = requireFirefoxListener();

      unsubscribe();
      unsubscribe();

      expect(browserApi.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(browserApi.runtime.onMessage.removeListener).toHaveBeenCalledWith(registered);
    });
  });
});
