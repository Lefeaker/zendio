/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoDialogPanel } from '../../src/content/video/ui/VideoDialogPanel';
import { VideoPanelPresenter } from '../../src/content/video/videoPanelPresenter';
import type {
  VideoPanelCallbacks,
  VideoPanelTexts
} from '../../src/content/video/application/videoPanelModel';
import type { VideoFragmentCapture, VideoTimestampCapture } from '../../src/content/video/types';

const callbacks: VideoPanelCallbacks = {
  onAddCapture: vi.fn(),
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteCapture: vi.fn(),
  onSubmitCaptureEdit: vi.fn(() => Promise.resolve()),
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

function createTimestampCapture(
  overrides: Partial<VideoTimestampCapture> = {}
): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id: 'ts-1',
    timeSec: 42,
    url: 'https://example.com/watch?v=1&t=42s',
    comment: '',
    createdAt: Date.now(),
    ...overrides
  };
}

function createFragmentCapture(
  overrides: Partial<VideoFragmentCapture> = {}
): VideoFragmentCapture {
  return {
    kind: 'fragment',
    id: 'frag-1',
    timeSec: 45,
    comment: '',
    selectedText: 'Selected transcript fragment',
    selectedHtml: '<p>Selected transcript fragment</p>',
    fragmentUrl: 'https://example.com/watch?v=1&t=45s',
    createdAt: Date.now(),
    ...overrides
  };
}

describe('Video Panel E2E Flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders captures through presenter and shows dialog actions', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const presenter = new VideoPanelPresenter(panel);

    presenter.render({
      timestamps: [createTimestampCapture()],
      fragments: [createFragmentCapture()]
    });

    const shadow = panel.element.shadowRoot;
    expect(shadow?.querySelector('[data-role="add-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="finish-btn"]')).toBeTruthy();
    expect(shadow?.querySelectorAll('[data-role="capture-item"]').length).toBe(2);
    expect(shadow?.textContent).toContain('00:42');

    panel.destroy();
  });

  it('supports editing a capture comment and submitting via UI', async () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const presenter = new VideoPanelPresenter(panel);

    presenter.render({
      timestamps: [createTimestampCapture()],
      fragments: []
    });

    const shadow = panel.element.shadowRoot;
    panel.beginEditingCapture('ts-1', '');

    const input = shadow?.querySelector<HTMLInputElement>('[data-capture-input="ts-1"]');
    expect(input).toBeTruthy();
    if (!input) throw new Error('input missing');
    input.value = 'Important timestamp';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await Promise.resolve();
    expect(callbacks.onSubmitCaptureEdit).toHaveBeenCalledWith('ts-1', 'Important timestamp');

    panel.destroy();
  });

  it('fires finish action from dialog footer', () => {
    const panel = new VideoDialogPanel({ callbacks, texts });
    const finishBtn = panel.element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-role="finish-btn"]'
    );

    expect(finishBtn).toBeTruthy();
    finishBtn?.click();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);

    panel.destroy();
  });
});
