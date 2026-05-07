/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  VideoPanelCallbacks,
  VideoPanelTexts,
  VideoPanelCapture
} from '@content/video/application/videoPanelModel';
import { VideoDialogPanel } from '@content/video/ui/VideoDialogPanel';

const callbacks: VideoPanelCallbacks = {
  onAddCapture: vi.fn(),
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteCapture: vi.fn(),
  onSubmitCaptureEdit: vi.fn(),
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
    shadow?.querySelector<HTMLButtonElement>('[data-action-id="video:delete"]')?.click();

    expect(callbacks.onAddCapture).toHaveBeenCalledTimes(2);
    expect(callbacks.onAddCapture).toHaveBeenNthCalledWith(1, 'button');
    expect(callbacks.onAddCapture).toHaveBeenNthCalledWith(2, 'note-input');
    expect(callbacks.onDeleteCapture).toHaveBeenCalledWith('capture-1');

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
