import type {
  MessageListener,
  MessageSenderInfo,
  MessagingService,
  MessageSendOptions
} from '../interfaces/messaging';
import { ensureFirefox } from './utils';

function mapSender(sender: browser.runtime.MessageSender): MessageSenderInfo {
  return {
    ...(sender.id !== undefined && { id: sender.id }),
    ...(sender.tab?.id !== undefined && { tabId: sender.tab.id }),
    ...(sender.tab?.windowId !== undefined && { windowId: sender.tab.windowId }),
    ...(sender.frameId !== undefined && { frameId: sender.frameId }),
    ...(sender.url !== undefined && { url: sender.url })
  };
}

function isPromise<T>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

export const firefoxMessagingService: MessagingService = {
  async send<TResult = unknown>(message: unknown): Promise<TResult> {
    const firefoxApi = ensureFirefox();
    const response: unknown = await firefoxApi.runtime.sendMessage(message);
    return response as TResult;
  },

  async sendToTab<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: MessageSendOptions
  ): Promise<TResult> {
    const firefoxApi = ensureFirefox();
    const response: unknown = await firefoxApi.tabs.sendMessage(tabId, message, options);
    return response as TResult;
  },

  addListener(listener: MessageListener): () => void {
    const firefoxApi = ensureFirefox();
    const wrapped: Parameters<typeof firefoxApi.runtime.onMessage.addListener>[0] = (
      message,
      sender,
      sendResponse
    ) => {
      const result = listener(message, mapSender(sender));
      if (isPromise(result)) {
        result
          .then((value) => {
            if (value !== undefined) {
              sendResponse(value);
            }
          })
          .catch(() => {
            // swallow listener errors to avoid disconnecting runtime
          });
        return true;
      }
      if (result !== undefined) {
        sendResponse(result);
      }
      return false;
    };
    firefoxApi.runtime.onMessage.addListener(wrapped);
    return () => firefoxApi.runtime.onMessage.removeListener(wrapped);
  }
};
