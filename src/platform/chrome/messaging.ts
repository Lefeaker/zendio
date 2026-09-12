import type { MessageListener, MessagingService } from '../interfaces/messaging';
import { decodeMessageResponse, invokeMessageListener } from '../shared/messageListenerInvocation';
import { ensureChrome, getChromeLastError, suppressLastError } from './utils';

export const chromeMessagingService: MessagingService = {
  send<TResult = unknown>(message: unknown): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const chromeApi = ensureChrome();
      chromeApi.runtime.sendMessage(message, (response) => {
        const error = getChromeLastError();
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(decodeMessageResponse<TResult>(response));
        } catch (decodeError) {
          reject(decodeError);
        }
      });
    });
  },

  sendToTab<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: { frameId?: number }
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const chromeApi = ensureChrome();
      chromeApi.tabs.sendMessage(tabId, message, options ?? {}, (response) => {
        const error = getChromeLastError();
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(decodeMessageResponse<TResult>(response));
        } catch (decodeError) {
          reject(decodeError);
        }
      });
    });
  },

  addListener(listener: MessageListener): () => void {
    const chromeApi = ensureChrome();
    const wrapped = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      const invocation = invokeMessageListener(listener, message, sender);
      switch (invocation.kind) {
        case 'no-response':
          suppressLastError();
          return false;
        case 'sync-response':
          sendResponse(invocation.response);
          return false;
        case 'async-response':
          void invocation.response.then((response) => {
            sendResponse(response);
          });
          return true;
      }
    };

    chromeApi.runtime.onMessage.addListener(wrapped);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      chromeApi.runtime.onMessage.removeListener(wrapped);
    };
  }
};
