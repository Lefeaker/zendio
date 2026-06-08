/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  VideoPanelCallbacks,
  VideoPanelTexts,
  VideoPanelCapture
} from '@content/video/application/videoPanelModel';
import { VideoDialogPanel } from '@content/video/ui/VideoDialogPanel';
import { testPlatformHarness } from '../../../setup/globalSetup';

const callbacks: VideoPanelCallbacks = {
  onAddCapture: vi.fn(),
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteCapture: vi.fn(),
  onSubmitCaptureEdit: vi.fn(),
  onToggleScreenshot: vi.fn(),
  onFocusCapture: vi.fn()
};

const texts: VideoPanelTexts = {
  title: 'Video Panel',
  status: 'Ready',
  counter: '{count} captures',
  counterZero: 'No captures',
  add: 'Add',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Pick a moment',
  captureEditLabel: 'Edit',
  captureDeleteLabel: 'Delete',
  captureNoComment: 'Add comment',
  captureSaveLabel: 'Save',
  captureCancelLabel: 'Cancel',
  captureEditPlaceholder: 'Write a note',
  fragmentEditPlaceholder: 'Annotate selected text',
  captureFocusLabel: 'Focus {index}'
};

function createCapture(overrides: Partial<VideoPanelCapture> = {}): VideoPanelCapture {
  return {
    id: 'capture-1',
    index: 1,
    kind: 'timestamp',
    timeLabel: '00:42',
    timeSeconds: 42,
    comment: '',
    commentPreview: '',
    shareUrl: 'https://example.com?t=42',
    ...overrides
  };
}

function createCaptures(count: number): VideoPanelCapture[] {
  return Array.from({ length: count }, (_, index) =>
    createCapture({
      id: `capture-${index + 1}`,
      index: index + 1,
      timeLabel: `0${index}:0${index}`,
      comment: `saved note ${index + 1}`,
      commentPreview: `saved note ${index + 1}`,
      hasScreenshot: false
    })
  );
}

