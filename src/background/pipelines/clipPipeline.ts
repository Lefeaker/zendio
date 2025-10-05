import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import { writeMarkdownToVault } from '../services/obsidianWriter';
import { notifyClipFailure, notifyClipSuccess } from '../services/notifications';
import { recordClipUsage } from '../services/usageStats';
import type { ClipResultMessage } from '../../shared/types';
import { SHOW_SUPPORT_PROMPT } from '../../shared/types';

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
    const options = await getOptions();
    const { vault, restConfig } = selectVaultForClip(options, payload);
    const classification = await classifyClip(options, payload);
    const filePath = resolvePath(options.templates, payload, classification, options.domainMappings);

    await writeMarkdownToVault(restConfig, filePath, payload.markdown);

    try {
      await recordClipUsage(payload);
    } catch (usageError) {
      console.warn('[clipPipeline] Failed to record usage stats:', usageError);
    }

    try {
      await notifyClipSuccess(filePath, vault?.name);
    } catch (notificationError) {
      console.warn('[clipPipeline] Success notification failed:', notificationError);
    }

    dispatchSupportPrompt(tabId, payload?.type, vault?.name ?? restConfig.vault, 'success');
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
