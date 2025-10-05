/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

const getMessagesMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  getMessages: (...args: unknown[]) => getMessagesMock(...args)
}));

vi.mock('../../src/content/clipper/components/commentForm', async () => {
  const actual = await vi.importActual<typeof import('../../src/content/clipper/components/commentForm')>(
    '../../src/content/clipper/components/commentForm'
  );
  return actual;
});

const dialogMessages = {
  clipDialogTitle: 'Clip Selection',
  cancelButton: 'Cancel',
  clipButton: 'Save',
  commentLabel: 'Comment',
  commentPlaceholder: 'Add a note'
};

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      constructor(type: string, init?: PointerEventInit) {
        super(type, init);
      }
    }
    (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  }
});

describe('ClipperDialog UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessagesMock.mockResolvedValue(dialogMessages);
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('resolves with trimmed comment on confirm and removes dialog', async () => {
    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const resultPromise = dialog.show('Hello world');
    await flushPromises();

    const dialogElement = document.getElementById('obsidian-clipper-dialog');
    expect(dialogElement?.getAttribute('role')).toBe('dialog');
    expect(dialogElement?.getAttribute('aria-modal')).toBe('true');

    const textarea = document.getElementById('clipper-comment-input') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    if (!textarea) throw new Error('textarea missing');
    expect(document.activeElement).toBe(textarea);

    textarea.value = '  note  ';
    const confirmBtn = document.querySelector('#obsidian-clipper-dialog .clipper-btn--primary') as HTMLButtonElement | null;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();

    const result = await resultPromise;
    expect(result).toEqual({ action: 'clip', comment: 'note' });
    expect(document.getElementById('obsidian-clipper-dialog')).toBeNull();
  });

  it('resolves with cancelled status when cancel button clicked', async () => {
    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const resultPromise = dialog.show('Selection');
    await flushPromises();

    const cancelBtn = document.querySelector('#obsidian-clipper-dialog .clipper-btn--secondary') as HTMLButtonElement | null;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();

    const result = await resultPromise;
    expect(result).toEqual({ action: 'cancel', comment: '' });
    expect(document.getElementById('obsidian-clipper-dialog')).toBeNull();
  });

  it('updates dialog position when dragged', async () => {
    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const promise = dialog.show('Another selection');
    await flushPromises();

    const container = document.querySelector('#obsidian-clipper-dialog > div') as HTMLElement | null;
    expect(container).not.toBeNull();
    if (!container) throw new Error('dialog container missing');

    const header = container.querySelector('.clipper-dialog-header') as HTMLElement | null;
    expect(header).not.toBeNull();
    if (!header) throw new Error('dialog header missing');

    const initialTransform = container.style.transform;

    header.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 200 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 230, clientY: 240 }));
    document.dispatchEvent(new PointerEvent('pointerup', {}));

    const transform = container.style.transform;
    expect(transform).toMatch(/translate\(/);
    expect(transform).not.toBe(initialTransform);

    // resolve pending promise to avoid dangling handlers
    const buttons = document.querySelectorAll('#obsidian-clipper-dialog button');
    if (buttons[1]) {
      (buttons[1] as HTMLButtonElement).click();
      await promise;
    }
  });

  it('closes on Escape and restores previous focus', async () => {
    const focusTarget = document.createElement('button');
    document.body.appendChild(focusTarget);
    focusTarget.focus();

    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const resultPromise = dialog.show('Escape me');
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const result = await resultPromise;
    expect(result).toEqual({ action: 'cancel', comment: '' });
    await flushPromises();
    expect(document.activeElement).toBe(focusTarget);
  });

  it('traps focus within the dialog when tabbing', async () => {
    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const promise = dialog.show('Focus sample');
    await flushPromises();

    const textarea = document.getElementById('clipper-comment-input') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    const buttons = Array.from(document.querySelectorAll('#obsidian-clipper-dialog button')) as HTMLButtonElement[];
    const confirmBtn = buttons.at(1);
    expect(confirmBtn).toBeTruthy();
    confirmBtn?.focus();

    const dialogElement = document.getElementById('obsidian-clipper-dialog');
    confirmBtn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(dialogElement?.contains(document.activeElement as HTMLElement | null)).toBe(true);

    textarea?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(dialogElement?.contains(document.activeElement as HTMLElement | null)).toBe(true);

    const cancelBtn = document.querySelector('#obsidian-clipper-dialog button') as HTMLButtonElement | null;
    cancelBtn?.click();
    await promise;
  });

  it('supports keyboard repositioning with Alt + Arrow keys', async () => {
    const { ClipperDialog } = await import('../../src/content/clipper/components/dialog');
    const dialog = new ClipperDialog();

    const promise = dialog.show('Keyboard move');
    await flushPromises();

    const container = document.querySelector('#obsidian-clipper-dialog > div') as HTMLElement | null;
    expect(container).not.toBeNull();
    if (!container) throw new Error('dialog container missing');

    const initialTransform = container.style.transform;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
    const afterTransform = container.style.transform;
    expect(afterTransform).toMatch(/translate\(/);
    expect(afterTransform).not.toBe(initialTransform);

    const cancelBtn = document.querySelector('#obsidian-clipper-dialog button') as HTMLButtonElement | null;
    cancelBtn?.click();
    await promise;
  });
});
