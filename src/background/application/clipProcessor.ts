import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import type { ClassificationResult } from '../services/classificationService';
import { createVaultWriteSession } from '../services/obsidianWriter';
import type {
  LocalVaultFallbackReason,
  LocalVaultPermissionPromptRequest,
  LocalVaultPermissionPromptResult,
  VaultStorageTarget
} from '../services/obsidianWriter';
import { recordClipUsage } from '../services/usageStats';
import { trackUsageEvent } from '../services/analyticsEvents';
import type { ClipResultMessage } from '../../shared/types';
import {
  bucketCount,
  bucketDurationMs,
  createAnalyticsOperationId,
  type AnalyticsPlatform,
  type CountBucket,
  type FailureCategory,
  type StorageTarget,
  type UsageEventParamMap
} from '../../shared/analytics';
import {
  parseExportDestinationMetadata,
  toDownloadsFilename
} from '../../shared/exportDestination';
import { isAppError, normalizeToAppError } from '../../shared/errors';
import type { AppError } from '../../shared/errors';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import { prepareVideoClipAttachments } from './videoScreenshotAttachmentPlanner';

export interface ClipProcessingResult {
  filePath: string;
  vaultName?: string;
  restVault: string;
  destination: 'vault' | 'downloads';
  storageTarget: VaultStorageTarget | 'downloads';
  localFolderName?: string;
  fallbackReason?: LocalVaultFallbackReason;
  classification: ClassificationResult;
  classificationWarning?: AppError;
}

type ClipPayload = NonNullable<ClipResultMessage['payload']>;

export interface ClipProcessingProgress {
  value: number;
  label: string;
}

export interface ClipProcessingHooks {
  onProgress?: (progress: ClipProcessingProgress) => void;
  requestLocalVaultPermission?: (
    request: LocalVaultPermissionPromptRequest
  ) => Promise<LocalVaultPermissionPromptResult>;
}

type BackgroundStage = UsageEventParamMap['background_stage_completed']['stage'];
type ClipTelemetryEventName =
  | 'background_stage_completed'
  | 'clip_save_completed'
  | 'clip_save_failed'
  | 'ai_chat_detected'
  | 'ai_chat_exported';

interface AiChatTelemetryMetadata {
  platform: AnalyticsPlatform;
  messageCountBucket: CountBucket;
}

const BACKGROUND_OPERATION_ID_PATTERN = /^op_[a-z0-9]{6,24}$/u;

function getDownloadsService(): PlatformServices['downloads'] {
  return getService<PlatformServices>(TOKENS.platformServices).downloads;
}

