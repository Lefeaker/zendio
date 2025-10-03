import { handleClipResult } from '../pipelines/clipPipeline';
import { handleConnectionTest } from '../pipelines/connectionTest';
import { notifyExtractionError } from '../services/notifications';
import { isClipErrorMessage, isClipResultMessage, isTestConnectionMessage } from '../types/messages';

export function registerRuntimeMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isTestConnectionMessage(message)) {
      handleConnectionTest()
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
      void handleClipResult(message);
      return;
    }
  });
}
