import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';

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
  const container = document.createElement('div');
  container.className = 'clipper-comment-form p-[24px_28px] max-h-[calc(80vh-100px)] overflow-y-auto';

  const preview = document.createElement('div');
  preview.className = 'clipper-comment-preview bg-[#0c0f1e]/94 border border-white/12 border-l-[3px] border-l-[#8B5CF6] p-[14px_22px] mb-6 rounded-[10px] max-h-[150px] overflow-y-auto text-sm text-[#f2f4ff]/75 leading-relaxed';
  const truncated = selectedText.length > 500
    ? selectedText.substring(0, 501) + '...'
    : selectedText;
  preview.textContent = truncated;

  const label = document.createElement('label');
  label.className = 'clipper-comment-label block mb-3 text-sm font-medium text-[#f2f4ff]';

  const textarea = document.createElement('textarea');
  textarea.id = 'clipper-comment-input';
  textarea.className = 'clipper-comment-textarea w-full min-h-[120px] p-[14px] bg-[#0c0f1e]/94 border border-white/12 rounded-[10px] text-sm font-inherit text-[#f2f4ff] resize-y box-border mb-6 transition-[box-shadow,border-color] duration-200 ease-out caret-[#8B5CF6] placeholder:text-[#f2f4ff]/55 focus:shadow-[0_0_0_3px_rgba(124,92,255,0.35)] focus:border-[#8B5CF6] focus:outline-none';

  if (initialComment) {
    textarea.value = initialComment;
  }

  const handles: I18nBindingHandle[] = [];

  bindText(label, 'commentLabel', messages.commentLabel, binder, handles);
  bindPlaceholder(textarea, 'commentPlaceholder', messages.commentPlaceholder, binder, handles);

  container.appendChild(preview);
  container.appendChild(label);
  container.appendChild(textarea);

  const hint = document.createElement('div');
  hint.className = 'clipper-comment-completed-hint hidden mt-2 text-xs text-[#f2f4ff]/70';
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