export async function processClipPayload(
  payload: ClipPayload,
  hooks: ClipProcessingHooks = {}
): Promise<ClipProcessingResult> {
  const operationId = resolveBackgroundOperationId(payload);
  const startedAt = Date.now();
  const aiChatTelemetry = resolveAiChatTelemetry(payload);
  let storageTarget: StorageTarget = 'unknown';
  let currentStage: BackgroundStage | null = null;

  const completeStage = <T>(stage: BackgroundStage, action: () => Promise<T>): Promise<T> => {
    currentStage = stage;
    const stageStartedAt = Date.now();
    return Promise.resolve(action()).then((value) => {
      trackClipTelemetryEvent('background_stage_completed', {
        operation_id: operationId,
        stage,
        duration_bucket: bucketDurationMs(Date.now() - stageStartedAt)
      });
      return value;
    });
  };

  if (aiChatTelemetry) {
    trackClipTelemetryEvent('ai_chat_detected', {
      platform: aiChatTelemetry.platform,
      message_count_bucket: aiChatTelemetry.messageCountBucket
    });
  }

  try {
    hooks.onProgress?.({ value: 48, label: '正在读取设置与分类' });
    const options = await getOptions();
    const classification = await completeStage('classify', () => classifyClip(options, payload));

    const routed = await completeStage('route', async () => {
      const filePath = resolvePath(
        options.templates,
        payload,
        classification,
        options.domainMappings
      );
      const exportDestination = parseExportDestinationMetadata(payload.meta?.exportDestination);

      if (exportDestination?.kind === 'downloads') {
        storageTarget = 'downloads';
        const filename = toDownloadsFilename(filePath);
        return {
          destination: 'downloads' as const,
          filePath: filename,
          restVault: '',
          prepared: prepareVideoClipAttachments({
            payload,
            notePath: filename,
            destination: 'downloads',
            ...(options.video?.screenshotAttachment
              ? { screenshotAttachmentOptions: options.video.screenshotAttachment }
              : {})
          })
        };
      }

      hooks.onProgress?.({ value: 56, label: '正在选择 Obsidian 仓库' });
      const { vault, restConfig } = selectVaultForClip(options, payload);
      const prepared = prepareVideoClipAttachments({
        payload,
        notePath: filePath,
        destination: 'vault',
        ...(options.video?.screenshotAttachment
          ? { screenshotAttachmentOptions: options.video.screenshotAttachment }
          : {})
      });
      const writeSession = await createVaultWriteSession(restConfig, {
        ...(hooks.requestLocalVaultPermission
          ? { requestLocalVaultPermission: hooks.requestLocalVaultPermission }
          : {})
      });
      storageTarget = toAnalyticsStorageTarget(writeSession.target.storageTarget);

      return {
        destination: 'vault' as const,
        filePath,
        vault,
        restConfig,
        prepared,
        writeSession
      };
    });

    if (routed.destination === 'downloads') {
      hooks.onProgress?.({ value: 74, label: '正在保存到下载目录' });
      const downloads = getDownloadsService();
      if (routed.prepared.attachments.length > 0) {
        await completeStage('write_attachments', async () => {
          for (const attachment of routed.prepared.attachments) {
            await downloads.download({
              filename: attachment.outputPath,
              url: attachment.dataUrl,
              mimeType: attachment.mimeType
            });
          }
        });
      }
      await completeStage('write_markdown', () =>
        downloads.download({
          filename: routed.filePath,
          content: routed.prepared.markdown,
          mimeType: 'text/markdown;charset=utf-8'
        })
      );

      hooks.onProgress?.({ value: 94, label: '正在记录发送结果' });
      await completeStage('record_usage', async () => {
        try {
          await recordClipUsage(payload);
        } catch (usageError) {
          console.warn('[clipProcessor] Failed to record usage stats:', usageError);
        }
      });

      const result: ClipProcessingResult = {
        filePath: routed.filePath,
        restVault: '',
        destination: 'downloads',
        storageTarget: 'downloads',
        classification
      };

      trackClipTelemetryEvent('clip_save_completed', {
        operation_id: operationId,
        storage_target: 'downloads',
        duration_bucket: bucketDurationMs(Date.now() - startedAt)
      });
      if (aiChatTelemetry) {
        trackClipTelemetryEvent('ai_chat_exported', {
          platform: aiChatTelemetry.platform,
          message_count_bucket: aiChatTelemetry.messageCountBucket,
          duration_bucket: bucketDurationMs(Date.now() - startedAt)
        });
      }

      return result;
    }

    if (routed.prepared.attachments.length) {
      hooks.onProgress?.({ value: 68, label: '正在写入附件' });
      await completeStage('write_attachments', async () => {
        for (const attachment of routed.prepared.attachments) {
          await routed.writeSession.writeAttachment(
            attachment.outputPath,
            attachment.dataUrl,
            attachment.mimeType
          );
        }
      });
    }

    hooks.onProgress?.({ value: 82, label: '正在写入笔记' });
    await completeStage('write_markdown', () =>
      routed.writeSession.writeMarkdown(routed.filePath, routed.prepared.markdown)
    );

    hooks.onProgress?.({ value: 94, label: '正在记录发送结果' });
    await completeStage('record_usage', async () => {
      try {
        await recordClipUsage(payload);
      } catch (usageError) {
        console.warn('[clipProcessor] Failed to record usage stats:', usageError);
      }
    });

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
      filePath: routed.filePath,
      restVault: routed.restConfig.vault,
      destination: 'vault',
      storageTarget: routed.writeSession.target.storageTarget,
      classification,
      ...(routed.vault?.name !== undefined && { vaultName: routed.vault.name }),
      ...(routed.writeSession.target.localFolderName !== undefined && {
        localFolderName: routed.writeSession.target.localFolderName
      }),
      ...(routed.writeSession.target.fallbackReason !== undefined && {
        fallbackReason: routed.writeSession.target.fallbackReason
      }),
      ...(classificationWarning !== undefined && { classificationWarning })
    };

    trackClipTelemetryEvent('clip_save_completed', {
      operation_id: operationId,
      storage_target: storageTarget,
      duration_bucket: bucketDurationMs(Date.now() - startedAt)
    });
    if (aiChatTelemetry) {
      trackClipTelemetryEvent('ai_chat_exported', {
        platform: aiChatTelemetry.platform,
        message_count_bucket: aiChatTelemetry.messageCountBucket,
        duration_bucket: bucketDurationMs(Date.now() - startedAt)
      });
    }

    return result;
  } catch (error) {
    trackClipTelemetryEvent('clip_save_failed', {
      operation_id: operationId,
      storage_target: storageTarget,
      failure_category: resolveFailureCategory(error, currentStage, storageTarget)
    });
    throw error;
  }
}

