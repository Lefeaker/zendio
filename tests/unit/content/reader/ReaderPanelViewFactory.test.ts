/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReaderPanelCallbacks,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';

const mocks = vi.hoisted(() => {
  const dialogCtor = vi.fn();

  class BaseStub {
    element = document.createElement('div');
    show = vi.fn();
    updateCount = vi.fn();
    updateHint = vi.fn();
    updateTexts = vi.fn();
    setHighlights = vi.fn();
    stopEditing = vi.fn();
    isEditing = vi.fn(() => false);
    destroy = vi.fn();
  }

  class ReaderDialogPanelStub extends BaseStub {
    constructor(options: unknown) {
      super();
      dialogCtor(options);
    }
  }

  return {
    dialogCtor,
    ReaderDialogPanelStub
  };
});

vi.mock('../../../../src/content/reader/ui/ReaderDialogPanel', () => ({
  ReaderDialogPanel: mocks.ReaderDialogPanelStub
}));

describe('createReaderPanelViewFactory', () => {
  let createReaderPanelViewFactory: typeof import('../../../../src/content/reader/presentation/readerPanelView').createReaderPanelViewFactory;
  const callbacks: ReaderPanelCallbacks = {
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onDeleteHighlight: vi.fn(),
    onSubmitHighlightEdit: vi.fn(),
    onFocusHighlight: vi.fn()
  };
  const texts: ReaderPanelTexts = {
    title: 'Reader Panel',
    status: 'Ready',
    counter: '{count} highlights',
    counterZero: 'No highlights',
    finish: 'Finish',
    cancel: 'Cancel',
    hint: 'hint',
    highlightEditLabel: 'Edit',
    highlightDeleteLabel: 'Delete',
    highlightNoComment: 'Add note',
    highlightSaveLabel: 'Save',
    highlightCancelLabel: 'Cancel',
    highlightEditPlaceholder: 'Enter note',
    highlightFocusLabel: 'Focus {index}'
  };

  beforeEach(async () => {
    vi.resetModules();
    mocks.dialogCtor.mockReset();
    ({ createReaderPanelViewFactory } = await import(
      '../../../../src/content/reader/presentation/readerPanelView'
    ));
  });

  it('creates ReaderDialogPanel', () => {
    const factory = createReaderPanelViewFactory();
    const view = factory.createView(callbacks, texts);

    expect(mocks.dialogCtor).toHaveBeenCalledWith({ callbacks, texts });
    expect(view.element).toBeInstanceOf(HTMLElement);
    expect(view.isEditing()).toBe(false);
  });
});
