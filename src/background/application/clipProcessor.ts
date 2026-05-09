import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import type { ClassificationResult } from '../services/classificationService';
import { writeMarkdownToVault } from '../services/obsidianWriter';
import { recordClipUsage } from '../services/usageStats';
import type { ClipResultMessage } from '../../shared/types';
import {
  parseExportDestinationMetadata,
  toDownloadsFilename
} from '../../shared/exportDestination';
import { isAppError, normalizeToAppError } from '../../shared/errors';
import type { AppError } from '../../shared/errors';
import { getPlatformServices } from '../../platform';

export interface ClipProcessingResult {
  filePath: string;
  vaultName?: string;
  restVault: string;
  destination: 'vault' | 'downloads';
  classification: ClassificationResult;
  classificationWarning?: AppError;
}

type ClipPayload = NonNullable<ClipResultMessage['payload']>;

export async function processClipPayload(payload: ClipPayload): Promise<ClipProcessingResult> {
  const options = await getOptions();
  const classification = await classifyClip(options, payload);
  const filePath = resolvePath(options.templates, payload, classification, options.domainMappings);
  const exportDestination = parseExportDestinationMetadata(payload.meta?.exportDestination);

  if (exportDestination?.kind === 'downloads') {
    const filename = toDownloadsFilename(filePath);
    await getPlatformServices().downloads.download({
      filename,
      content: payload.markdown,
      mimeType: 'text/markdown;charset=utf-8'
    });

    try {
      await recordClipUsage(payload);
    } catch (usageError) {
      console.warn('[clipProcessor] Failed to record usage stats:', usageError);
    }

    return {
      filePath: filename,
      restVault: '',
      destination: 'downloads',
      classification
    };
  }

  const { vault, restConfig } = selectVaultForClip(options, payload);

  await writeMarkdownToVault(restConfig, filePath, payload.markdown);

  try {
    await recordClipUsage(payload);
  } catch (usageError) {
    console.warn('[clipProcessor] Failed to record usage stats:', usageError);
  }

  const classificationWarning =
    classification.status === 'fallback' && classification.fallbackReason === 'error'
      ? classification.errorDetail
        ? isAppError(classification.errorDetail)
          ? classification.errorDetail
          : normalizeToAppError(classification.errorDetail, {
              code: 'CLASSIFICATION_WARNING_INVALID',
              domain: 'classifier',
              defaultMessage: 'Classification warning could not be normalized.',
              context: {
                ...(payload.meta?.url !== undefined && { url: payload.meta.url }),
                ...(payload.type !== undefined && { payloadType: payload.type })
              }
            })
        : undefined
      : undefined;

  const result: ClipProcessingResult = {
    filePath,
    restVault: restConfig.vault,
    destination: 'vault',
    classification,
    ...(vault?.name !== undefined && { vaultName: vault.name }),
    ...(classificationWarning !== undefined && { classificationWarning })
  };

  return result;
}
