/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadClipperStyleMock = vi.hoisted(() =>
  vi.fn((name: string) => Promise.resolve(`.${name}{display:block;}`))
);
vi.mock('@content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '@content/video/application/videoPanelModel';
import { VideoPanel } from '@content/video/ui/panel';

function createTexts(): VideoPanelTexts {
  return {
    title: 'Video',
    status: 'Capturing',
    counter: '{count} captures',
    counterZero: 'No captures',
    add: 'Add capture',
    finish: 'Finish',
    cancel: 'Cancel',
    hint: 'Review captures',
    captureEditLabel: 'Edit capture',
    captureDeleteLabel: 'Delete capture',
    captureNoComment: 'No capture comment',
    captureSaveLabel: 'Save capture',
    captureCancelLabel: 'Cancel capture edit',
    captureEditPlaceholder: 'Write capture note',
    captureFocusLabel: 'Focus capture {index}'
  };
}

function createCallbacks(): VideoPanelCallbacks {
  return {
    onAddCapture: vi.fn(),
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onDeleteCapture: vi.fn(),
    onSubmitCaptureEdit: vi.fn(),
    onFocusCapture: vi.fn()
  };
}

function createCaptures(): VideoPanelCapture[] {
  return [
    {
      id: 'c-1',
      index: 1,
      kind: 'timestamp',
      timeLabel: '00:12',
      timeSeconds: 12,
      comment: 'Important',
      commentPreview: 'Important'
    },
    {
      id: 'c-2',
      index: 2,
      kind: 'fragment',
      fragmentLabel: 'Selected subtitle',
      selectionPreview: 'Selected subtitle extended',
      comment: '',
      commentPreview: ''
    }
  ];
}

describe('VideoPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadClipperStyleMock.mockImplementation((name: string) =>
      Promise.resolve(name === 'video.tailwind' ? '.video-ready{display:block;}' : '.clipper-ready{display:block;}')
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders base structure and invokes top-level callbacks', () => {
    const callbacks = createCallbacks();
    const panel = new VideoPanel({
      callbacks,
      texts: createTexts(),
      getIconUrl: (name) => `/icons/${name}`
    });
    const root = panel.element.shadowRoot ?? panel.element;

    panel.updateCount(2);
    panel.updateHint('Hint updated');
    const addButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Add capture');
    const finishButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Finish');
    const cancelButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Cancel');
    addButton?.click();
    finishButton?.click();
    cancelButton?.click();

    expect(callbacks.onAddCapture).toHaveBeenCalled();
    expect(callbacks.onFinish).toHaveBeenCalled();
    expect(callbacks.onCancel).toHaveBeenCalled();
    expect(root.textContent ?? '').toContain('2 captures');
    expect(root.textContent ?? '').toContain('Hint updated');

    panel.destroy();
  });

  it('renders captures and handles focus/delete interactions', () => {
    const callbacks = createCallbacks();
    const panel = new VideoPanel(callbacks, createTexts());
    panel.setCaptures(createCaptures());
    const root = panel.element.shadowRoot ?? panel.element;

    expect(root.querySelectorAll('.aiob-video-capture-item')).toHaveLength(2);
    const focusBtn = root.querySelector<HTMLButtonElement>('button[aria-label="Focus capture 1"]');
    const deleteBtn = root.querySelector<HTMLButtonElement>('button[aria-label="Delete capture"]');
    focusBtn?.click();
    deleteBtn?.click();

    expect(callbacks.onFocusCapture).toHaveBeenCalledWith('c-1');
    expect(callbacks.onDeleteCapture).toHaveBeenCalledWith('c-1');

    panel.destroy();
  });

  it('enters edit mode, submits changed capture drafts, and stops editing', async () => {
    const callbacks = createCallbacks();
    callbacks.onSubmitCaptureEdit = vi.fn().mockResolvedValue(undefined);
    const panel = new VideoPanel(callbacks, createTexts());
    panel.setCaptures(createCaptures());
    const root = panel.element.shadowRoot ?? panel.element;

    const commentRow = root.querySelectorAll<HTMLElement>('.aiob-video-capture-item__comment')[0];
    commentRow?.click();
    const textarea = root.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    if (!textarea) {
      throw new Error('capture textarea missing');
    }

    textarea.value = 'Updated capture';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const saveBtn = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Save capture');
    saveBtn?.click();

    await vi.waitFor(() => {
      expect(callbacks.onSubmitCaptureEdit).toHaveBeenCalledWith('c-1', 'Updated capture');
    });

    panel.stopEditing();
    expect(root.querySelector('textarea')).toBeNull();
    panel.destroy();
  });

  it('toggles expanded capture state and collapses on outside pointer down', async () => {
    const callbacks = createCallbacks();
    const panel = new VideoPanel(callbacks, createTexts());
    panel.setCaptures(createCaptures());
    const root = panel.element.shadowRoot ?? panel.element;

    const fragmentPreview = Array.from(root.querySelectorAll<HTMLElement>('.aiob-video-capture-item__excerpt'))[0];
    fragmentPreview?.click();
    expect(callbacks.onFocusCapture).toHaveBeenCalledWith('c-2');
    expect(root.querySelector('.aiob-video-capture-item--expanded')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    expect(root.querySelector('.aiob-video-capture-item--expanded')).toBeFalsy();

    panel.destroy();
  });
});
