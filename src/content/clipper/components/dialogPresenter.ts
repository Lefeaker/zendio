import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import { createIcon, Icons } from '@shared/utils/iconHelpers';
import {
  createContentActionRow,
  createContentLayoutElement,
  createContentSurfacePanel
} from '@ui/primitives/layout';
import { createCommentForm } from './commentForm';
import type { ReaderModeBehavior } from './dialogTypes';
import { getModifierLabel } from './dialogShortcuts';

export interface DialogPresenterBindings {
  applyText(
    element: HTMLElement,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ): void;
  applyAttr(
    element: HTMLElement,
    attribute: string,
    datasetKey: string,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ): void;
}

export interface DialogPresenterOptions {
  selectedText: string;
  initialComment: string;
  allowReaderMode: boolean;
  allowVideoMode: boolean;
  readerModeBehavior: ReaderModeBehavior;
  binder: I18nBinder | null;
  getFallback<Key extends keyof Messages>(key: Key): string;
  resolveAssetUrl(path: string): string;
  bindings: DialogPresenterBindings;
  registerI18nHandles(handles: I18nBindingHandle[]): void;
  onReader(): void;
  onVideo(): void;
  onCancel(): void;
  onConfirm(): void;
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

export function setInitialDialogPosition(container: HTMLDivElement): void {
  const viewportWidth = window.innerWidth || 800;
  const viewportHeight = window.innerHeight || 600;
  const dialogWidth = Math.min(600, viewportWidth * 0.9);
  const dialogHeight = Math.min(600, viewportHeight * 0.8);
  const initialX = (viewportWidth - dialogWidth) / 2;
  const initialY = (viewportHeight - dialogHeight) / 2;
  container.style.left = `${initialX}px`;
  container.style.top = `${initialY}px`;
  applyDialogPosition(container, 0, 0);
}

export function updateDialogPosition(
  container: HTMLElement,
  deltaX: number,
  deltaY: number,
  relative = false
): { x: number; y: number } {
  const currentX = Number(container.dataset.dx ?? 0);
  const currentY = Number(container.dataset.dy ?? 0);
  const nextX = relative ? currentX + deltaX : deltaX;
  const nextY = relative ? currentY + deltaY : deltaY;
  applyDialogPosition(container, nextX, nextY);
  return { x: nextX, y: nextY };
}

export function applyReadonlyTextareaPresentation(textarea: HTMLTextAreaElement): void {
  textarea.readOnly = true;
  textarea.style.opacity = '0.8';
  textarea.setAttribute('aria-readonly', 'true');
}

export function renderShortcutHint(
  hintElement: HTMLDivElement,
  messages: {
    header: string;
    doubleEnterLabel: string;
    doubleEnterAction: string;
    modifierAction: string;
    escapeAction: string;
  },
  platform?: string
): void {
  hintElement.hidden = false;
  hintElement.innerHTML = `
      ${messages.header}<br>
      <strong>${messages.doubleEnterLabel}</strong> ${messages.doubleEnterAction} |
      <strong>${getModifierLabel('hint', platform)}</strong> ${messages.modifierAction} |
      <strong>Esc</strong> ${messages.escapeAction}
    `;
}

export function addButtonShortcutHints(
  dialog: ParentNode,
  messages: {
    doubleEnterAction: string;
    modifierAction: string;
    escapeAction: string;
  }
): void {
  const buttons = dialog.querySelectorAll<HTMLButtonElement>(
    '.clipper-dialog-actions .clipper-btn'
  );
  buttons.forEach((element) => {
    if (element.parentElement?.classList.contains('clipper-btn-wrapper')) {
      return;
    }

    let hintText = '';
    if (element.classList.contains('clipper-btn--ghost')) {
      hintText = messages.doubleEnterAction;
    } else if (element.classList.contains('clipper-btn--primary')) {
      hintText = messages.modifierAction;
    } else if (element.classList.contains('clipper-btn--secondary')) {
      hintText = messages.escapeAction;
    }

    if (!hintText) {
      return;
    }

    wrapButtonWithHint(element, hintText);
  });
}

function applyDialogPosition(container: HTMLElement, x: number, y: number): void {
  container.dataset.dx = String(x);
  container.dataset.dy = String(y);
  container.style.transform = `translate(${x}px, ${y}px)`;
}

function wrapButtonWithHint(element: HTMLButtonElement, hintText: string): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'clipper-btn-wrapper';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '4px';

  const parent = element.parentElement;
  if (!parent) {
    return;
  }

  parent.insertBefore(wrapper, element);
  wrapper.appendChild(element);

  const hint = document.createElement('div');
  hint.className = 'clipper-shortcut-hint';
  hint.textContent = hintText;
  hint.style.fontSize = '10px';
  hint.style.color = 'var(--accent-solid, #8B5CF6)';
  hint.style.textAlign = 'center';
  hint.style.fontWeight = '500';
  hint.style.opacity = '0.8';
  hint.style.whiteSpace = 'nowrap';
  wrapper.appendChild(hint);
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
