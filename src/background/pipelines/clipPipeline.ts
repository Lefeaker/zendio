import { getOptions } from '../store';
import { notifyClipFailure, notifyClipSuccess } from '../services/notifications';
import type { ClipResultMessage } from '../../shared/types';
import { SHOW_SUPPORT_PROMPT } from '../../shared/types';
import { processClipPayload } from '../application/clipProcessor';

function dispatchSupportPrompt(
  tabId: number | undefined,
  source?: string,
  vaultName?: string,
  status: 'success' | 'failure' = 'success',
  errorMessage?: string
): void {
  if (typeof tabId !== 'number') {
    return;
  }
  chrome.tabs.sendMessage(
    tabId,
    { type: SHOW_SUPPORT_PROMPT, source, vaultName, status, errorMessage },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError && !/Receiving end does not exist/.test(String(lastError.message))) {
        console.warn('[clipPipeline] Support prompt dispatch failed:', lastError);
      }
    }
  );
}

export async function handleClipResult(message: ClipResultMessage, tabId?: number): Promise<void> {
  const payload = message.payload;

  if (!payload?.markdown) {
    await notifyClipFailure('Invalid clip payload: missing markdown content');
    return;
  }

  try {
    const result = await processClipPayload(payload);
    try {
      await notifyClipSuccess(result.filePath, result.vaultName);
    } catch (notificationError) {
      console.warn('[clipPipeline] Success notification failed:', notificationError);
    }

    const supportVault = result.vaultName ?? result.restVault;
    dispatchSupportPrompt(tabId, payload?.type, supportVault, 'success');
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error('[clipPipeline] Clip failed:', error);
    try {
      await notifyClipFailure(messageText);
    } catch (notificationError) {
      console.warn('[clipPipeline] Failure notification failed:', notificationError);
    }
    let fallbackVault: string | undefined;
    try {
      const options = await getOptions();
      fallbackVault = options?.rest?.vault;
    } catch {
      fallbackVault = undefined;
    }
    dispatchSupportPrompt(tabId, payload?.type, fallbackVault, 'failure', messageText);
  }
}
