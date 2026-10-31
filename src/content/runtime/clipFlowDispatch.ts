import { getErrorHandler, extractionErrors, type AppError } from '../../shared/errors';
import type { MessagingService } from '../../platform/interfaces/messaging';
import {
  awaitClipSaveResult,
  createClipSaveFailure,
  type ClipSaveResult
} from '../../shared/types/clipResult';
import { isClipResultWithinTransportBudget } from '../../shared/attachments/clipPayloadBudget';
import type { ClipFlowResult } from './clipFlowTypes';

export async function emitClipError(
  messaging: Pick<MessagingService, 'send'>,
  error: AppError
): Promise<void> {
  const errorHandler = getErrorHandler();
  await errorHandler.handle(error, { suppressNotifications: true });

  try {
    await messaging.send({ type: 'CLIP_ERROR', error });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    const contextInput: { url: string; type?: string } = { url: location.href };
    const errorType = error.context?.type as string | undefined;
    if (errorType !== undefined) {
      contextInput.type = errorType;
    }
    const dispatchError = extractionErrors.dispatchFailure(message, contextInput);
    const handler = getErrorHandler();
    await handler.handle(dispatchError, { suppressNotifications: true });
  }
}

export async function sendClipResult(
  messaging: Pick<MessagingService, 'send'>,
  result: ClipFlowResult,
  url: string
): Promise<ClipSaveResult> {
  if (!result.markdown) {
    const noMarkdownContext: { url: string; type?: string } = { url };
    const resultType = result.type;
    if (resultType !== undefined) {
      noMarkdownContext.type = resultType;
    }
    throw extractionErrors.noMarkdown(noMarkdownContext);
  }

  const payload = { ...result, markdown: result.markdown };
  if (!isClipResultWithinTransportBudget(payload)) {
    return createClipSaveFailure('failed', 'validation', 'prepare');
  }

  // A missing write acknowledgement cannot establish that nothing was saved.
  return awaitClipSaveResult(() => messaging.send({ type: 'CLIP_RESULT', payload }));
}
