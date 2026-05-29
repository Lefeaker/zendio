import {
  deserializeLocalVaultContent,
  isTrustedLocalVaultOffscreenSender,
  isLocalVaultWriteRequest
} from '../platform/chrome/localVaultOffscreenMessages';
import { writeLocalVaultFile } from '../platform/chrome/localVaultCore';

const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime;
const UNTRUSTED_LOCAL_VAULT_SENDER_ERROR = 'Untrusted local vault write sender.';

function getExtensionOrigin(): string | undefined {
  try {
    return runtime?.getURL('');
  } catch {
    return undefined;
  }
}

runtime?.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isLocalVaultWriteRequest(message)) {
    return false;
  }

  if (!isTrustedLocalVaultOffscreenSender(sender, runtime?.id, getExtensionOrigin())) {
    sendResponse({ ok: false, error: UNTRUSTED_LOCAL_VAULT_SENDER_ERROR });
    return true;
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
