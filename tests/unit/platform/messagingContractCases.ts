import { describe, expect, it, vi } from 'vitest';
import {
  type MessageListenerResult,
  type MessagePayload,
  type MessageSenderInfo,
  type MessageSendOptions,
  type MessagingService
} from '../../../src/platform/interfaces/messaging';

export interface ContractSenderFixture {
  id?: string;
  tabId?: number;
  windowId?: number;
  frameId?: number;
  url?: string;
  tabUrl?: string;
  origin?: string;
}

export type ContractDispatchResult =
  | { kind: 'declined' }
  | { kind: 'claimed'; response: Promise<MessageListenerResult> };

export type ContractSendOutcome =
  | { kind: 'resolve'; response: MessageListenerResult }
  | { kind: 'reject'; error: Error }
  | { kind: 'throw'; error: Error };

export interface ContractRuntimeInvocation {
  message: MessagePayload;
}

export interface ContractTabInvocation extends ContractRuntimeInvocation {
  tabId: number;
  options?: MessageSendOptions;
}

export interface MessagingContractHarness {
  service: MessagingService;
  listenerError: {
    name: string;
    code: string;
    message: string;
  };
  isListenerInvocationError(error: Error): boolean;
  dispatch(message?: MessagePayload, sender?: ContractSenderFixture): ContractDispatchResult;
  listenerCount(): number;
  setRuntimeOutcome(outcome: ContractSendOutcome): void;
  setTabOutcome(outcome: ContractSendOutcome): void;
  lastRuntimeInvocation(): ContractRuntimeInvocation | undefined;
  lastTabInvocation(): ContractTabInvocation | undefined;
}

export type MessagingContractHarnessFactory = () => Promise<MessagingContractHarness>;

const LISTENER_FAILURE_MARKER: MessagePayload = {
  __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' }
};

function asPlainThenable<T>(promise: Promise<T>): PromiseLike<T> {
  return {
    then: (onfulfilled, onrejected) => promise.then(onfulfilled, onrejected)
  };
}

function requireClaimed(result: ContractDispatchResult): Promise<MessageListenerResult> {
  if (result.kind !== 'claimed') {
    throw new Error('Expected the message listener to claim the response');
  }
  return result.response;
}

async function requireError(promise: Promise<MessagePayload>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('Expected an Error rejection');
  }
  throw new Error('Expected the message send to reject');
}