function resolveBackgroundOperationId(payload: ClipPayload): string {
  const meta = payload.meta;
  const candidate =
    typeof meta?.operationId === 'string'
      ? meta.operationId
      : typeof meta?.operation_id === 'string'
        ? meta.operation_id
        : undefined;
  return candidate && BACKGROUND_OPERATION_ID_PATTERN.test(candidate)
    ? candidate
    : createAnalyticsOperationId();
}

function resolveAiChatTelemetry(payload: ClipPayload): AiChatTelemetryMetadata | null {
  if (payload.type !== 'ai_chat') {
    return null;
  }

  return {
    platform: toAnalyticsPlatform(payload.meta?.platform),
    messageCountBucket: bucketCount(Number(payload.meta?.messageCount))
  };
}

function toAnalyticsPlatform(value: unknown): AnalyticsPlatform {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'unknown';
  }

  switch (value) {
    case 'youtube':
    case 'bilibili':
    case 'chatgpt':
    case 'claude':
    case 'gemini':
    case 'unknown':
      return value;
    default:
      return 'other';
  }
}

function toAnalyticsStorageTarget(
  value: VaultStorageTarget | 'downloads' | 'unknown'
): StorageTarget {
  if (value === 'downloads' || value === 'unknown') {
    return value;
  }
  return value === 'local-folder' ? 'local_folder' : 'rest_api';
}

function resolveFailureCategory(
  error: unknown,
  stage: BackgroundStage | null,
  storageTarget: StorageTarget
): FailureCategory {
  if (isAppError(error)) {
    if (error.domain === 'classifier') {
      return 'classification';
    }
    if (error.domain === 'rest') {
      return 'connection';
    }
    if (error.code === 'LOCAL_VAULT_WRITE_FAILED') {
      return 'write';
    }
    if (error.code.includes('TIMEOUT')) {
      return 'timeout';
    }
  }

  if (stage === 'classify') {
    return 'classification';
  }
  if (stage === 'route') {
    return 'validation';
  }
  if (stage === 'write_attachments' || stage === 'write_markdown') {
    return storageTarget === 'rest_api' ? 'connection' : 'write';
  }

  return 'unknown';
}

function trackClipTelemetryEvent<EventName extends ClipTelemetryEventName>(
  eventName: EventName,
  params: UsageEventParamMap[EventName]
): void {
  void Promise.resolve()
    .then(() => trackUsageEvent(eventName, params))
    .catch(() => undefined);
}
