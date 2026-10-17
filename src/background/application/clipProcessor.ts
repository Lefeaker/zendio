import { REST_WRITE_TIMEOUT_MS } from '../../shared/interfaces/restClient';
import { withRequestDeadline } from '../../shared/utils/requestDeadline';
import { downloadPreparedClip } from './downloadClip';
import { runBestEffortEffect } from '../../shared/errors/bestEffortEffect';
import {
  createClipSaveFailure,
  type ClipSaveFailure,
  type ClipAttachmentProgress
} from '../../shared/types/clipResult';
import { clipAttachmentPlanId, matchesLegacyClipAttachmentPlanId } from './clipAttachmentPlanId';
import { learningCoursesForExport, recordLearningExport } from '../services/learningProgress';
import { getOptions } from '../store';
import { RUNTIME_FALLBACK_MESSAGES } from '../../i18n/catalog/runtimeFallbackMessages';
import { classifyClip } from '../services/classificationService';
import type { ClassificationResult } from '../services/classificationService';
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
import { resolveClipRoute, type ResolvedClipRoute } from './clipRouteResolver';
import { isAppError, normalizeToAppError } from '../../shared/errors';
import type { AppError } from '../../shared/errors';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';
import type { PlatformServices } from '../../platform/types';
import { serializedAttachmentContentToBlob } from '../../shared/attachments/clipAttachmentBinary';

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
  /** Cancels outbound network requests; local filesystem and Downloads have their own owners. */
  signal?: AbortSignal;
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
  readonly saveFailure?: ClipSaveFailure;
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
  failureCategory: FailureCategory,
  outcome: 'failed' | 'unknown',
  stage: 'prepare' | 'attachments' | 'note',
  attachmentProgress?: ClipAttachmentProgress
): ClipProcessingFailure {
  const failure =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
  try {
    defineClipProcessingFailureCategory(failure, failureCategory);
    Object.defineProperty(failure, 'saveFailure', {
      value: createClipSaveFailure(outcome, failureCategory, stage, attachmentProgress)
    });
    return failure;
  } catch {
    const fallback = new Error(failure.message);
    defineClipProcessingFailureCategory(fallback, failureCategory);
    Object.defineProperty(fallback, 'saveFailure', {
      value: createClipSaveFailure(outcome, failureCategory, stage, attachmentProgress)
    });
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
  const requestOptions = {
    deadlineAt: startedAt + REST_WRITE_TIMEOUT_MS,
    ...(hooks.signal ? { signal: hooks.signal } : {})
  };
  const aiChatTelemetry = resolveAiChatTelemetry(payload);
  let storageTarget: StorageTarget = 'unknown';
  let currentStage: BackgroundStage | null = null;
  const previousProgress = payload.meta?.attachmentProgress;
  let attachmentProgress: ClipAttachmentProgress | undefined = previousProgress
    ? { ...previousProgress, confirmed: [...previousProgress.confirmed] }
    : undefined;

  const completeStage = <T>(stage: BackgroundStage, action: () => Promise<T>): Promise<T> => {
    currentStage = stage;
    if (attachmentProgress && (stage === 'write_attachments' || stage === 'write_markdown'))
      attachmentProgress.phase = stage === 'write_markdown' ? 'note' : 'attachments';
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
    const classification = await completeStage('classify', () =>
      classifyClip(options, payload, requestOptions)
    );

    const routed = await completeStage('route', async () => {
      hooks.onProgress?.({
        value: 56,
        message: createClipProgressMessage('supportProgressSelectingVault')
      });
      return resolveClipRoute({
        ...requestOptions,
        options,
        payload,
        classification,
        ...(hooks.requestLocalVaultPermission
          ? { requestLocalVaultPermission: hooks.requestLocalVaultPermission }
          : {})
      });
    });
    storageTarget = toRouteStorageTarget(routed);
    if (routed.prepared.attachments.length || attachmentProgress) {
      // One plan per explicit dispatch, never per attachment progress callback.
      const planId = await withRequestDeadline(REST_WRITE_TIMEOUT_MS, requestOptions, (request) =>
        clipAttachmentPlanId(payload, routed, () => request.check())
      );
      const target =
        routed.destination === 'downloads' ? 'downloads' : routed.writeSession.target.storageTarget;
      const previousPlanId = attachmentProgress?.planId ?? planId;
      if (
        attachmentProgress &&
        (attachmentProgress.blocked ||
          attachmentProgress.operationId !== operationId ||
          attachmentProgress.storageTarget !== target ||
          attachmentProgress.total !== routed.prepared.attachments.length ||
          attachmentProgress.confirmed.some(
            (item, index) =>
              item.id !== routed.prepared.attachments[index]?.id ||
              item.outputPath !== routed.prepared.attachments[index]?.outputPath
          ) ||
          (previousPlanId !== planId &&
            !(await withRequestDeadline(REST_WRITE_TIMEOUT_MS, requestOptions, (request) =>
              matchesLegacyClipAttachmentPlanId(payload, routed, previousPlanId, () =>
                request.check()
              )
            ))))
      ) {
        attachmentProgress.blocked = true;
        throw new Error('CLIP_ATTACHMENT_PLAN_CHANGED');
      }
      // Preserve historical confirmations while upgrading a verified legacy plan.
      if (attachmentProgress) attachmentProgress.planId = planId;
      attachmentProgress ??= {
        operationId,
        planId,
        storageTarget: target,
        total: routed.prepared.attachments.length,
        phase: 'attachments',
        confirmed: []
      };
    }

    if (routed.destination === 'downloads') {
      hooks.onProgress?.({
        value: 74,
        message: createClipProgressMessage('supportProgressSavingDownloads')
      });
      const downloads = getDownloadsService();
      const downloaded = await downloadPreparedClip({
        downloads,
        filePath: routed.filePath,
        sourceMarkdown: payload.markdown,
        prepared: routed.prepared,
        ...(attachmentProgress ? { attachmentProgress } : {}),
        completeStage
      });
      void runBestEffortEffect(
        () =>
          recordLearningExport({
            receipt: {
              operationId,
              ...(payload.meta?.url ? { sourceUrl: payload.meta.url } : {}),
              filePath: downloaded.filePath,
              destination: 'downloads',
              savedAt: Date.now(),
              downloadId: downloaded.downloadId
            },
            courses: learningCoursesForExport(payload, routed.prepared.attachments.length),
            downloadIds: downloaded.downloadIds
          }),
        'clip.learning'
      );

      hooks.onProgress?.({
        value: 94,
        message: createClipProgressMessage('supportProgressRecordingResult')
      });
      void runBestEffortEffect(
        () =>
          completeStage('record_usage', async () => {
            try {
              await recordClipUsage(payload);
            } catch (usageError) {
              console.warn('[clipProcessor] Failed to record usage stats:', usageError);
            }
          }),
        'clip.usage'
      );

      const result: ClipProcessingResult = {
        filePath: downloaded.filePath,
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
      void runBestEffortEffect(
        () => trackActivationMilestoneIfNeeded('first_clip_saved'),
        'clip.activation'
      );
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
        for (const attachment of routed.prepared.attachments.slice(
          attachmentProgress?.confirmed.length ?? 0
        )) {
          const blob = serializedAttachmentContentToBlob(attachment.content, attachment.mimeType);
          await routed.writeSession.writeAttachment(
            attachment.outputPath,
            blob,
            attachment.mimeType
          );
          attachmentProgress?.confirmed.push({
            id: attachment.id,
            outputPath: attachment.outputPath
          });
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

    void runBestEffortEffect(
      () =>
        recordLearningExport({
          receipt: {
            operationId,
            ...(payload.meta?.url ? { sourceUrl: payload.meta.url } : {}),
            filePath: routed.filePath,
            destination: 'vault',
            vaultName: routed.restConfig.vault,
            savedAt: Date.now()
          },
          courses: learningCoursesForExport(payload, routed.prepared.attachments.length),
          downloadIds: []
        }),
      'clip.learning'
    );

    hooks.onProgress?.({
      value: 94,
      message: createClipProgressMessage('supportProgressRecordingResult')
    });
    void runBestEffortEffect(
      () =>
        completeStage('record_usage', async () => {
          try {
            await recordClipUsage(payload);
          } catch (usageError) {
            console.warn('[clipProcessor] Failed to record usage stats:', usageError);
          }
        }),
      'clip.usage'
    );

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
    void runBestEffortEffect(
      () => trackActivationMilestoneIfNeeded('first_clip_saved'),
      'clip.activation'
    );
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
    const stage =
      currentStage === 'write_attachments'
        ? 'attachments'
        : currentStage === 'write_markdown'
          ? 'note'
          : 'prepare';
    throw withClipProcessingFailureCategory(
      error,
      failureCategory,
      stage === 'prepare' && !attachmentProgress ? 'failed' : 'unknown',
      stage,
      attachmentProgress
    );
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

function toRouteStorageTarget(route: ResolvedClipRoute): StorageTarget {
  return route.destination === 'downloads'
    ? 'downloads'
    : toAnalyticsStorageTarget(route.writeSession.target.storageTarget);
}

function resolveFailureCategory(
  error: UntrustedValue,
  stage: BackgroundStage | null,
  storageTarget: StorageTarget
): FailureCategory {
  const declared = readClipProcessingFailureCategory(error);
  if (declared) return declared;
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name))
    return 'permission';
  if (isAppError(error)) {
    if (error.code.includes('TIMEOUT')) return 'timeout';
    if (error.domain === 'extraction') return 'extraction';
    if (error.domain === 'classifier') {
      return 'classification';
    }
    if (
      error.context?.statusCode === 401 ||
      error.context?.statusCode === 403 ||
      (error.cause instanceof DOMException &&
        ['NotAllowedError', 'SecurityError'].includes(error.cause.name))
    )
      return 'permission';
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

/** Only processor-owned stage metadata can claim a definite pre-write failure. */
export function clipProcessingFailureResult(error: unknown): ClipSaveFailure {
  if (error instanceof Error && 'saveFailure' in error) {
    const result = (error as ClipProcessingFailure).saveFailure;
    if (result) return result;
  }
  return createClipSaveFailure('unknown', readClipProcessingFailureCategory(error) ?? 'unknown');
}
