import { notifyClipFailure } from '../services/notifications';
import { contentErrors } from '../../shared/errors/contentErrors';

function getObjectProperty(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

export function resolveContentActionFailureMessage(response: object | undefined): string | null {
  if (!response || getObjectProperty(response, 'success') !== false) {
    return null;
  }
  const error = getObjectProperty(response, 'error');
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
