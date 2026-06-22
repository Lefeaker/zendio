import type { MessagePayload, MessagingService } from '../../platform/interfaces/messaging';
import { hasUsableSelection } from './selectionSnapshot';

type ForwardContext = {
  document: Document;
  window: Window;
  messaging: Pick<MessagingService, 'send'>;
};

function createFailurePayload(error: string): MessagePayload {
  return { success: false, error };
}

function resolveFailureResponseMessage(response: MessagePayload | undefined): string | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return null;
  }
  if (response.success !== false) {
    return null;
  }
  const error = response.error;
  return typeof error === 'string' && error.trim().length > 0
    ? error
    : 'Forwarded video selection failed';
}

export async function forwardVideoFrameSelection({
  document,
  window,
  messaging
}: ForwardContext): Promise<MessagePayload> {
  const selection = window.getSelection();
  if (!selection || !hasUsableSelection(selection)) {
    return createFailurePayload('No text selected');
  }

  const range = selection.getRangeAt(0).cloneRange();
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  try {
    const response = await messaging.send<MessagePayload>({
      type: 'AIIOB_FORWARD_VIDEO_SELECTION',
      payload: {
        selectedHtml: container.innerHTML,
        selectedText: selection.toString(),
        sourceUrl: location.href
      }
    });
    const failureMessage = resolveFailureResponseMessage(response);
    if (failureMessage) {
      return createFailurePayload(failureMessage);
    }
    selection.removeAllRanges();
    return { success: true, forwarded: true };
  } catch (error) {
    console.error('[content] forwardVideoSelection:', error);
    const messageText = error instanceof Error ? error.message : String(error);
    return createFailurePayload(messageText);
  }
}
