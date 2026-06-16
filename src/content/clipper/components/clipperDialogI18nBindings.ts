import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import type { ReaderModeBehavior } from './dialogTypes';

const FALLBACK_MESSAGES: Partial<Messages> = {
  clipDialogTitle: 'Clip Selection',
  clipDialogInstructions:
    'Use Tab to move between controls. Press Alt + Arrow keys to reposition the dialog.',
  cancelButton: 'Cancel',
  clipButton: 'Save',
  openReaderButton: 'Open reader',
  addToReaderButton: 'Add to reader',
  openVideoModeButton: 'Enter video mode',
  commentLabel: 'Comment',
  commentPlaceholder: 'Add a note',
  clipperCommentEditCompleted:
    'Comment editing completed, you can use keyboard shortcuts to complete the following actions:',
  clipperShortcutHintDoubleEnter: 'Double-Enter',
  clipperShortcutDoubleEnter: 'Double ↵',
  clipperShortcutHintModifierEnter: 'Clip directly',
  clipperShortcutModifierEnter: 'Cmd ↵',
  clipperShortcutHintEscape: 'Cancel',
  clipperShortcutEsc: 'Esc',
  clipperShortcutSetupLink: 'Set up shortcuts for smoother experience'
};

interface PrepareClipperDialogI18nSurfaceOptions {
  surface: HTMLElement;
  binder: I18nBinder | null;
  handles: I18nBindingHandle[];
  initialComment: string;
  readerModeBehavior: ReaderModeBehavior;
  getFallback<Key extends keyof Messages>(this: void, key: Key): string;
}

export function getClipperDialogFallback<Key extends keyof Messages>(key: Key): string {
  return (FALLBACK_MESSAGES[key] as string) ?? '';
}

export function resolveClipperDialogMessage<Key extends keyof Messages>(
  messages: Messages | null,
  key: Key,
  fallback: string
): string {
  const source = messages?.[key];
  if (typeof source === 'string' && source.length > 0) {
    return source;
  }
  return fallback;
}

export function disposeClipperDialogI18nHandles(handles: I18nBindingHandle[]): void {
  if (!handles.length) {
    return;
  }

  for (const handle of handles) {
    handle.dispose();
  }
  handles.length = 0;
}

export function prepareClipperDialogI18nSurface({
  surface,
  binder,
  handles,
  initialComment,
  readerModeBehavior,
  getFallback
}: PrepareClipperDialogI18nSurfaceOptions): void {
  const textarea = surface.querySelector<HTMLTextAreaElement>('.clipper-comment-textarea');
  const title = surface.querySelector<HTMLElement>('.surface-window-title');
  if (title) {
    applyText(title, 'clipDialogTitle', getFallback('clipDialogTitle'), binder, handles);
  }
  const instructions = document.createElement('p');
  instructions.id = 'clipper-dialog-instructions';
  instructions.className = 'sr-only';
  Object.assign(instructions.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0'
  });
  applyText(
    instructions,
    'clipDialogInstructions',
    getFallback('clipDialogInstructions'),
    binder,
    handles
  );
  surface.appendChild(instructions);
  if (textarea) {
    textarea.id = 'clipper-comment-input';
    textarea.value = initialComment;
    applyAttr(
      textarea,
      'aria-label',
      'i18nAriaLabel',
      'commentLabel',
      getFallback('commentLabel'),
      binder,
      handles
    );
  }

  const bindings: Array<[string, keyof Messages]> = [
    ['reader', readerModeBehavior === 'append' ? 'addToReaderButton' : 'openReaderButton'],
    ['clip', 'clipButton']
  ];
  bindings.forEach(([actionId, key]) => {
    const button = surface.querySelector<HTMLElement>(`[data-action-id="${actionId}"]`);
    if (button) {
      applyText(
        button.querySelector<HTMLElement>('span') ?? button,
        key,
        button.textContent ?? '',
        binder,
        handles
      );
    }
  });
}

function applyText(
  element: HTMLElement,
  key: keyof Messages,
  fallback: string,
  binder: I18nBinder | null,
  handles: I18nBindingHandle[]
): void {
  element.textContent = fallback;
  element.dataset.i18n = key;
  if (binder) {
    handles.push(binder.bindText(element, key));
  }
}

function applyAttr(
  element: HTMLElement,
  attribute: string,
  datasetKey: string,
  key: keyof Messages,
  fallback: string,
  binder: I18nBinder | null,
  handles: I18nBindingHandle[]
): void {
  element.setAttribute(attribute, fallback);
  (element.dataset as Record<string, string>)[datasetKey] = key;
  if (binder) {
    handles.push(binder.bindAttr(element, attribute, key));
  }
}
