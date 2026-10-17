import { getOptions } from '../store';
import { notifyClipFailure, notifyClipSuccess, notifyClipWarning } from '../services/notifications';
import type { ClipResultMessage, ClipResultResponse } from '../../shared/types';
import { processClipPayload, clipProcessingFailureResult } from '../application/clipProcessor';
import { createClipSaveFailure, type ClipSaveFailure } from '../../shared/types/clipResult';
import { runBestEffortEffect } from '../../shared/errors/bestEffortEffect';
import type { TabsService } from '../../platform/interfaces/tabs';
import { createAnalyticsOperationId } from '../../shared/analytics';
import {
  AppError,
  errorHandler,
  extractionErrors,
  isAppError,
  normalizeToAppError
} from '../../shared/errors';
import {
  buildFailureContext,
  buildPipelineErrorContext,
  buildSupportOptions,
  normalizeClipPayload,
  safeNotify
} from './clipPipelineHelpers';
import {
  buildLocalVaultPermissionPromptMessage,
  dispatchSupportPrompt,
  type ClipPipelineDependencies,
  type SupportPromptOptions
} from './clipPipelineSupport';
import {
  isLocalVaultPermissionPromptSuppressed,
  suppressLocalVaultPermissionPrompt
} from '../services/localVaultPermissionPrompts';
import type { LocalVaultPermissionPromptRequest } from '../services/obsidianWriter';

export type { ClipPipelineDependencies } from './clipPipelineSupport';

const BACKGROUND_OPERATION_ID_PATTERN = /^op_[a-z0-9]{6,24}$/u;

export function createClipPipelineDependencies(
  tabs: Pick<TabsService, 'sendMessage'>
): ClipPipelineDependencies {
  return {
    async sendSupportPrompt(tabId, message) {
      await tabs.sendMessage(tabId, message);
    },
    requestLocalVaultPermission(tabId, message) {
      return tabs.sendMessage(tabId, message);
    }
  };
}

async function handleClipFailure(
  dependencies: ClipPipelineDependencies,
  appError: AppError,
  failure: ClipSaveFailure,
  tabId: number | undefined,
  payload?: ClipResultMessage['payload']
): Promise<void> {
  void runBestEffortEffect(
    () => errorHandler.handle(appError, { suppressNotifications: true }),
    'clip.failure.report'
  );

  void safeNotify(() => notifyClipFailure(appError), {
    channel: 'clipper.failure',
    title: 'notifyClipFailure'
  });

  let fallbackVault: string | undefined;
  try {
    const options = await getOptions();
    fallbackVault = options?.rest?.vault;
  } catch {
    fallbackVault = undefined;
  }

  dispatchSupportPrompt(dependencies, tabId, {
    ...buildSupportOptions('failure', payload, fallbackVault),
    failure,
    progress: {
      value: 100,
      variant: 'failure'
    }
  });
}

async function requestCurrentPageLocalVaultPermission(
  dependencies: ClipPipelineDependencies,
  tabId: number | undefined,
  request: LocalVaultPermissionPromptRequest
) {
  if (await isLocalVaultPermissionPromptSuppressed(request.folderId)) {
    return { action: 'use-rest' as const, persistRest: true };
  }

  if (typeof tabId !== 'number') {
    return { action: 'use-rest' as const };
  }

  if (!dependencies.requestLocalVaultPermission) {
    return { action: 'use-rest' as const };
  }

  const folderName = request.folderName ?? request.vaultName ?? 'Local Folder';
  dispatchClipProgress(dependencies, tabId, {
    value: 60,
    message: {
      key: 'supportProgressLocalVaultPermissionRequest',
      values: { folderName },
      fallback: `Requesting local folder access: ${folderName}`
    }
  });

  try {
    const result = await dependencies.requestLocalVaultPermission(
      tabId,
      buildLocalVaultPermissionPromptMessage(request)
    );
    if (result.action === 'use-rest' && result.persistRest) {
      await suppressLocalVaultPermissionPrompt(request.folderId);
    }
    return result;
  } catch (error) {
    console.warn('[clipPipeline] Failed to request local vault permission in current page:', error);
    return { action: 'use-rest' as const };
  }
}

