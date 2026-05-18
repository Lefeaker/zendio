import { isReaderSessionActive } from '../../runtime/contentSessionRegistry';

export const DOUBLE_ENTER_TIMEOUT = 600;
export const SHORTCUT_USAGE_THRESHOLD = 5;
export const USAGE_COUNT_STORAGE_KEY = 'aiob-shortcut-usage-count';

export function isMacPlatform(platform = getNavigatorPlatform()): boolean {
  return platform.toLowerCase().includes('mac');
}

export function isPlainEnter(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey'>
): boolean {
  return (
    event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
  );
}

export function isModifierSubmitEvent(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey'>,
  platform = getNavigatorPlatform()
): boolean {
  if (event.key !== 'Enter') {
    return false;
  }

  return isMacPlatform(platform) ? event.metaKey : event.altKey;
}

export function normalizeDialogComment(comment: string | null | undefined): string {
  return comment?.trim() ?? '';
}

export function getModifierLabel(
  variant: 'hint' | 'button',
  platform = getNavigatorPlatform()
): string {
  if (isMacPlatform(platform)) {
    return variant === 'hint' ? 'Cmd+回车' : 'Cmd ↵';
  }
  return variant === 'hint' ? 'Alt+回车' : 'Alt ↵';
}

export function detectReaderMode(doc: Document): boolean {
  return Boolean(
    isReaderSessionActive(doc) ||
      doc.getElementById('aiob-reader-panel') ||
      doc.documentElement.dataset.aiobReaderActive === 'true'
  );
}

function getNavigatorPlatform(): string {
  return typeof navigator === 'undefined' ? '' : navigator.platform;
}
