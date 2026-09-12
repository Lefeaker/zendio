import {
  MESSAGE_LISTENER_INVOCATION_ERROR_CODE,
  MessageListenerInvocationError,
  type MessageListener,
  type MessageListenerResult,
  type MessagePayload,
  type MessageSenderInfo
} from '../interfaces/messaging';

interface NativeMessageTab {
  id?: number | undefined;
  windowId?: number | undefined;
  url?: string | undefined;
}

interface NativeMessageSender {
  id?: string | undefined;
  tab?: NativeMessageTab | undefined;
  frameId?: number | undefined;
  documentId?: string | undefined;
  url?: string | undefined;
  origin?: string | undefined;
}

interface ListenerFailureMarker extends Record<string, MessagePayload> {
  __zendioTransportError: {
    code: typeof MESSAGE_LISTENER_INVOCATION_ERROR_CODE;
  };
}

export type MessageListenerInvocation =
  | { kind: 'no-response' }
  | { kind: 'sync-response'; response: MessagePayload }
  | { kind: 'async-response'; response: Promise<MessagePayload> };

const LISTENER_FAILURE_MARKER: ListenerFailureMarker = Object.freeze({
  __zendioTransportError: Object.freeze({
    code: MESSAGE_LISTENER_INVOCATION_ERROR_CODE
  })
});

function isPromiseLike(
  value: MessageListenerResult | PromiseLike<MessageListenerResult>
): value is PromiseLike<MessageListenerResult> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function normalizedAsyncResponse(value: MessageListenerResult): MessagePayload {
  return value === undefined ? null : value;
}

function hasSingleEnumerableDataProperty(value: object, expected: string): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== expected) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, expected);
  return descriptor?.enumerable === true && 'value' in descriptor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createMessageSenderInfo(
  sender: NativeMessageSender | undefined
): MessageSenderInfo {
  const result: MessageSenderInfo = {};

  if (sender?.id !== undefined) result.id = sender.id;
  if (sender?.tab?.id !== undefined) result.tabId = sender.tab.id;
  if (sender?.tab?.windowId !== undefined) result.windowId = sender.tab.windowId;
  if (sender?.frameId !== undefined) result.frameId = sender.frameId;
  if (sender?.documentId !== undefined) result.documentId = sender.documentId;

  const url = sender?.url ?? sender?.tab?.url;
  if (url !== undefined) result.url = url;
  if (sender?.origin !== undefined) result.origin = sender.origin;

  return result;
}

export function invokeMessageListener(
  listener: MessageListener,
  message: unknown,
  sender: NativeMessageSender | undefined
): MessageListenerInvocation {
  try {
    const response = listener(message, createMessageSenderInfo(sender));
    if (isPromiseLike(response)) {
      return {
        kind: 'async-response',
        response: Promise.resolve(response).then(
          normalizedAsyncResponse,
          () => LISTENER_FAILURE_MARKER
        )
      };
    }
    if (response === undefined) {
      return { kind: 'no-response' };
    }
    return { kind: 'sync-response', response };
  } catch {
    return { kind: 'sync-response', response: LISTENER_FAILURE_MARKER };
  }
}

export function isMessageListenerFailureMarker(value: unknown): boolean {
  if (!isRecord(value) || !hasSingleEnumerableDataProperty(value, '__zendioTransportError')) {
    return false;
  }
  const marker = value.__zendioTransportError;
  if (!isRecord(marker) || !hasSingleEnumerableDataProperty(marker, 'code')) {
    return false;
  }
  return marker.code === MESSAGE_LISTENER_INVOCATION_ERROR_CODE;
}

export function decodeMessageResponse<TResult>(response: unknown): TResult {
  if (isMessageListenerFailureMarker(response)) {
    throw new MessageListenerInvocationError();
  }
  return response as TResult;
}