function dispatchClipProgress(
  dependencies: ClipPipelineDependencies,
  tabId: number | undefined,
  progress: NonNullable<SupportPromptOptions['progress']>
): void {
  dispatchSupportPrompt(dependencies, tabId, {
    status: 'progress',
    progress: {
      ...progress,
      variant: 'progress'
    }
  });
}

export async function handleClipResult(
  message: ClipResultMessage,
  tabId: number | undefined,
  dependencies: ClipPipelineDependencies
): Promise<ClipResultResponse> {
  const payload = ensureBackgroundOperationId(normalizeClipPayload(message.payload));

  if (!payload?.markdown) {
    const error = extractionErrors.noMarkdown(buildFailureContext(payload));
    const failure = createClipSaveFailure('failed', 'extraction', 'prepare');
    void runBestEffortEffect(
      () => handleClipFailure(dependencies, error, failure, tabId, payload),
      'clip.failure'
    );
    return failure;
  }

  try {
    dispatchClipProgress(dependencies, tabId, {
      value: 40,
      message: {
        key: 'supportProgressReceivingClipContent',
        fallback: 'Receiving clip content'
      }
    });
    const result = await processClipPayload(payload, {
      onProgress: (progress) => {
        dispatchClipProgress(dependencies, tabId, progress);
      },
      requestLocalVaultPermission: (request) => {
        return requestCurrentPageLocalVaultPermission(dependencies, tabId, request);
      }
    });
    const { classification } = result;
    let supportStatus: 'success' | 'failure' | 'warning' = 'success';

    void safeNotify(
      () =>
        notifyClipSuccess(result.filePath, {
          storageTarget: result.storageTarget,
          ...(result.vaultName !== undefined && { vaultName: result.vaultName }),
          ...(result.localFolderName !== undefined && { localFolderName: result.localFolderName }),
          ...(result.fallbackReason !== undefined && { fallbackReason: result.fallbackReason })
        }),
      {
        channel: 'clipper.success',
        title: 'notifyClipSuccess'
      }
    );

    const classificationWarning =
      result.classificationWarning ??
      (classification.status === 'fallback' && classification.fallbackReason === 'error'
        ? classification.errorDetail
        : undefined);

    if (classificationWarning) {
      const warningError = isAppError(classificationWarning)
        ? classificationWarning
        : normalizeToAppError(classificationWarning, {
            code: 'CLASSIFICATION_WARNING_INVALID',
            domain: 'classifier',
            userMessageDescriptor: { key: 'errorClassifierInvalidPayload' },
            context: buildPipelineErrorContext(payload)
          });
      supportStatus = 'warning';
      void runBestEffortEffect(
        () => errorHandler.handle(warningError, { suppressNotifications: true }),
        'clip.warning.report'
      );
      void safeNotify(() => notifyClipWarning(warningError), {
        channel: 'clipper.warning',
        title: 'notifyClipWarning'
      });
    }

    const supportVault =
      result.destination === 'downloads' ? undefined : (result.vaultName ?? result.restVault);
    dispatchSupportPrompt(dependencies, tabId, {
      ...buildSupportOptions(supportStatus, payload, supportVault),
      progress: {
        value: 100,
        variant: supportStatus
      }
    });
    return { success: true, outcome: 'saved', filePath: result.filePath };
  } catch (error) {
    const appError = normalizeToAppError(error, {
      code: 'CLIP_PIPELINE_FAILURE',
      domain: 'background',
      userMessageDescriptor: { key: 'clipFailed' },
      context: buildPipelineErrorContext(payload)
    });
    const failure = clipProcessingFailureResult(error);
    void runBestEffortEffect(
      () => handleClipFailure(dependencies, appError, failure, tabId, payload),
      'clip.failure'
    );
    return failure;
  }
}

function ensureBackgroundOperationId(
  payload: ClipResultMessage['payload']
): ClipResultMessage['payload'] {
  if (!payload) {
    return payload;
  }

  if (!payload.meta) {
    payload.meta = {};
  }

  const candidate =
    typeof payload.meta.operationId === 'string'
      ? payload.meta.operationId
      : typeof payload.meta.operation_id === 'string'
        ? payload.meta.operation_id
        : undefined;

  if (candidate && BACKGROUND_OPERATION_ID_PATTERN.test(candidate)) {
    payload.meta.operationId = candidate;
    return payload;
  }

  payload.meta.operationId = createAnalyticsOperationId();
  return payload;
}
