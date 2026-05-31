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

function flushPanelPersistence(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  it('routes the inline add and item close buttons to video callbacks', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.show();
    panel.setCaptures([createCapture()]);

    const shadow = panel.element.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:add"]')?.click();
    shadow?.querySelector<HTMLInputElement>('[data-action-id="video:add-note"]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:toggle-screenshot"]')?.click();
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:delete"]')?.click();

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
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onSubmitCaptureEdit).toHaveBeenCalledWith('capture-1', 'finish capture draft');
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callbacks.onSubmitCaptureEdit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(callbacks.onFinish).mock.invocationCallOrder[0] ?? 0
    );

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
