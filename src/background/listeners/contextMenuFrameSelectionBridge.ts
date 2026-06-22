import type { ContextMenuListenerDependencies } from './contextMenusTypes';

export function registerFrameSelectionBridge({
  messaging,
  tabs
}: Pick<ContextMenuListenerDependencies, 'messaging' | 'tabs'>): void {
  messaging.addListener((rawMessage, sender) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return undefined;
    }
    if (!('type' in rawMessage) || rawMessage.type !== 'AIIOB_FORWARD_VIDEO_SELECTION') {
      return undefined;
    }

    const tabId = sender.tabId;
    if (typeof tabId !== 'number') {
      return { success: false, error: 'NO_TAB' };
    }

    const messagePayload = 'payload' in rawMessage ? rawMessage.payload : undefined;
    const rawPayload =
      typeof messagePayload === 'object' && messagePayload !== null ? messagePayload : {};
    const selectedHtml = 'selectedHtml' in rawPayload ? rawPayload.selectedHtml : undefined;
    const selectedText = 'selectedText' in rawPayload ? rawPayload.selectedText : undefined;
    const sourceUrl = 'sourceUrl' in rawPayload ? rawPayload.sourceUrl : undefined;
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
