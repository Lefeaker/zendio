import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import {
  createContentHintText,
  createContentLayoutElement,
  createContentSurfacePanel
} from '@ui/primitives/layout';
import { COMMENT_FORM_CLASSES } from './commentFormStyles';

export interface CommentFormMessages {
  commentLabel: string;
  commentPlaceholder: string;
}

export interface CommentFormElements {
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  preview: HTMLDivElement;
  handles: I18nBindingHandle[];
}

type CommentLabelKey = Extract<keyof Messages, 'commentLabel'>;
type CommentPlaceholderKey = Extract<keyof Messages, 'commentPlaceholder'>;

export function createCommentForm(
  messages: CommentFormMessages,
  selectedText: string,
  initialComment = '',
  binder: I18nBinder | null = null
): CommentFormElements {
  const container = createContentLayoutElement({
    className: COMMENT_FORM_CLASSES.container
  });

  const preview = createContentSurfacePanel({
    className: COMMENT_FORM_CLASSES.preview
  });
  const truncated =
    selectedText.length > 500 ? selectedText.substring(0, 501) + '...' : selectedText;
  preview.textContent = truncated;

  const label = createContentLayoutElement({
    tag: 'label',
    className: COMMENT_FORM_CLASSES.label
  });

  const textarea = document.createElement('textarea');
  textarea.id = 'clipper-comment-input';
  textarea.className = COMMENT_FORM_CLASSES.textarea;

  if (initialComment) {
    textarea.value = initialComment;
  }

  const handles: I18nBindingHandle[] = [];

  bindText(label, 'commentLabel', messages.commentLabel, binder, handles);
  bindPlaceholder(textarea, 'commentPlaceholder', messages.commentPlaceholder, binder, handles);

  container.appendChild(preview);
  container.appendChild(label);
  container.appendChild(textarea);

  const hint = createContentHintText({
    tag: 'div',
    className: COMMENT_FORM_CLASSES.completedHint
  });
  hint.hidden = true;
  container.appendChild(hint);

  return { container, textarea, preview, handles };
}

function bindText(
  element: HTMLElement,
  key: CommentLabelKey,
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

function bindPlaceholder(
  element: HTMLTextAreaElement,
  key: CommentPlaceholderKey,
  fallback: string,
  binder: I18nBinder | null,
  handles: I18nBindingHandle[]
): void {
  element.placeholder = fallback;
  element.dataset.i18nPlaceholder = key;
  if (binder) {
    handles.push(binder.bindAttr(element, 'placeholder', key));
  }
}
