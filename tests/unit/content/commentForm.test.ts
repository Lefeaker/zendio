/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';

import { createCommentForm } from '@content/clipper/components/commentForm';
import { COMMENT_FORM_CLASSES } from '@content/clipper/components/commentFormStyles';

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
    expect(container.className).toBe(COMMENT_FORM_CLASSES.container);
    expect(preview.className).toBe(COMMENT_FORM_CLASSES.preview);
    expect(textarea.className).toBe(COMMENT_FORM_CLASSES.textarea);
    expect(textarea.placeholder).toBe(SAMPLE_MESSAGES.commentPlaceholder);
    expect(preview.className).not.toContain('[#');
    expect(textarea.className).not.toContain('[#');

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

  it('moves visual contract into shared class definitions without raw color literals', () => {
    expect(COMMENT_FORM_CLASSES.preview).not.toContain('#');
    expect(COMMENT_FORM_CLASSES.textarea).not.toContain('#');
  });
});
