/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderPanelTexts } from '@content/reader/application/readerPanelModel';
import { ReaderDialog, type ReaderDialogHighlight } from '@content/reader/components/ReaderDialog';

vi.mock('focus-trap', () => {
  const noop = () => {};
  return {
    createFocusTrap: () => ({
      activate: noop,
      deactivate: noop,
      pause: noop,
      unpause: noop
    })
  };
});

const baseTexts: ReaderPanelTexts = {
  title: 'Reading Assistant',
  status: 'Ready',
  counter: '{count} highlights',
  counterZero: 'No highlights',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Select text to add highlights.',
  highlightEditLabel: 'Edit',
  highlightDeleteLabel: 'Delete',
  highlightNoComment: 'Add your note',
  highlightSaveLabel: 'Save',
  highlightCancelLabel: 'Cancel',
  highlightEditPlaceholder: 'Enter comment',
  highlightFocusLabel: 'Focus highlight {index}'
};

const baseConfig = {
  title: baseTexts.title,
  texts: {
    hint: baseTexts.hint,
    finish: baseTexts.finish,
    cancel: baseTexts.cancel,
    highlightNoComment: baseTexts.highlightNoComment,
    highlightFocusLabel: baseTexts.highlightFocusLabel,
    highlightEditPlaceholder: baseTexts.highlightEditPlaceholder,
    highlightSaveLabel: baseTexts.highlightSaveLabel,
    highlightCancelLabel: baseTexts.highlightCancelLabel
  },
  highlights: [] as ReaderDialogHighlight[],
  onExport: vi.fn(),
  onClose: vi.fn(),
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteHighlight: vi.fn(),
  onFocusHighlight: vi.fn(),
  onSubmitHighlightEdit: vi.fn()
};

function createDialog(overrides: Partial<typeof baseConfig> = {}): ReaderDialog {
  return new ReaderDialog({ ...baseConfig, ...overrides });
}

function appendDialog(dialog: ReaderDialog): HTMLElement {
  const host = dialog.render();
  document.body.append(host);
  dialog.show();
  return host;
}

function createHighlight(overrides: Partial<ReaderDialogHighlight> = {}): ReaderDialogHighlight {
  return {
    id: 'h-1',
    index: 1,
    excerpt: 'Short excerpt',
    fullText: 'Full text of highlight',
    commentPreview: overrides.commentPreview,
    comment: overrides.comment,
    timestamp: 1_700_000_000_000,
    ...overrides
  };
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} should not be null`);
  }
  return value;
}

describe('ReaderDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders hint, badge and updates counts', () => {
    const dialog = createDialog();
    const host = appendDialog(dialog);
    const highlight = createHighlight();

    dialog.updateHighlights([highlight]);
    dialog.setCounterText('1 highlight');
    dialog.setHintText('Custom hint');

    const shadow = host.shadowRoot;
    expect(shadow).not.toBeNull();
    const hint = shadow?.querySelector('.reader-dialog-content p');
    expect(hint?.textContent).toBe('Custom hint');
    const badge = shadow?.querySelector('[data-role="badge"]');
    expect(badge?.textContent).toBe('1 highlight');
    const items = shadow?.querySelectorAll('[data-role="highlight-item"]');
    expect(items?.length).toBe(1);
  });

  it('enters edit mode and submits drafted comment', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn<Parameters<typeof baseConfig.onSubmitHighlightEdit>, ReturnType<typeof baseConfig.onSubmitHighlightEdit>>(
      () => Promise.resolve()
    );
    const dialog = createDialog({ onSubmitHighlightEdit: onSubmit });
    const host = appendDialog(dialog);
    dialog.updateHighlights([createHighlight({ comment: 'Old comment' })]);

    const shadow = requireValue(host.shadowRoot, 'shadowRoot');
    let item = requireValue(
      shadow.querySelector<HTMLElement>('[data-role="highlight-item"]'),
      'highlight item'
    );
    const commentRow = requireValue(
      item.querySelector<HTMLElement>('div[tabindex="0"]'),
      'comment row'
    );
    commentRow.click();

    item = requireValue(
      shadow.querySelector<HTMLElement>('[data-role="highlight-item"]'),
      'highlight item (editing)'
    );
    const textarea = requireValue(
      item.querySelector<HTMLTextAreaElement>('textarea'),
      'textarea'
    );
    textarea.value = 'Updated comment';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith('h-1', 'Updated comment');
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('invokes delete callback when remove button is clicked', () => {
    const onDelete = vi.fn();
    const dialog = createDialog({ onDeleteHighlight: onDelete });
    const host = appendDialog(dialog);
    dialog.updateHighlights([createHighlight()]);

    const shadow = requireValue(host.shadowRoot, 'shadowRoot');
    const item = requireValue(
      shadow.querySelector<HTMLElement>('[data-role="highlight-item"]'),
      'highlight item'
    );
    const buttons = item.querySelectorAll('button');
    const removeBtn = requireValue(
      Array.from(buttons).find((btn) => btn.textContent === '✕'),
      'remove button'
    );
    removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onDelete).toHaveBeenCalledWith('h-1');
  });
});
