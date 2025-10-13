import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import { writeMarkdownToVault } from '../services/obsidianWriter';
import { recordClipUsage } from '../services/usageStats';
import type { ClipResultMessage } from '../../shared/types';

export interface ClipProcessingResult {
  filePath: string;
  vaultName?: string;
  restVault: string;
}

type ClipPayload = NonNullable<ClipResultMessage['payload']>;

export async function processClipPayload(payload: ClipPayload): Promise<ClipProcessingResult> {
  const options = await getOptions();
  const { vault, restConfig } = selectVaultForClip(options, payload);
  const classification = await classifyClip(options, payload);
  const filePath = resolvePath(options.templates, payload, classification, options.domainMappings);

  await writeMarkdownToVault(restConfig, filePath, payload.markdown);

  try {
    await recordClipUsage(payload);
  } catch (usageError) {
    console.warn('[clipProcessor] Failed to record usage stats:', usageError);
  }

  return {
    filePath,
    vaultName: vault?.name,
    restVault: restConfig.vault
  };
}
