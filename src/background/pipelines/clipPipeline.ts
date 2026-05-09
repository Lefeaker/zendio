import { getOptions } from '../store';
import { notifyClipFailure, notifyClipSuccess, notifyClipWarning } from '../services/notifications';
import type { ClipResultMessage } from '../../shared/types';
import { processClipPayload } from '../application/clipProcessor';
import type { TabsService } from '../../platform/interfaces/tabs';
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
import { dispatchSupportPrompt, type ClipPipelineDependencies } from './clipPipelineSupport';

export type { ClipPipelineDependencies } from './clipPipelineSupport';

export function createClipPipelineDependencies(
  tabs: Pick<TabsService, 'sendMessage'>
): ClipPipelineDependencies {
  return {
    sendSupportPrompt(tabId, message) {
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

  dispatchSupportPrompt(
    dependencies,
    tabId,
    buildSupportOptions('failure', payload, fallbackVault, appError)
  );
}

export async function handleClipResult(
  message: ClipResultMessage,
  tabId: number | undefined,
  dependencies: ClipPipelineDependencies
): Promise<void> {
  const payload = normalizeClipPayload(message.payload);

  if (!payload?.markdown) {
    const error = extractionErrors.noMarkdown(buildFailureContext(payload));
    await handleClipFailure(dependencies, error, tabId, payload);
    return;
  }

  try {
    const result = await processClipPayload(payload);
    const { classification } = result;
    let supportStatus: 'success' | 'failure' | 'warning' = 'success';
    let supportError: AppError | undefined;

    await safeNotify(() => notifyClipSuccess(result.filePath, result.vaultName), {
      channel: 'clipper.success',
      title: 'notifyClipSuccess'
    });

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
    dispatchSupportPrompt(
      dependencies,
      tabId,
      buildSupportOptions(supportStatus, payload, supportVault, supportError)
    );
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
