import type { ContextMenuListenerDependencies } from './contextMenusTypes';

function getObjectProperty(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

export function registerFrameSelectionBridge({
  messaging,
  tabs
}: Pick<ContextMenuListenerDependencies, 'messaging' | 'tabs'>): void {
  messaging.addListener((rawMessage, sender) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return undefined;
    }
    const messageType = getObjectProperty(rawMessage, 'type');
    if (messageType !== 'AIIOB_FORWARD_VIDEO_SELECTION') {
      return undefined;
    }

    const tabId = sender.tabId;
    if (typeof tabId !== 'number') {
      return { success: false, error: 'NO_TAB' };
    }

    const messagePayload = getObjectProperty(rawMessage, 'payload');
    const rawPayload =
      typeof messagePayload === 'object' && messagePayload !== null ? messagePayload : {};
    const selectedHtml = getObjectProperty(rawPayload, 'selectedHtml');
    const selectedText = getObjectProperty(rawPayload, 'selectedText');
    const sourceUrl = getObjectProperty(rawPayload, 'sourceUrl');
    const payload = {
      selectedHtml: String(selectedHtml ?? ''),
      selectedText: String(selectedText ?? ''),
      sourceFrameId: sender.frameId ?? null,
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : null
    };

    return tabs
      .sendMessage(tabId, { action: 'videoClipSelectionFromFrame', payload }, { frameId: 0 })
      .then(() => ({ success: true }))
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[contextMenu] Failed to forward video selection from frame:', msg);
        return { success: false, error: msg };
      });
  });
}
