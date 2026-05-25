import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import { createIcon, Icons } from '@shared/utils/iconHelpers';
import {
  createContentActionRow,
  createContentLayoutElement,
  createContentSurfacePanel
} from '@ui/primitives/layout';
import { createCommentForm } from './commentForm';
import type { ReaderModeBehavior } from './dialogTypes';

export interface DialogPresenterBindings {
  applyText: (
    element: HTMLElement,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ) => void;
  applyAttr: (
    element: HTMLElement,
    attribute: string,
    datasetKey: string,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ) => void;
}

export interface DialogPresenterOptions {
  selectedText: string;
  initialComment: string;
  allowReaderMode: boolean;
  allowVideoMode: boolean;
  readerModeBehavior: ReaderModeBehavior;
  binder: I18nBinder | null;
  getFallback: <Key extends keyof Messages>(key: Key) => string;
  resolveAssetUrl: (path: string) => string;
  bindings: DialogPresenterBindings;
  registerI18nHandles: (handles: I18nBindingHandle[]) => void;
  onReader: () => void;
  onVideo: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export interface DialogPresenterElements {
  content: HTMLDivElement;
  header: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  hintElement: HTMLDivElement | null;
}

export function buildDialogPresenter(options: DialogPresenterOptions): DialogPresenterElements {
  const {
    selectedText,
    initialComment,
    allowReaderMode,
    allowVideoMode,
    readerModeBehavior,
    binder,
    getFallback,
    resolveAssetUrl,
    bindings,
    registerI18nHandles,
    onReader,
    onVideo,
    onCancel,
    onConfirm
  } = options;

  const content = createContentSurfacePanel({
    className: 'clipper-dialog-shell'
  });

  const header = createContentActionRow({
    className: 'clipper-dialog-header'
  });

  const title = document.createElement('h2');
  title.className = 'clipper-dialog-title';
  title.id = 'obsidian-clipper-title';

  const titleIcon = document.createElement('img');
  titleIcon.className = 'clipper-dialog-icon';
  titleIcon.alt = '';
  titleIcon.src = resolveAssetUrl('icons/allinob_icon_commentt.png');

  const titleLabel = document.createElement('span');
  bindings.applyText(titleLabel, 'clipDialogTitle', getFallback('clipDialogTitle'), binder);
  title.append(titleIcon, titleLabel);
  header.appendChild(title);
  content.appendChild(header);

  const instructions = document.createElement('p');
  instructions.id = 'clipper-dialog-instructions';
  instructions.className = 'clipper-sr-only';
  bindings.applyText(
    instructions,
    'clipDialogInstructions',
    getFallback('clipDialogInstructions'),
    binder
  );
  content.appendChild(instructions);

  const divider = createContentLayoutElement({ className: 'clipper-dialog-divider' });
  content.appendChild(divider);

  const commentForm = createCommentForm(
    {
      commentLabel: getFallback('commentLabel'),
      commentPlaceholder: getFallback('commentPlaceholder')
    },
    selectedText,
    initialComment,
    binder
  );
  registerI18nHandles(commentForm.handles);

  const textarea = commentForm.textarea;
  bindings.applyAttr(
    textarea,
    'aria-label',
    'i18nAriaLabel',
    'commentLabel',
    getFallback('commentLabel'),
    binder
  );
  const hintElement = commentForm.container.querySelector<HTMLDivElement>(
    '.clipper-comment-completed-hint'
  );
  content.appendChild(commentForm.container);

  content.setAttribute(
    'aria-describedby',
    [textarea.id, instructions.id].filter(Boolean).join(' ')
  );

  const actions = createContentActionRow({
    className: 'clipper-dialog-actions'
  });

  if (allowReaderMode) {
    const readerIcon = createIcon(Icons.ChevronRight, {
      size: 16,
      className: 'clipper-btn-icon'
    });
    readerIcon.setAttribute('aria-hidden', 'true');
    actions.appendChild(
      createGhostButton(
        binder,
        readerModeBehavior === 'append' ? 'addToReaderButton' : 'openReaderButton',
        readerModeBehavior === 'append'
          ? getFallback('addToReaderButton')
          : getFallback('openReaderButton'),
        readerIcon,
        bindings,
        onReader
      )
    );
  }

  if (allowVideoMode) {
    const videoIcon = createIcon(Icons.ChevronRight, {
      size: 16,
      className: 'clipper-btn-icon'
    });
    videoIcon.setAttribute('aria-hidden', 'true');
    actions.appendChild(
      createGhostButton(binder, 'openVideoModeButton', '进入视频模式', videoIcon, bindings, onVideo)
    );
  }

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'clipper-btn clipper-btn--secondary';
  bindings.applyText(cancelButton, 'cancelButton', getFallback('cancelButton'), binder);
  cancelButton.addEventListener('click', onCancel);
  actions.appendChild(cancelButton);

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'clipper-btn clipper-btn--primary';
  const confirmContent = document.createElement('span');
  confirmContent.className = 'clipper-btn-content';
  const confirmIcon = createIcon(Icons.Check, {
    size: 18,
    className: 'clipper-btn-icon'
  });
  confirmIcon.setAttribute('aria-hidden', 'true');
  const confirmLabel = document.createElement('span');
  confirmLabel.classList.add('btn-adaptive');
  bindings.applyText(confirmLabel, 'clipButton', getFallback('clipButton'), binder);
  confirmContent.append(confirmIcon, confirmLabel);
  confirmButton.appendChild(confirmContent);
  confirmButton.addEventListener('click', onConfirm);
  actions.appendChild(confirmButton);

  content.appendChild(actions);
  return {
    content,
    header,
    textarea,
    hintElement
  };
}

function createGhostButton(
  binder: I18nBinder | null,
  messageKey: keyof Messages,
  fallback: string,
  icon: SVGElement,
  bindings: DialogPresenterBindings,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'clipper-btn clipper-btn--ghost';

  const content = document.createElement('span');
  content.className = 'clipper-btn-content';

  icon.classList.add('clipper-btn-icon');
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  bindings.applyText(label, messageKey, fallback, binder);

  content.append(icon, label);
  button.appendChild(content);
  button.addEventListener('click', onClick);
  return button;
}
