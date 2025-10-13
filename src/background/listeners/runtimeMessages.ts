import { handleClipResult } from '../pipelines/clipPipeline';
import { handleConnectionTest, handleVaultConnectionTest } from '../pipelines/connectionTest';
import { notifyExtractionError } from '../services/notifications';
import {
  isClipErrorMessage,
  isClipResultMessage,
  isTestConnectionMessage,
  isTestVaultConnectionMessage
} from '../../shared/types';

export function registerRuntimeMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    console.warn('[runtimeMessages] Chrome runtime messaging unavailable; skipping listener registration.');
    return;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isTestConnectionMessage(message)) {
      handleConnectionTest()
        .then(result => sendResponse(result))
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: msg, message: `连接失败: ${msg}` });
        });
      return true;
    }

    if (isTestVaultConnectionMessage(message)) {
      handleVaultConnectionTest(message)
        .then(result => sendResponse(result))
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: msg, message: `连接失败: ${msg}` });
        });
      return true;
    }

    if (isClipErrorMessage(message)) {
      const errorText = message.error instanceof Error ? message.error.message : String(message.error);
      console.error('[runtimeMessages] Content script error:', errorText);
      void notifyExtractionError(errorText);
      return;
    }

    if (isClipResultMessage(message)) {
      void handleClipResult(message, sender.tab?.id);
      return;
    }
  });
}
