import {
  deserializeLocalVaultContent,
  isLocalVaultWriteRequest
} from '../platform/chrome/localVaultOffscreenMessages';
import { writeLocalVaultFile } from '../platform/chrome/localVaultCore';

const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime;

runtime?.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isLocalVaultWriteRequest(message)) {
    return false;
  }

  void (async () => {
    try {
      await writeLocalVaultFile({
        folderId: message.folderId,
        filePath: message.filePath,
        content: deserializeLocalVaultContent(message.content)
      });
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true;
});
