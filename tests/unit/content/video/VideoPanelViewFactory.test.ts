/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VideoPanelCallbacks,
  VideoPanelTexts
} from '@content/video/application/videoPanelModel';

const mocks = vi.hoisted(() => {
  const dialogCtor = vi.fn();

  class VideoDialogPanelStub {
    element = document.createElement('div');
    show = vi.fn();
    updateCount = vi.fn();
    setCaptures = vi.fn();
    updateHint = vi.fn();
    updateTexts = vi.fn();
    beginEditingCapture = vi.fn();
    stopEditing = vi.fn();
    collapse = vi.fn();
    destroy = vi.fn();

    constructor(options: unknown) {
      dialogCtor(options);
    }
  }

  return { dialogCtor, VideoDialogPanelStub };
});

vi.mock('../../../../src/content/video/ui/VideoDialogPanel', () => ({
  VideoDialogPanel: mocks.VideoDialogPanelStub
}));

describe('createVideoPanelViewFactory', () => {
  let createVideoPanelViewFactory: typeof import('../../../../src/content/video/presentation/videoPanelView').createVideoPanelViewFactory;

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
    captureFocusLabel: 'Focus {index}'
  };

  beforeEach(async () => {
    vi.resetModules();
    mocks.dialogCtor.mockReset();
    ({ createVideoPanelViewFactory } = await import(
      '../../../../src/content/video/presentation/videoPanelView'
    ));
  });

  it('creates VideoDialogPanel and proxies view calls', () => {
    const factory = createVideoPanelViewFactory();
    const view = factory.createView(callbacks, texts);

    expect(mocks.dialogCtor).toHaveBeenCalledWith({ callbacks, texts });
    expect(view).toBeTruthy();
  });

  it('passes the initial collapsed option into the Stitch video panel', () => {
    const factory = createVideoPanelViewFactory();
    factory.createView(callbacks, texts, { initialCollapsed: true });

    expect(mocks.dialogCtor).toHaveBeenCalledWith({
      callbacks,
      texts,
      initialCollapsed: true
    });
  });
});
