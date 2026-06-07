import { getOptions } from '../store';
import { notifyClipFailure, notifyClipSuccess, notifyClipWarning } from '../services/notifications';
import type { ClipResultMessage } from '../../shared/types';
import { processClipPayload } from '../application/clipProcessor';
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
  type ClipPipelineDependencies
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
    sendSupportPrompt(tabId, message) {
      return tabs.sendMessage(tabId, message);
    },
    requestLocalVaultPermission(tabId, message) {
      return tabs.sendMessage(tabId, message);
    }
  };
}

async function handleClipFailure(
  dependencies: ClipPipelineDependencies,
  appError: AppError,
  tabId: number | undefined,
  payload?: ClipResultMessage['payload']
): Promise<void> {
  await errorHandler.handle(appError, { suppressNotifications: true });

  await safeNotify(() => notifyClipFailure(appError.userMessage ?? appError.message), {
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
    ...buildSupportOptions('failure', payload, fallbackVault, appError),
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

  dispatchClipProgress(
    dependencies,
    tabId,
    60,
    `正在请求本地目录授权：${request.folderName ?? request.vaultName ?? '本地仓库'}`
  );

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
  value: number,
  label: string
): void {
  dispatchSupportPrompt(dependencies, tabId, {
    status: 'progress',
    progress: {
      value,
      label,
      variant: 'progress'
    }
  });
}

export async function handleClipResult(
  message: ClipResultMessage,
  tabId: number | undefined,
  dependencies: ClipPipelineDependencies
): Promise<void> {
  const payload = ensureBackgroundOperationId(normalizeClipPayload(message.payload));

  if (!payload?.markdown) {
    const error = extractionErrors.noMarkdown(buildFailureContext(payload));
    await handleClipFailure(dependencies, error, tabId, payload);
    return;
  }

  try {
    dispatchClipProgress(dependencies, tabId, 40, '正在接收剪藏内容');
    const result = await processClipPayload(payload, {
      onProgress: (progress) => {
        dispatchClipProgress(dependencies, tabId, progress.value, progress.label);
      },
      requestLocalVaultPermission: (request) => {
        return requestCurrentPageLocalVaultPermission(dependencies, tabId, request);
      }
    });
    const { classification } = result;
    let supportStatus: 'success' | 'failure' | 'warning' = 'success';
    let supportError: AppError | undefined;

    await safeNotify(
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
            defaultMessage: 'Classification warning could not be normalized.',
            context: buildPipelineErrorContext(payload)
          });
      supportStatus = 'warning';
      supportError = warningError;
      await errorHandler.handle(warningError, { suppressNotifications: true });
      await safeNotify(() => notifyClipWarning(warningError.userMessage ?? warningError.message), {
        channel: 'clipper.warning',
        title: 'notifyClipWarning'
      });
    }

    const supportVault =
      result.destination === 'downloads' ? undefined : (result.vaultName ?? result.restVault);
    dispatchSupportPrompt(dependencies, tabId, {
      ...buildSupportOptions(supportStatus, payload, supportVault, supportError),
      progress: {
        value: 100,
        variant: supportStatus
      }
    });
  } catch (error) {
    const appError = normalizeToAppError(error, {
      code: 'CLIP_PIPELINE_FAILURE',
      domain: 'background',
      defaultMessage: 'Clip pipeline failed.',
      context: buildPipelineErrorContext(payload)
    });
    await handleClipFailure(dependencies, appError, tabId, payload);
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
