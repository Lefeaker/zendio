/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderDialogPanel } from '../../../../src/content/reader/ui/ReaderDialogPanel';
import type {
  ReaderPanelCallbacks,
  ReaderPanelTexts
} from '../../../../src/content/reader/application/readerPanelModel';

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

  it('focuses reader controls through the shared content dialog focus helper', async () => {
    const { focusContentDialogElement } = await import(
      '../../../../src/ui/hosts/content/contentDialogFocus'
    );
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
