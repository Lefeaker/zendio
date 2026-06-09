/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderDialogPanel } from '../../../../src/content/reader/ui/ReaderDialogPanel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../../../../src/content/reader/application/readerPanelModel';
import { testPlatformHarness } from '../../../setup/globalSetup';

vi.mock('focus-trap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn()
  })
}));

vi.mock('@content/runtime/popupCoordinatorAccess', () => ({
  resolveContentPopupCoordinator: () => null
}));

function createReaderPanelTexts(): ReaderPanelTexts {
  return {
    title: 'Reader Panel',
    status: 'Ready',
    counter: '{count} highlights',
    counterZero: 'No highlights',
    finish: 'Finish',
    cancel: 'Cancel',
    hint: 'Select text to highlight',
    highlightEditLabel: 'Edit',
    highlightDeleteLabel: 'Delete',
    highlightNoComment: 'Add note',
    highlightSaveLabel: 'Save',
    highlightCancelLabel: 'Cancel',
    highlightEditPlaceholder: 'Enter note',
    highlightFocusLabel: 'Focus {index}'
  };
}

function createReaderPanelCallbacks(): ReaderPanelCallbacks {
  return {
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onDeleteHighlight: vi.fn(),
    onFocusHighlight: vi.fn(),
    onSubmitHighlightEdit: vi.fn()
  };
}

function createHighlight(overrides: Partial<ReaderPanelHighlight> = {}): ReaderPanelHighlight {
  return {
    id: 'h-1',
    index: 1,
    excerpt: 'Selected text',
    fullText: 'Selected text',
    comment: '',
    commentPreview: '',
    timestamp: Date.now(),
    ...overrides
  };
}

