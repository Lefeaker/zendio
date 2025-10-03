import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import { writeMarkdownToVault } from '../services/obsidianWriter';
import { notifyClipFailure, notifyClipSuccess } from '../services/notifications';
import type { ClipResultMessage } from '../types/messages';

export async function handleClipResult(message: ClipResultMessage): Promise<void> {
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

    await notifyClipSuccess(filePath, vault?.name);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error('[clipPipeline] Clip failed:', error);
    await notifyClipFailure(messageText);
  }
}
