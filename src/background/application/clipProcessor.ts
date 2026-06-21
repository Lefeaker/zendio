import { getOptions } from '../store';
import { RUNTIME_FALLBACK_MESSAGES } from '../../i18n/catalog/runtimeFallbackMessages';
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
import { trackActivationMilestoneIfNeeded, trackUsageEvent } from '../services/analyticsEvents';
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
import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';
import type { PlatformServices } from '../../platform/types';
import type { RestOptions } from '../../shared/types/options';
import { serializedAttachmentContentToBlob } from '../../shared/attachments/clipAttachmentBinary';
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
type UntrustedValue = Parameters<typeof isAppError>[0];

export interface ClipProcessingProgress {
  value: number;
  label?: string;
  message?: UserVisibleMessageDescriptor;
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
export interface ClipProcessingFailure extends Error {
  readonly failureCategory?: FailureCategory;
}

const CLIP_PROGRESS_FALLBACKS = {
  supportProgressReadingSettings: RUNTIME_FALLBACK_MESSAGES.supportProgressReadingSettings,
  supportProgressSelectingVault: RUNTIME_FALLBACK_MESSAGES.supportProgressSelectingVault,
  supportProgressSavingDownloads: RUNTIME_FALLBACK_MESSAGES.supportProgressSavingDownloads,
  supportProgressRecordingResult: RUNTIME_FALLBACK_MESSAGES.supportProgressRecordingResult,
  supportProgressWritingAttachments: RUNTIME_FALLBACK_MESSAGES.supportProgressWritingAttachments,
  supportProgressWritingNote: RUNTIME_FALLBACK_MESSAGES.supportProgressWritingNote
} as const;

type ClipProgressMessageKey = keyof typeof CLIP_PROGRESS_FALLBACKS;

function createClipProgressMessage(key: ClipProgressMessageKey): UserVisibleMessageDescriptor {
  return { key, fallback: CLIP_PROGRESS_FALLBACKS[key] };
}

function isFailureCategory(value: UntrustedValue): value is FailureCategory {
  switch (value) {
    case 'permission':
    case 'connection':
    case 'validation':
    case 'classification':
    case 'extraction':
    case 'write':
    case 'timeout':
    case 'unsupported':
    case 'unknown':
      return true;
    default:
      return false;
  }
}

function hasFailureCategory(error: object): error is { failureCategory?: UntrustedValue } {
  return 'failureCategory' in error;
}

function defineClipProcessingFailureCategory(
  failure: Error,
  failureCategory: FailureCategory
): asserts failure is ClipProcessingFailure {
  Object.defineProperty(failure, 'failureCategory', {
    configurable: true,
    enumerable: false,
    value: failureCategory,
    writable: false
  });
}

export function readClipProcessingFailureCategory(
  error: UntrustedValue
): FailureCategory | undefined {
  if (typeof error !== 'object' || error === null || !hasFailureCategory(error)) {
    return undefined;
  }
  const category = error.failureCategory;
  return isFailureCategory(category) ? category : undefined;
}

function withClipProcessingFailureCategory(
  error: UntrustedValue,
  failureCategory: FailureCategory
): ClipProcessingFailure {
  const failure =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
  try {
    defineClipProcessingFailureCategory(failure, failureCategory);
    return failure;
  } catch {
    const fallback = new Error(failure.message);
    defineClipProcessingFailureCategory(fallback, failureCategory);
    return fallback;
  }
}

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
    hooks.onProgress?.({
      value: 48,
      message: createClipProgressMessage('supportProgressReadingSettings')
    });
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

      const createDownloadsRoute = () => {
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
      };

      if (exportDestination?.kind === 'downloads') {
        return createDownloadsRoute();
      }

      hooks.onProgress?.({
        value: 56,
        message: createClipProgressMessage('supportProgressSelectingVault')
      });
      const { vault, restConfig } = selectVaultForClip(options, payload);
      if (!isWritableVaultRestConfig(restConfig)) {
        return createDownloadsRoute();
      }

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
      hooks.onProgress?.({
        value: 74,
        message: createClipProgressMessage('supportProgressSavingDownloads')
      });
      const downloads = getDownloadsService();
      if (routed.prepared.attachments.length > 0) {
        await completeStage('write_attachments', async () => {
          for (const attachment of routed.prepared.attachments) {
            const blob = serializedAttachmentContentToBlob(attachment.content, attachment.mimeType);
            await downloads.download({
              filename: attachment.outputPath,
              blob,
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

      hooks.onProgress?.({
        value: 94,
        message: createClipProgressMessage('supportProgressRecordingResult')
      });
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
        duration_bucket: bucketDurationMs(Date.now() - startedAt),
        attachment_count_bucket: bucketCount(routed.prepared.attachments.length)
      });
      void trackActivationMilestoneIfNeeded('first_clip_saved');
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
      hooks.onProgress?.({
        value: 68,
        message: createClipProgressMessage('supportProgressWritingAttachments')
      });
      await completeStage('write_attachments', async () => {
        for (const attachment of routed.prepared.attachments) {
          const blob = serializedAttachmentContentToBlob(attachment.content, attachment.mimeType);
          await routed.writeSession.writeAttachment(
            attachment.outputPath,
            blob,
            attachment.mimeType
          );
        }
      });
    }

    hooks.onProgress?.({
      value: 82,
      message: createClipProgressMessage('supportProgressWritingNote')
    });
    await completeStage('write_markdown', () =>
      routed.writeSession.writeMarkdown(routed.filePath, routed.prepared.markdown)
    );

    hooks.onProgress?.({
      value: 94,
      message: createClipProgressMessage('supportProgressRecordingResult')
    });
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
                userMessageDescriptor: { key: 'errorClassifierInvalidPayload' },
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
      duration_bucket: bucketDurationMs(Date.now() - startedAt),
      attachment_count_bucket: bucketCount(routed.prepared.attachments.length)
    });
    void trackActivationMilestoneIfNeeded('first_clip_saved');
    if (aiChatTelemetry) {
      trackClipTelemetryEvent('ai_chat_exported', {
        platform: aiChatTelemetry.platform,
        message_count_bucket: aiChatTelemetry.messageCountBucket,
        duration_bucket: bucketDurationMs(Date.now() - startedAt)
      });
    }

    return result;
  } catch (error) {
    const failureCategory = resolveFailureCategory(error, currentStage, storageTarget);
    trackClipTelemetryEvent('clip_save_failed', {
      operation_id: operationId,
      storage_target: storageTarget,
      failure_category: failureCategory
    });
    throw withClipProcessingFailureCategory(error, failureCategory);
  }
}

function isWritableVaultRestConfig(restConfig: RestOptions): boolean {
  return Boolean(
    restConfig.localFolderId?.trim() || (restConfig.vault?.trim() && restConfig.apiKey?.trim())
  );
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

function toAnalyticsPlatform(value: UntrustedValue): AnalyticsPlatform {
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
  error: UntrustedValue,
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
