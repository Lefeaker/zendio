import type { MessageListener, MessageSenderInfo, MessagingService } from '../interfaces/messaging';
import { ensureChrome, getChromeLastError, normalizePromise, suppressLastError } from './utils';

function toSenderInfo(sender: chrome.runtime.MessageSender | undefined): MessageSenderInfo {
  const result: MessageSenderInfo = {};

  if (sender?.id !== undefined) {
    result.id = sender.id;
  }
  if (sender?.tab?.id !== undefined) {
    result.tabId = sender.tab.id;
  }
  if (sender?.frameId !== undefined) {
    result.frameId = sender.frameId;
  }
  const url = sender?.url ?? sender?.tab?.url;
  if (url !== undefined) {
    result.url = url;
  }
  if (sender?.origin !== undefined) {
    result.origin = sender.origin;
  }

  return result;
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

export const chromeMessagingService: MessagingService = {
  async send<TResult = unknown>(message: unknown): Promise<TResult> {
    const chromeApi = ensureChrome();
    return normalizePromise<TResult>((resolve, reject) => {
      try {
        chromeApi.runtime.sendMessage(message, (response) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(response as TResult);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async sendToTab<TResult = unknown>(tabId: number, message: unknown, options?: { frameId?: number }): Promise<TResult> {
    const chromeApi = ensureChrome();
    return normalizePromise<TResult>((resolve, reject) => {
      try {
        chromeApi.tabs.sendMessage(tabId, message, options ?? {}, (response) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(response as TResult);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  addListener(listener: MessageListener): () => void {
    const chromeApi = ensureChrome();
    const wrapped = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      try {
        const result = listener(message, toSenderInfo(sender));
        if (isPromiseLike(result)) {
          result
            .then((value) => {
              sendResponse(value);
            })
            .catch((error: unknown) => {
              const err = error instanceof Error ? error : new Error(String(error));
              sendResponse({ error: err.message });
            });
          return true;
        }
        if (result !== undefined) {
          sendResponse(result);
        } else {
          suppressLastError();
        }
        return false;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        sendResponse({ error: err.message });
        return false;
      }
    };
    chromeApi.runtime.onMessage.addListener(wrapped);
    return () => {
      chromeApi.runtime.onMessage.removeListener(wrapped);
    };
  }
};
