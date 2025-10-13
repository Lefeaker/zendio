export interface CommentFormMessages {
  commentLabel: string;
  commentPlaceholder: string;
}

export interface CommentFormElements {
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  preview: HTMLDivElement;
}

export function createCommentForm(messages: CommentFormMessages, selectedText: string, initialComment = ''): CommentFormElements {
  const container = document.createElement('div');
  container.style.cssText = `
    padding: var(--space-xl, 24px) var(--space-2xl, 28px) var(--space-2xl, 28px) var(--space-2xl, 28px);
    max-height: calc(80vh - 100px);
    overflow-y: auto;
  `;

  const preview = document.createElement('div');
  preview.style.cssText = `
    background: var(--bg-elev-1, rgba(12, 15, 30, 0.94));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-left: 3px solid var(--accent-solid, #8B5CF6);
    padding: var(--space-md, 14px) var(--space-xl, 22px);
    margin-bottom: var(--space-xl, 24px);
    border-radius: var(--radius-sm, 10px);
    max-height: 150px;
    overflow-y: auto;
    font-size: var(--font-size-base, 14px);
    color: var(--text-dim, rgba(242, 244, 255, 0.75));
    line-height: 1.6;
  `;
  preview.textContent = selectedText.substring(0, 500) + (selectedText.length > 500 ? '...' : '');

  const label = document.createElement('label');
  label.textContent = messages.commentLabel;
  label.style.cssText = `
    display: block;
    margin-bottom: var(--space-sm, 12px);
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-medium, 500);
    color: var(--text, #f2f4ff);
  `;

  const textarea = document.createElement('textarea');
  textarea.id = 'clipper-comment-input';
  textarea.placeholder = messages.commentPlaceholder;
  textarea.style.cssText = `
    width: 100%;
    min-height: 120px;
    padding: var(--space-md, 14px);
    background: var(--bg-elev-1, rgba(12, 15, 30, 0.94));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-sm, 10px);
    font-size: var(--font-size-base, 14px);
    font-family: inherit;
    color: var(--text, #f2f4ff);
    resize: vertical;
    box-sizing: border-box;
    margin-bottom: var(--space-xl, 24px);
    transition: box-shadow var(--transition-base, 0.2s ease), border-color var(--transition-base, 0.2s ease);
  `;

  textarea.style.caretColor = 'var(--accent-solid, #8B5CF6)';

  const placeholderStyle = document.createElement('style');
  placeholderStyle.textContent = `#${textarea.id}::placeholder { color: var(--text-muted, rgba(242, 244, 255, 0.55)); }`;

  if (initialComment) {
    textarea.value = initialComment;
  }

  textarea.addEventListener('focus', () => {
    textarea.style.boxShadow = 'var(--ring, 0 0 0 3px rgba(124, 92, 255, 0.35))';
    textarea.style.borderColor = 'var(--accent-solid, #8B5CF6)';
  });
  textarea.addEventListener('blur', () => {
    textarea.style.boxShadow = 'none';
    textarea.style.borderColor = 'var(--border, rgba(255, 255, 255, 0.12))';
  });

  container.appendChild(preview);
  container.appendChild(label);
  container.appendChild(textarea);
  container.appendChild(placeholderStyle);

  return { container, textarea, preview };
}