export function runMessagingContractCases(
  adapterName: string,
  createHarness: MessagingContractHarnessFactory
): void {
  describe(`${adapterName} shared messaging contract`, () => {
    it('returns synchronous and asynchronous payloads', async () => {
      const syncHarness = await createHarness();
      syncHarness.service.addListener(() => ({ mode: 'sync' }));
      await expect(requireClaimed(syncHarness.dispatch())).resolves.toEqual({ mode: 'sync' });

      const asyncHarness = await createHarness();
      asyncHarness.service.addListener(() => Promise.resolve({ mode: 'async' }));
      await expect(requireClaimed(asyncHarness.dispatch())).resolves.toEqual({ mode: 'async' });
    });

    it('normalizes fulfilled and rejected plain thenables as asynchronous responses', async () => {
      const fulfilledHarness = await createHarness();
      fulfilledHarness.service.addListener(() =>
        asPlainThenable(Promise.resolve<MessageListenerResult>({ mode: 'thenable' }))
      );
      await expect(requireClaimed(fulfilledHarness.dispatch())).resolves.toEqual({
        mode: 'thenable'
      });

      const rejectedHarness = await createHarness();
      rejectedHarness.service.addListener(() =>
        asPlainThenable(Promise.reject<MessageListenerResult>('private thenable detail'))
      );
      await expect(requireClaimed(rejectedHarness.dispatch())).resolves.toEqual(
        LISTENER_FAILURE_MARKER
      );
    });

    it('lets synchronous undefined decline so a later listener can respond', async () => {
      const harness = await createHarness();
      const firstListener = vi.fn(() => undefined);
      const secondListener = vi.fn(() => ({ owner: 'second' }));
      harness.service.addListener(firstListener);
      harness.service.addListener(secondListener);

      await expect(requireClaimed(harness.dispatch())).resolves.toEqual({ owner: 'second' });
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it('normalizes asynchronous undefined to a claimed JSON-safe null response', async () => {
      const harness = await createHarness();
      const firstListener = vi.fn(() => Promise.resolve(undefined));
      const secondListener = vi.fn(() => ({ owner: 'second' }));
      harness.service.addListener(firstListener);
      harness.service.addListener(secondListener);

      await expect(requireClaimed(harness.dispatch())).resolves.toBeNull();
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it('maps synchronous Error and non-Error throws to the exact redacted marker', async () => {
      const errorHarness = await createHarness();
      errorHarness.service.addListener(() => {
        throw new Error('private sync stack detail');
      });
      const errorMarker = await requireClaimed(errorHarness.dispatch());

      const valueHarness = await createHarness();
      valueHarness.service.addListener(() => {
        throw 'private sync value';
      });
      const valueMarker = await requireClaimed(valueHarness.dispatch());

      expect(errorMarker).toEqual(LISTENER_FAILURE_MARKER);
      expect(valueMarker).toEqual(LISTENER_FAILURE_MARKER);
      expect(JSON.stringify(errorMarker)).toBe(
        '{"__zendioTransportError":{"code":"MESSAGE_LISTENER_FAILED"}}'
      );
      expect(JSON.stringify(errorMarker)).not.toMatch(/private|stack|cause|raw/i);
    });

    it('maps asynchronous Error and non-Error rejections without an unhandled rejection', async () => {
      const unhandledRejection = vi.fn();
      process.on('unhandledRejection', unhandledRejection);
      try {
        const errorHarness = await createHarness();
        errorHarness.service.addListener(() => Promise.reject(new Error('private async detail')));
        await expect(requireClaimed(errorHarness.dispatch())).resolves.toEqual(
          LISTENER_FAILURE_MARKER
        );

        const valueHarness = await createHarness();
        valueHarness.service.addListener(() => Promise.reject('private async value'));
        await expect(requireClaimed(valueHarness.dispatch())).resolves.toEqual(
          LISTENER_FAILURE_MARKER
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(unhandledRejection).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandledRejection);
      }
    });

    it('maps complete sender metadata with direct URL precedence and zero-valued IDs', async () => {
      const harness = await createHarness();
      let observedSender: MessageSenderInfo = {};
      harness.service.addListener((_message, sender) => {
        observedSender = sender;
        return null;
      });

      await requireClaimed(
        harness.dispatch(null, {
          id: '',
          tabId: 0,
          windowId: 0,
          frameId: 0,
          url: 'https://direct.example/path',
          tabUrl: 'https://tab.example/path',
          origin: ''
        })
      );

      expect(observedSender).toEqual({
        id: '',
        tabId: 0,
        windowId: 0,
        frameId: 0,
        url: 'https://direct.example/path',
        origin: ''
      });
    });

    it('uses tab URL only as a fallback and never synthesizes origin', async () => {
      const harness = await createHarness();
      let observedSender: MessageSenderInfo = {};
      harness.service.addListener((_message, sender) => {
        observedSender = sender;
        return null;
      });

      await requireClaimed(
        harness.dispatch(null, {
          tabUrl: 'https://tab.example/fallback'
        })
      );

      expect(observedSender).toEqual({ url: 'https://tab.example/fallback' });
      expect(observedSender).not.toHaveProperty('origin');
    });

    it('omits all sender metadata when the native sender does not provide it', async () => {
      const harness = await createHarness();
      let observedSender: MessageSenderInfo = { id: 'not-reset' };
      harness.service.addListener((_message, sender) => {
        observedSender = sender;
        return null;
      });

      await requireClaimed(harness.dispatch(null, {}));
      expect(observedSender).toEqual({});
    });

    it('sends runtime and tab messages, preserving the positional tab and frame ID', async () => {
      const harness = await createHarness();
      harness.setRuntimeOutcome({ kind: 'resolve', response: { runtime: 'ok' } });
      harness.setTabOutcome({ kind: 'resolve', response: { tab: 'ok' } });

      await expect(harness.service.send<MessagePayload>({ command: 'runtime' })).resolves.toEqual({
        runtime: 'ok'
      });
      await expect(
        harness.service.sendToTab<MessagePayload>(0, { command: 'tab' }, { frameId: 0 })
      ).resolves.toEqual({ tab: 'ok' });

      expect(harness.lastRuntimeInvocation()).toEqual({ message: { command: 'runtime' } });
      expect(harness.lastTabInvocation()).toEqual({
        tabId: 0,
        message: { command: 'tab' },
        options: { frameId: 0 }
      });
    });

    it('preserves runtime and tab native rejection identity', async () => {
      const harness = await createHarness();
      const runtimeError = new Error('native runtime failure');
      const tabError = new Error('native tab failure');
      harness.setRuntimeOutcome({ kind: 'reject', error: runtimeError });
      harness.setTabOutcome({ kind: 'reject', error: tabError });

      await expect(harness.service.send<MessagePayload>(null)).rejects.toBe(runtimeError);
      await expect(harness.service.sendToTab<MessagePayload>(7, null)).rejects.toBe(tabError);
    });

    it('preserves synchronous native throw identity', async () => {
      const harness = await createHarness();
      const runtimeError = new Error('native runtime throw');
      const tabError = new Error('native tab throw');
      harness.setRuntimeOutcome({ kind: 'throw', error: runtimeError });
      harness.setTabOutcome({ kind: 'throw', error: tabError });

      await expect(harness.service.send<MessagePayload>(null)).rejects.toBe(runtimeError);
      await expect(harness.service.sendToTab<MessagePayload>(7, null)).rejects.toBe(tabError);
    });

    it('decodes the exact reserved marker into the stable typed runtime and tab rejection', async () => {
      const harness = await createHarness();
      harness.setRuntimeOutcome({ kind: 'resolve', response: LISTENER_FAILURE_MARKER });
      harness.setTabOutcome({ kind: 'resolve', response: LISTENER_FAILURE_MARKER });

      const runtimeError = await requireError(harness.service.send<MessagePayload>(null));
      const tabError = await requireError(harness.service.sendToTab<MessagePayload>(2, null));

      for (const error of [runtimeError, tabError]) {
        expect(harness.isListenerInvocationError(error)).toBe(true);
        if (!harness.isListenerInvocationError(error)) {
          throw new Error('Expected a MessageListenerInvocationError');
        }
        expect(error).toMatchObject(harness.listenerError);
        expect(error).not.toHaveProperty('cause');
      }
    });

    it('keeps ordinary domain error payloads resolved', async () => {
      const harness = await createHarness();
      const domainResult: MessagePayload = { error: 'domain failure' };
      harness.setRuntimeOutcome({ kind: 'resolve', response: domainResult });
      harness.setTabOutcome({ kind: 'resolve', response: domainResult });

      await expect(harness.service.send<MessagePayload>(null)).resolves.toEqual(domainResult);
      await expect(harness.service.sendToTab<MessagePayload>(1, null)).resolves.toEqual(
        domainResult
      );
    });

    it('resolves strict-marker near misses as ordinary domain payloads', async () => {
      const hiddenOuterExtra: MessagePayload = {
        __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' }
      };
      Object.defineProperty(hiddenOuterExtra, 'hidden', { value: true });
      const symbolInnerExtra: MessagePayload = {
        __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' }
      };
      Object.defineProperty(symbolInnerExtra.__zendioTransportError, Symbol('extra'), {
        value: true,
        enumerable: true
      });
      const nearMarkers: MessagePayload[] = [
        { __zendioTransportError: { code: 'WRONG_CODE' } },
        {
          __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' },
          extra: true
        },
        {
          __zendioTransportError: {
            code: 'MESSAGE_LISTENER_FAILED',
            extra: true
          }
        },
        { __zendioTransportError: null },
        hiddenOuterExtra,
        symbolInnerExtra
      ];

      for (const nearMarker of nearMarkers) {
        const harness = await createHarness();
        harness.setRuntimeOutcome({ kind: 'resolve', response: nearMarker });
        harness.setTabOutcome({ kind: 'resolve', response: nearMarker });
        await expect(harness.service.send<MessagePayload>(null)).resolves.toBe(nearMarker);
        await expect(harness.service.sendToTab<MessagePayload>(1, null)).resolves.toBe(nearMarker);
      }
    });

    it('makes unsubscribe idempotent and prevents future dispatch', async () => {
      const harness = await createHarness();
      const listener = vi.fn(() => ({ ok: true }));
      const unsubscribe = harness.service.addListener(listener);

      expect(harness.listenerCount()).toBe(1);
      unsubscribe();
      unsubscribe();

      expect(harness.listenerCount()).toBe(0);
      expect(harness.dispatch()).toEqual({ kind: 'declined' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('lets an already-started asynchronous response settle after unsubscribe', async () => {
      const harness = await createHarness();
      let settle: (value: MessageListenerResult) => void = () => undefined;
      const pending = new Promise<MessageListenerResult>((resolve) => {
        settle = resolve;
      });
      const unsubscribe = harness.service.addListener(() => pending);
      const dispatched = harness.dispatch();

      unsubscribe();
      settle({ late: 'response' });

      await expect(requireClaimed(dispatched)).resolves.toEqual({ late: 'response' });
      expect(harness.listenerCount()).toBe(0);
      expect(harness.dispatch()).toEqual({ kind: 'declined' });
    });
  });
}
