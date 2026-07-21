import type {
  MessageListener,
  MessagingService,
  MessageSendOptions
} from '../interfaces/messaging';
import { decodeMessageResponse, invokeMessageListener } from '../shared/messageListenerInvocation';
import { ensureFirefox } from './utils';

export const firefoxMessagingService: MessagingService = {
  async send<TResult = unknown>(message: unknown): Promise<TResult> {
    const firefoxApi = ensureFirefox();
    const response: unknown = await firefoxApi.runtime.sendMessage(message);
    return decodeMessageResponse<TResult>(response);
  },

  async sendToTab<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: MessageSendOptions
  ): Promise<TResult> {
    const firefoxApi = ensureFirefox();
    const response: unknown = await firefoxApi.tabs.sendMessage(tabId, message, options);
    return decodeMessageResponse<TResult>(response);
  },

  addListener(listener: MessageListener): () => void {
    const firefoxApi = ensureFirefox();
    const wrapped: Parameters<typeof firefoxApi.runtime.onMessage.addListener>[0] = (
      message,
      sender
    ) => {
      const invocation = invokeMessageListener(listener, message, sender);
      switch (invocation.kind) {
        case 'no-response':
          return undefined;
        case 'sync-response':
          return Promise.resolve(invocation.response);
        case 'async-response':
          return invocation.response;
      }
    };

    firefoxApi.runtime.onMessage.addListener(wrapped);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      firefoxApi.runtime.onMessage.removeListener(wrapped);
    };
  }
};