function flushPanelPersistence(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function requireCaptureInput(panel: VideoDialogPanel, id: string): HTMLInputElement {
  const input =
    panel.element.shadowRoot?.querySelector<HTMLInputElement>(`[data-capture-input="${id}"]`) ??
    null;
  if (!input) {
    throw new Error(`capture input missing: ${id}`);
  }
  return input;
}

describe('VideoDialogPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders the Stitch dialog actions and updates captures without Daisy modal chrome', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture()]);

    const shadow = panel.element.shadowRoot;
    const surface = shadow?.querySelector<HTMLElement>('[data-stitch-surface="video"]');
    const modal = shadow?.querySelector<HTMLElement>('[data-element="dialog"]');
    expect(shadow?.querySelector('[data-role="finish-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="close-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="add-btn"]')).toBeTruthy();
    expect(
      shadow?.querySelector('.session-footer-actions [data-action-id="video:add"]')
    ).toBeNull();
    expect(
      shadow?.querySelector('.session-add-capture-button[data-action-id="video:add"]')
    ).toBeTruthy();
    const addNoteInput = shadow?.querySelector<HTMLInputElement>(
      '.session-add-capture-card [data-action-id="video:add-note"]'
    );
    expect(addNoteInput).toBeInstanceOf(HTMLInputElement);
    expect(addNoteInput?.disabled).toBe(false);
    expect(addNoteInput?.readOnly).toBe(true);
    expect(shadow?.querySelector('[data-action-id="video:save"]')).toBeNull();
    expect(shadow?.querySelector('[data-capture-id] .session-item-actions')).toBeNull();
    expect(
      shadow?.querySelector(
        '[data-capture-id] .session-item-close-trigger[data-action-id="video:delete"]'
      )
    ).toBeTruthy();
    expect(shadow?.querySelector('[data-role="capture-item"]')).toBeTruthy();
    expect(
      shadow?.querySelector('.surface-window-header [data-action-id="resource:close"]')
    ).toBeNull();
    expect(surface?.classList.contains('modal')).toBe(false);
    expect(surface?.classList.contains('modal-open')).toBe(false);
    expect(
      shadow?.querySelector('style[data-aiob-style-bridge="panel-clipper-tailwind"]')
    ).toBeNull();
    expect(
      shadow?.querySelector('style[data-aiob-style-bridge="panel-video-tailwind"]')
    ).toBeNull();
    expect(surface?.style.pointerEvents).toBe('none');
    expect(surface?.classList.contains('floating-bottom-right')).toBe(true);
    expect(modal?.style.pointerEvents).toBe('auto');
    expect(modal?.classList.contains('floating-bottom-right')).toBe(true);
    expect(modal?.getAttribute('aria-modal')).toBe('false');

    panel.destroy();
  });

  it('routes the inline add and item close buttons to video callbacks', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture()]);

    const shadow = panel.element.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:add"]')?.click();
    shadow?.querySelector<HTMLInputElement>('[data-action-id="video:add-note"]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:toggle-screenshot"]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:delete"]')?.click();
    await flushPanelPersistence();

    expect(callbacks.onAddCapture).toHaveBeenCalledTimes(2);
    expect(callbacks.onAddCapture).toHaveBeenNthCalledWith(1, 'button');
    expect(callbacks.onAddCapture).toHaveBeenNthCalledWith(2, 'note-input');
    expect(callbacks.onToggleScreenshot).toHaveBeenCalledWith('capture-1');
    expect(callbacks.onDeleteCapture).toHaveBeenCalledWith('capture-1');

    panel.destroy();
  });

  it('renders timestamp screenshot toggles before the timestamp as gray or green dots', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([
      createCapture({ id: 'no-shot', hasScreenshot: false }),
      createCapture({ id: 'with-shot', hasScreenshot: true })
    ]);

    const shadow = panel.element.shadowRoot;
    const off = shadow?.querySelector<HTMLButtonElement>(
      '[data-capture-id="no-shot"] [data-action-id="video:toggle-screenshot"]'
    );
    const on = shadow?.querySelector<HTMLButtonElement>(
      '[data-capture-id="with-shot"] [data-action-id="video:toggle-screenshot"]'
    );
    const markerChildren = Array.from(
      shadow?.querySelector('[data-capture-id="no-shot"] .video-timestamp-marker')?.children ?? []
    );

    expect(markerChildren[0]).toBe(off);
    expect(markerChildren[1]?.classList.contains('session-item-marker-time')).toBe(true);
    expect(off?.classList.contains('is-off')).toBe(true);
    expect(off?.getAttribute('aria-label')).toBe('Capture screenshot');
    expect(on?.classList.contains('is-on')).toBe(true);
    expect(on?.getAttribute('aria-label')).toBe('Remove screenshot');

    panel.destroy();
  });

  it('focuses captured timestamps from the item marker without relying on note focus', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture()]);

    const shadow = panel.element.shadowRoot;
    shadow
      ?.querySelector<HTMLElement>('[data-capture-id="capture-1"] .session-item-marker')
      ?.click();

    expect(callbacks.onFocusCapture).toHaveBeenCalledTimes(1);
    expect(callbacks.onFocusCapture).toHaveBeenCalledWith('capture-1');

    vi.mocked(callbacks.onFocusCapture).mockClear();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:toggle-screenshot"]')?.click();
    shadow?.querySelector<HTMLInputElement>('[data-capture-input]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:delete"]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:add"]')?.click();
    shadow?.querySelector<HTMLInputElement>('[data-action-id="video:add-note"]')?.click();

    expect(callbacks.onFocusCapture).not.toHaveBeenCalled();

    panel.destroy();
  });

  it('begins editing an existing capture and focuses the note input', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const capture = createCapture({ comment: 'draft', commentPreview: 'draft' });
    panel.show();
    panel.setCaptures([capture]);
    panel.beginEditingCapture(capture.id, capture.comment);

    const input =
      panel.element.shadowRoot?.querySelector<HTMLInputElement>('[data-capture-input]') ?? null;
    expect(input).toBeTruthy();
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).not.toBeInstanceOf(HTMLTextAreaElement);
    expect(input?.value).toBe('draft');
    expect(panel.element.shadowRoot?.querySelector('textarea[data-capture-input]')).toBeNull();
    await Promise.resolve();
    expect(panel.element.shadowRoot?.activeElement).toBe(input);

    panel.destroy();
  });

  it('reports capture editor focus and blur lifecycle events', async () => {
    const lifecycleCallbacks: VideoPanelCallbacks & {
      onCaptureEditorFocus: ReturnType<typeof vi.fn>;
      onCaptureEditorBlur: ReturnType<typeof vi.fn>;
    } = {
      ...callbacks,
      onCaptureEditorFocus: vi.fn(),
      onCaptureEditorBlur: vi.fn()
    };
    const panel = new VideoDialogPanel({ callbacks: lifecycleCallbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }

    const cancelButton = panel.element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-action-id="video:cancel"]'
    );
    expect(cancelButton).toBeTruthy();
    if (!cancelButton) {
      throw new Error('cancel button missing');
    }

    input.dispatchEvent(new FocusEvent('focus'));
    input.dispatchEvent(new FocusEvent('blur', { relatedTarget: cancelButton }));
    input.dispatchEvent(new FocusEvent('blur'));

    expect(lifecycleCallbacks.onCaptureEditorFocus).toHaveBeenCalledWith('capture-1');
    expect(lifecycleCallbacks.onCaptureEditorBlur).toHaveBeenNthCalledWith(
      1,
      'capture-1',
      'inside-panel'
    );
    expect(lifecycleCallbacks.onCaptureEditorBlur).toHaveBeenCalledWith(
      'capture-1',
      'outside-panel'
    );

    panel.destroy();
  });

  it('does not report outside blur when internal rerender replaces the active editor', async () => {
    const lifecycleCallbacks: VideoPanelCallbacks & {
      onCaptureEditorBlur: ReturnType<typeof vi.fn>;
      onCaptureEditorFocus: ReturnType<typeof vi.fn>;
    } = {
      ...callbacks,
      onCaptureEditorBlur: vi.fn(),
      onCaptureEditorFocus: vi.fn()
    };
    const panel = new VideoDialogPanel({ callbacks: lifecycleCallbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }

    input.focus();
    expect(panel.element.shadowRoot?.activeElement).toBe(input);

    panel.updateHint('Saving');

    expect(lifecycleCallbacks.onCaptureEditorBlur).not.toHaveBeenCalledWith(
      'capture-1',
      'outside-panel'
    );

    panel.destroy();
  });

  it('preserves unsaved capture note drafts when additional captures render', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const first = createCapture({ id: 'capture-1', index: 1, timeLabel: '00:42' });
    const second = createCapture({ id: 'capture-2', index: 2, timeLabel: '01:10' });
    panel.show();
    panel.setCaptures([first, second]);
    panel.beginEditingCapture(second.id, second.comment);

    const secondInput = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-2"]'
    );
    expect(secondInput).toBeTruthy();
    if (!secondInput) {
      throw new Error('second capture input missing');
    }
    secondInput.value = 'second capture draft';
    secondInput.dispatchEvent(new Event('input', { bubbles: true }));

    panel.setCaptures([
      first,
      second,
      createCapture({ id: 'capture-3', index: 3, timeLabel: '02:20' })
    ]);

    expect(
      panel.element.shadowRoot?.querySelector<HTMLInputElement>('[data-capture-input="capture-2"]')
        ?.value
    ).toBe('second capture draft');

    panel.destroy();
  });

  it('stops only the requested capture editor when another capture remains active', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures(createCaptures(6));
    panel.beginEditingCapture('capture-6', '');
    await Promise.resolve();

    const sixthInput = requireCaptureInput(panel, 'capture-6');
    sixthInput.value = 'sixth draft must stay active';
    sixthInput.dispatchEvent(new Event('input', { bubbles: true }));

    panel.stopEditing('capture-1');

    expect(requireCaptureInput(panel, 'capture-6').value).toBe('sixth draft must stay active');
    expect(panel.snapshotCommentDrafts()).toEqual({
      'capture-6': 'sixth draft must stay active'
    });

    panel.destroy();
  });

  it.each([1, 2, 5, 6, 7, 8, 12])(
    'preserves active draft at the last capture across unrelated rerenders for %i captures',
    async (count) => {
      const panel = new VideoDialogPanel({ callbacks, texts });
      panel.show();
      panel.setCaptures(createCaptures(count));
      const activeId = `capture-${count}`;
      panel.beginEditingCapture(activeId, '');
      await Promise.resolve();

      const draft = `draft for ${activeId}`;
      const activeInput = requireCaptureInput(panel, activeId);
      activeInput.value = draft;
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));

      panel.updateHint('Saving');
      panel.setCaptures(createCaptures(count).map((capture) => ({ ...capture })));

      expect(requireCaptureInput(panel, activeId).value).toBe(draft);
      expect(panel.snapshotCommentDrafts()).toMatchObject({ [activeId]: draft });

      panel.destroy();
    }
  );

  it('keeps later timestamp drafts stable across six-capture rerenders and screenshot refreshes', async () => {
    const longComment =
      'Capture 5 saved comment that should not replace the live draft during video panel rerenders.';
    const truncatedPreview = 'Capture 5 saved comment that should not replace the live draft...';
    const captures = Array.from({ length: 6 }, (_, index) =>
      createCapture({
        id: `capture-${index + 1}`,
        index: index + 1,
        timeLabel: `0${index}:0${index}`,
        comment: index === 4 ? longComment : `saved note ${index + 1}`,
        commentPreview: index === 4 ? truncatedPreview : `saved note ${index + 1}`,
        hasScreenshot: false
      })
    );
    let nextCaptures = captures.map((capture) => ({ ...capture }));
    let panel: VideoDialogPanel | null = null;
    const panelCallbacks: VideoPanelCallbacks = {
      ...callbacks,
      onToggleScreenshot: vi.fn((id: string) => {
        nextCaptures = nextCaptures.map((capture) =>
          capture.id === id ? { ...capture, hasScreenshot: !capture.hasScreenshot } : capture
        );
        panel?.setCaptures(nextCaptures);
      })
    };

    panel = new VideoDialogPanel({ callbacks: panelCallbacks, texts });
    panel.show();
    panel.setCaptures(nextCaptures);

    const draftValue =
      'Capture 5 full draft note that must survive editing another timestamp and all rerenders.';
    const captureFiveInput = requireCaptureInput(panel, 'capture-5');
    captureFiveInput.value = draftValue;
    captureFiveInput.dispatchEvent(new Event('input', { bubbles: true }));

    const captureOneInput = requireCaptureInput(panel, 'capture-1');
    captureOneInput.value = 'capture 1 live edit';
    captureOneInput.dispatchEvent(new Event('input', { bubbles: true }));

    panel.updateHint('Saving');
    expect(requireCaptureInput(panel, 'capture-5').value).toBe(draftValue);

    panel.setCaptures(nextCaptures.map((capture) => ({ ...capture })));
    expect(requireCaptureInput(panel, 'capture-5').value).toBe(draftValue);

    panel.element.shadowRoot
      ?.querySelector<HTMLButtonElement>(
        '[data-capture-id="capture-1"] [data-action-id="video:toggle-screenshot"]'
      )
      ?.click();
    await flushPanelPersistence();

    expect(panelCallbacks.onToggleScreenshot).toHaveBeenCalledWith('capture-1');
    expect(requireCaptureInput(panel, 'capture-5').value).toBe(draftValue);

    panel.destroy();
  });

  it('flushes unsaved capture note drafts before finishing', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    input.value = 'finish capture draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    panel.element.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="finish-btn"]')?.click();
    await flushPanelPersistence();

    expect(callbacks.onSubmitCaptureEdit).toHaveBeenCalledWith('capture-1', 'finish capture draft');
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callbacks.onSubmitCaptureEdit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(callbacks.onFinish).mock.invocationCallOrder[0] ?? 0
    );

    panel.destroy();
  });

  it('keeps ordinary note input keys from reaching host page shortcuts', async () => {
    const hostKeydown = vi.fn();
    const hostKeyup = vi.fn();
    const hostKeypress = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    document.addEventListener('keyup', hostKeyup);
    document.addEventListener('keypress', hostKeypress);
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }

    for (const key of ['l', ' ', 'm']) {
      input.value = key;
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, composed: true }));
    }

    expect(hostKeydown).not.toHaveBeenCalled();
    expect(hostKeypress).not.toHaveBeenCalled();
    expect(hostKeyup).not.toHaveBeenCalled();
    expect(input.value).toBe('m');

    document.removeEventListener('keydown', hostKeydown);
    document.removeEventListener('keyup', hostKeyup);
    document.removeEventListener('keypress', hostKeypress);
    panel.destroy();
  });

  it('keeps ordinary note input keys from reaching later capture listeners', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();
    const hostCaptureKeydown = vi.fn();
    const hostCaptureKeyup = vi.fn();
    const hostCaptureKeypress = vi.fn();
    document.addEventListener('keydown', hostCaptureKeydown, true);
    document.addEventListener('keyup', hostCaptureKeyup, true);
    document.addEventListener('keypress', hostCaptureKeypress, true);

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, composed: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'l', bubbles: true, composed: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', bubbles: true, composed: true }));

    expect(hostCaptureKeydown).not.toHaveBeenCalled();
    expect(hostCaptureKeypress).not.toHaveBeenCalled();
    expect(hostCaptureKeyup).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostCaptureKeydown, true);
    document.removeEventListener('keyup', hostCaptureKeyup, true);
    document.removeEventListener('keypress', hostCaptureKeypress, true);
    panel.destroy();
  });

  it('keeps unowned Escape from reaching host page shortcuts', async () => {
    const hostKeydown = vi.fn();
    const hostKeyup = vi.fn();
    const hostKeypress = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    document.addEventListener('keyup', hostKeyup);
    document.addEventListener('keypress', hostKeypress);
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);
    input.dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true })
    );

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(callbacks.onSubmitCaptureEdit).not.toHaveBeenCalled();
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(hostKeypress).not.toHaveBeenCalled();
    expect(hostKeyup).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostKeydown);
    document.removeEventListener('keyup', hostKeyup);
    document.removeEventListener('keypress', hostKeypress);
    panel.destroy();
  });

  it('keeps unowned Escape from reaching later capture listeners', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();
    const hostCaptureKeydown = vi.fn();
    const hostCaptureKeyup = vi.fn();
    const hostCaptureKeypress = vi.fn();
    document.addEventListener('keydown', hostCaptureKeydown, true);
    document.addEventListener('keyup', hostCaptureKeyup, true);
    document.addEventListener('keypress', hostCaptureKeypress, true);

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true })
    );

    expect(hostCaptureKeydown).not.toHaveBeenCalled();
    expect(hostCaptureKeypress).not.toHaveBeenCalled();
    expect(hostCaptureKeyup).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostCaptureKeydown, true);
    document.removeEventListener('keyup', hostCaptureKeyup, true);
    document.removeEventListener('keypress', hostCaptureKeypress, true);
    panel.destroy();
  });

  it('submits capture edits on Enter through the existing command handler', async () => {
    const hostKeydown = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    input.value = 'Important timestamp';
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);
    await flushPanelPersistence();

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(callbacks.onSubmitCaptureEdit).toHaveBeenCalledWith('capture-1', 'Important timestamp');
    expect(hostKeydown).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostKeydown);
    panel.destroy();
  });

  it('does not submit capture edits while IME composition owns Enter', async () => {
    const hostKeydown = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture({ id: 'capture-1', index: 1 })]);
    panel.beginEditingCapture('capture-1', '');
    await Promise.resolve();

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('capture input missing');
    }
    input.value = 'Composing timestamp';
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(callbacks.onSubmitCaptureEdit).not.toHaveBeenCalled();
    expect(hostKeydown).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostKeydown);
    panel.destroy();
  });

  it('keeps cancel and capture editor focus behavior stable', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const capture = createCapture({ comment: 'draft', commentPreview: 'draft' });
    panel.show();
    panel.setCaptures([capture]);

    panel.beginEditingCapture(capture.id, capture.comment);
    await Promise.resolve();
    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-capture-input="capture-1"]'
    );
    expect(panel.element.shadowRoot?.activeElement).toBe(input);

    panel.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-action-id="video:cancel"]')
      ?.click();
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);

    panel.destroy();
  });

  it('keeps empty capture notes empty instead of rendering fallback copy', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.setCaptures([createCapture({ comment: '', commentPreview: '' })]);

    const input =
      panel.element.shadowRoot?.querySelector<HTMLInputElement>('[data-capture-input]') ?? null;
    expect(input).toBeTruthy();
    expect(input?.value).toBe('');
    expect(input?.placeholder).toBe('Write a note');
    expect(panel.element.shadowRoot?.textContent).not.toContain('No note yet');
    expect(panel.element.shadowRoot?.textContent).not.toContain('Add comment');

    panel.destroy();
  });

  it('can collapse to the title-only bottom-right panel state programmatically', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture()]);
    panel.collapse();

    const shadow = panel.element.shadowRoot;
    expect(
      shadow?.querySelector('.resource-modal--session')?.classList.contains('is-collapsed')
    ).toBe(true);
    expect(shadow?.querySelector('.video-surface-window')?.classList.contains('is-collapsed')).toBe(
      true
    );
    expect(shadow?.querySelector('[data-action-id="session:toggleCollapse"]')).toHaveProperty(
      'hidden',
      true
    );

    panel.destroy();
  });

  it('can start in the title-only collapsed state before it is shown', () => {
    const panel = new VideoDialogPanel({ callbacks, texts, initialCollapsed: true });
    panel.show();

    const shadow = panel.element.shadowRoot;
    expect(
      shadow?.querySelector('.resource-modal--session')?.classList.contains('is-collapsed')
    ).toBe(true);
    expect(shadow?.querySelector('[data-action-id="session:toggleCollapse"]')).toHaveProperty(
      'hidden',
      true
    );

    panel.destroy();
  });

  it('restores user-collapsed video floating panels from local storage', async () => {
    await testPlatformHarness.storage.local.set('aiob.sessionPanel.collapsed', true);
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();

    await flushPanelPersistence();

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(true);

    panel.destroy();
  });

  it('keeps restored collapse when the initial capture list hydrates', async () => {
    await testPlatformHarness.storage.local.set('aiob.sessionPanel.collapsed', true);
    const panel = new VideoDialogPanel({ callbacks, texts });
    const first = createCapture({ id: 'capture-1', index: 1 });
    const second = createCapture({ id: 'capture-2', index: 2 });
    panel.show();

    await flushPanelPersistence();
    panel.setCaptures([first]);

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(true);
    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(true);

    panel.setCaptures([first, second]);

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(false);
    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(false);

    panel.destroy();
  });

  it('persists user collapse without persisting programmatic video capture collapse', async () => {
    const programmaticPanel = new VideoDialogPanel({ callbacks, texts });
    programmaticPanel.show();
    programmaticPanel.collapse();

    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(
      undefined
    );
    programmaticPanel.destroy();

    const userPanel = new VideoDialogPanel({ callbacks, texts });
    userPanel.show();
    userPanel.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-action-id="session:toggleCollapse"]')
      ?.click();

    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(true);
    userPanel.destroy();
  });

  it('renders text fragments below timestamps with reader-style numbering', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.setCaptures([
      createCapture({ id: 'ts-1', kind: 'timestamp', timeLabel: '00:42' }),
      createCapture({
        id: 'frag-1',
        index: 1,
        kind: 'fragment',
        fragmentLabel: 'Captured page text',
        selectionPreview: 'Captured page text'
      })
    ]);

    const shadow = panel.element.shadowRoot;
    const items = Array.from(
      shadow?.querySelectorAll<HTMLElement>('article[data-capture-id]') ?? []
    );
    expect(items.map((item) => item.dataset.captureId)).toEqual(['ts-1', 'frag-1']);
    expect(items.map((item) => item.dataset.captureKind)).toEqual(['timestamp', 'fragment']);
    expect(
      shadow?.querySelector('[data-capture-id="ts-1"] .session-item-marker-time')?.textContent
    ).toBe('00:42');
    expect(
      shadow?.querySelector('[data-capture-id="frag-1"] .session-item-marker-index')?.textContent
    ).toBe('1');
    expect(
      shadow?.querySelector('[data-capture-id="frag-1"] .reader-selection-text')?.textContent
    ).toBe('Captured page text');
    expect(
      shadow?.querySelector<HTMLInputElement>('[data-capture-id="frag-1"] [data-capture-input]')
        ?.placeholder
    ).toBe('Annotate selected text');
    expect(
      shadow?.querySelector('[data-capture-id="frag-1"] .session-item-marker-time')
    ).toBeNull();

    panel.destroy();
  });
});
