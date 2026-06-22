import { notifyClipFailure } from '../services/notifications';
import { contentErrors } from '../../shared/errors/contentErrors';

export function resolveContentActionFailureMessage(response: object | undefined): string | null {
  if (!response || !('success' in response) || response.success !== false) {
    return null;
  }
  const error = 'error' in response ? response.error : undefined;
  return typeof error === 'string' && error.trim().length > 0
    ? error
    : 'Content action reported failure';
}

export async function notifyActionDispatchFailure(
  actionType: string,
  tabId: number,
  frameId: number | null,
  error: Error
): Promise<void> {
  console.error('[contextMenu] Failed to dispatch action to tab:', error);
  try {
    await notifyClipFailure(
      contentErrors.messagingFailed(
        actionType,
        {
          component: 'contextMenus',
          action: actionType,
          tabId,
          frameId
        },
        { cause: error }
      )
    );
  } catch (notifyError) {
    console.error('[contextMenu] Failed to notify action dispatch failure:', notifyError);
  }
}
