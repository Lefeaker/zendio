/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { createDialogFrame } from '../../../../src/ui/primitives/dialog';

describe('ui dialog primitive frame', () => {
  it('creates dialog a11y markers and slots', () => {
    const frame = createDialogFrame(document, {
      title: 'Primitive dialog',
      titleId: 'dialog-title',
      modalClassName: 'modal modal-open',
      modalBoxClassName: 'modal-box',
      bodyClassName: 'body-slot',
      footerClassName: 'footer-slot',
      closeLabel: 'Close dialog'
    });

    expect(frame.modalBox.getAttribute('role')).toBe('dialog');
    expect(frame.modalBox.getAttribute('aria-modal')).toBe('true');
    expect(frame.header.dataset.element).toBe('header');
    expect(frame.body.dataset.element).toBe('body');
    expect(frame.footer.dataset.element).toBe('footer');
    expect(frame.closeButton.getAttribute('aria-label')).toBe('Close dialog');
  });
});
