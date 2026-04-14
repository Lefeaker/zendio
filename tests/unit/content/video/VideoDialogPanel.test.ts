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

  it('renders Daisy dialog actions and updates captures', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    panel.setCaptures([createCapture()]);

    const shadow = panel.element.shadowRoot;
    const overlay = shadow?.querySelector<HTMLDivElement>('.modal');
    const modal = shadow?.querySelector<HTMLElement>('[data-element="dialog"]');
    expect(shadow?.querySelector('[data-role="finish-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="close-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="add-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="capture-item"]')).toBeTruthy();
    expect(overlay?.style.pointerEvents).toBe('none');
    expect(modal?.style.pointerEvents).toBe('auto');
    expect(modal?.getAttribute('aria-modal')).toBe('false');

    panel.destroy();
  });

  it('begins editing an existing capture', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const capture = createCapture({ comment: 'draft', commentPreview: 'draft' });
    panel.setCaptures([capture]);
    panel.beginEditingCapture(capture.id, capture.comment);

    const textarea = panel.element.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe('draft');

    panel.destroy();
  });
});