function flushPanelPersistence(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ReaderDialogPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('mounts reader panel with the stable aiob-reader-panel id', () => {
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });

    panel.mount(document.body);

    expect(panel.element.id).toBe('aiob-reader-panel');
    expect(document.getElementById('aiob-reader-panel')).toBe(panel.element);

    panel.destroy();
  });

  it('focuses the newest highlight note input when a reader selection is added', () => {
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    panel.mount(document.body);

    panel.setHighlights([
      {
        id: 'h-1',
        index: 1,
        excerpt: 'Selected text',
        fullText: 'Selected text',
        comment: '',
        commentPreview: '',
        timestamp: Date.now()
      }
    ]);

    const noteInput = panel.element.shadowRoot?.querySelector('[data-highlight-input="h-1"]');
    expect(panel.element.shadowRoot?.activeElement).toBe(noteInput);

    panel.update({ hint: 'Updated hint after capture' });
    expect(panel.element.shadowRoot?.activeElement).toBe(
      panel.element.shadowRoot?.querySelector('[data-highlight-input="h-1"]')
    );

    panel.destroy();
  });

  it('reports editing only while the highlight note input keeps focus', () => {
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    panel.mount(document.body);

    panel.setHighlights([
      {
        id: 'h-1',
        index: 1,
        excerpt: 'Selected text',
        fullText: 'Selected text',
        comment: '',
        commentPreview: '',
        timestamp: Date.now()
      }
    ]);

    expect(panel.isEditing()).toBe(true);
    panel.element.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="export-btn"]')?.focus();

    expect(panel.isEditing()).toBe(false);

    panel.destroy();
  });

  it('preserves unsaved highlight note drafts when additional highlights render', () => {
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    panel.mount(document.body);
    const first = createHighlight({ id: 'h-1', index: 1 });
    const second = createHighlight({ id: 'h-2', index: 2 });
    panel.setHighlights([first, second]);

    const secondInput = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-highlight-input="h-2"]'
    );
    expect(secondInput).toBeTruthy();
    if (!secondInput) {
      throw new Error('second highlight input missing');
    }
    secondInput.value = 'second draft';
    secondInput.dispatchEvent(new Event('input', { bubbles: true }));

    panel.setHighlights([first, second, createHighlight({ id: 'h-3', index: 3 })]);

    expect(
      panel.element.shadowRoot?.querySelector<HTMLInputElement>('[data-highlight-input="h-2"]')
        ?.value
    ).toBe('second draft');
    expect(panel.element.shadowRoot?.activeElement).toBe(
      panel.element.shadowRoot?.querySelector('[data-highlight-input="h-3"]')
    );

    panel.destroy();
  });

  it('hydrates saved highlight note drafts without submitting them', () => {
    const callbacks = createReaderPanelCallbacks();
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks
    });
    panel.mount(document.body);
    panel.setHighlights([createHighlight({ id: 'h-1', index: 1 })]);

    panel.hydrateCommentDrafts({
      'h-1': 'restored draft'
    });

    expect(
      panel.element.shadowRoot?.querySelector<HTMLInputElement>('[data-highlight-input="h-1"]')
        ?.value
    ).toBe('restored draft');
    expect(panel.snapshotCommentDrafts()).toEqual({
      'h-1': 'restored draft'
    });
    expect(callbacks.onSubmitHighlightEdit).not.toHaveBeenCalled();

    panel.destroy();
  });

  it('flushes unsaved highlight note drafts before finishing', async () => {
    const callbacks = createReaderPanelCallbacks();
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks
    });
    panel.mount(document.body);
    panel.setHighlights([createHighlight({ id: 'h-1', index: 1 })]);

    const input = panel.element.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-highlight-input="h-1"]'
    );
    expect(input).toBeTruthy();
    if (!input) {
      throw new Error('highlight input missing');
    }
    input.value = 'finish draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    panel.element.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="export-btn"]')?.click();
    await flushPanelPersistence();

    expect(callbacks.onSubmitHighlightEdit).toHaveBeenCalledWith('h-1', 'finish draft');
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callbacks.onSubmitHighlightEdit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(callbacks.onFinish).mock.invocationCallOrder[0] ?? 0
    );

    panel.destroy();
  });

  it('restores and persists the reader floating panel collapsed state', async () => {
    await testPlatformHarness.storage.local.set('aiob.sessionPanel.collapsed', true);
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    panel.show();

    await flushPanelPersistence();

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(true);

    panel.element.shadowRoot
      ?.querySelector<HTMLElement>('.reader-surface-window')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(false);
    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(false);

    panel.destroy();
  });

  it('keeps restored collapse when the initial highlight list hydrates', async () => {
    await testPlatformHarness.storage.local.set('aiob.sessionPanel.collapsed', true);
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    const first = createHighlight({ id: 'h-1', index: 1 });
    const second = createHighlight({ id: 'h-2', index: 2 });
    panel.show();

    await flushPanelPersistence();
    panel.setHighlights([first]);

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(true);
    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(true);

    panel.setHighlights([first, second]);

    expect(
      panel.element.shadowRoot
        ?.querySelector('.resource-modal--session')
        ?.classList.contains('is-collapsed')
    ).toBe(false);
    expect(await testPlatformHarness.storage.local.get('aiob.sessionPanel.collapsed')).toBe(false);

    panel.destroy();
  });

  it('focuses reader controls through the shared content dialog focus helper', async () => {
    const { focusContentDialogElement } =
      await import('../../../../src/ui/hosts/content/contentDialogFocus');
    const panel = new ReaderDialogPanel({
      texts: createReaderPanelTexts(),
      callbacks: createReaderPanelCallbacks()
    });
    panel.mount(document.body);
    panel.setHighlights([
      {
        id: 'h-1',
        index: 1,
        excerpt: 'Selected text',
        fullText: 'Selected text',
        comment: '',
        commentPreview: '',
        timestamp: Date.now()
      }
    ]);

    panel.element.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="export-btn"]')?.focus();
    expect(
      focusContentDialogElement(panel.element.shadowRoot, '[data-highlight-input="h-1"]')
    ).toBe(true);
    expect(panel.element.shadowRoot?.activeElement).toBe(
      panel.element.shadowRoot?.querySelector('[data-highlight-input="h-1"]')
    );

    panel.destroy();
  });
});
