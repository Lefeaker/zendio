import { getErrorHandler, extractionErrors, type AppError } from '../../shared/errors';
import type { MessagePayload, MessagingService } from '../../platform/interfaces/messaging';
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
): Promise<void> {
  if (!result.markdown) {
    const noMarkdownContext: { url: string; type?: string } = { url };
    const resultType = result.type;
    if (resultType !== undefined) {
      noMarkdownContext.type = resultType;
    }
    throw extractionErrors.noMarkdown(noMarkdownContext);
  }

  try {
    await messaging.send({ type: 'CLIP_RESULT', payload: result as MessagePayload });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    const dispatchContext: { url: string; type?: string } = { url };
    const resultType = result.type;
    if (resultType !== undefined) {
      dispatchContext.type = resultType;
    }
    throw extractionErrors.dispatchFailure(message, dispatchContext);
  }
}
