/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
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
});
