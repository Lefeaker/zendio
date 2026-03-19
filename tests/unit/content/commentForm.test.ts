/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';

import { createCommentForm } from '@content/clipper/components/commentForm';

const SAMPLE_MESSAGES = {
  commentLabel: 'Comment',
  commentPlaceholder: 'Leave a note'
};

describe('commentForm component', () => {
  it('renders structure with decoupled class names', () => {
    const selectedText = 'Selected snippet';
    const { container, preview, textarea } = createCommentForm(SAMPLE_MESSAGES, selectedText);

    expect(container.classList.contains('clipper-comment-form')).toBe(true);
    expect(preview.classList.contains('clipper-comment-preview')).toBe(true);
    expect(container.querySelector('.clipper-comment-label')).not.toBeNull();
    expect(textarea.classList.contains('clipper-comment-textarea')).toBe(true);
    expect(textarea.placeholder).toBe(SAMPLE_MESSAGES.commentPlaceholder);

    // structure should not rely on inline styles
    expect(container.getAttribute('style')).toBeNull();
    expect(preview.getAttribute('style')).toBeNull();
    expect(textarea.getAttribute('style')).toBeNull();
  });

  it('does not introduce inline styles when focus/blur events fire', () => {
    const { textarea } = createCommentForm(SAMPLE_MESSAGES, 'Focus sample');

    textarea.dispatchEvent(new FocusEvent('focus'));
    expect(textarea.getAttribute('style')).toBeNull();

    textarea.dispatchEvent(new FocusEvent('blur'));
    expect(textarea.getAttribute('style')).toBeNull();
  });

  it('pre-populates textarea with initial comment and truncates preview content', () => {
    const longText = 'a'.repeat(600);
    const { preview, textarea } = createCommentForm(SAMPLE_MESSAGES, longText, 'Existing note');

    expect(textarea.value).toBe('Existing note');
    expect(preview.textContent).toHaveLength(504); // 500 chars + ellipsis
    expect(preview.textContent?.endsWith('...')).toBe(true);
  });
});
