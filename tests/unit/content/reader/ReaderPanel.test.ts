/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadClipperStyleMock = vi.hoisted(() =>
  vi.fn((name: string) => Promise.resolve(`.${name}{display:block;}`))
);
vi.mock('@content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';
import { ReaderPanel } from '@content/reader/ui/panel';

function createTexts(): ReaderPanelTexts {
  return {
    title: 'Reader',
    status: 'Active',
    counter: '{count} highlights',
    counterZero: 'No highlights',
    finish: 'Finish',
    cancel: 'Cancel',
    hint: 'Select and review',
    highlightEditLabel: 'Edit note',
    highlightDeleteLabel: 'Delete note',
    highlightNoComment: 'No comment',
    highlightSaveLabel: 'Save',
    highlightCancelLabel: 'Cancel edit',
    highlightEditPlaceholder: 'Write note',
    highlightFocusLabel: 'Focus highlight {index}'
  };
}

function createCallbacks(): ReaderPanelCallbacks {
  return {
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onDeleteHighlight: vi.fn(),
    onSubmitHighlightEdit: vi.fn(),
    onFocusHighlight: vi.fn()
  };
}

function createHighlights(): ReaderPanelHighlight[] {
  return [
    {
      id: 'h-1',
      excerpt: 'Short excerpt',
      comment: 'Original comment',
      fullText: 'Long full highlight text',
      commentPreview: 'Original comment',
      index: 1,
      timestamp: 1
    },
    {
      id: 'h-2',
      excerpt: 'Second excerpt',
      comment: '',
      fullText: 'Second full text',
      commentPreview: '',
      index: 2,
      timestamp: 2
    }
  ];
}

describe('ReaderPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadClipperStyleMock.mockResolvedValue('.clipper-ready{display:block;}');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders base structure and updates counter and hint', () => {
    const panel = new ReaderPanel({
      callbacks: createCallbacks(),
      texts: createTexts(),
      getIconUrl: (name) => `/static/${name}`
    });

    expect(panel.element.id).toBe('aiob-reader-panel');
    expect(document.body.contains(panel.element)).toBe(true);

    panel.updateCount(2);
    panel.updateHint('Updated hint');

    const text = panel.element.shadowRoot?.textContent ?? panel.element.textContent ?? '';
    expect(text).toContain('2 highlights');
    expect(text).toContain('Updated hint');

    panel.destroy();
  });

  it('renders highlights, handles focus/delete, and updates texts', () => {
    const callbacks = createCallbacks();
    const panel = new ReaderPanel(callbacks, createTexts());
    panel.setHighlights(createHighlights());

    const root = panel.element.shadowRoot ?? panel.element;
    const articles = root.querySelectorAll('.aiob-reader-highlight-item');
    expect(articles).toHaveLength(2);

    const focusBtn = root.querySelector<HTMLButtonElement>('button[aria-label="Focus highlight 1"]');
    const deleteBtn = root.querySelector<HTMLButtonElement>('button[aria-label="Delete note"]');
    focusBtn?.click();
    deleteBtn?.click();

    expect(callbacks.onFocusHighlight).toHaveBeenCalledWith('h-1');
    expect(callbacks.onDeleteHighlight).toHaveBeenCalledWith('h-1');

    const nextTexts = { ...createTexts(), title: 'Reader Updated', hint: 'Fresh hint' };
    panel.updateTexts(nextTexts);
    expect((root.textContent ?? '')).toContain('Reader Updated');

    panel.destroy();
  });

  it('enters edit mode, submits changed drafts, and stops editing', async () => {
    const callbacks = createCallbacks();
    callbacks.onSubmitHighlightEdit = vi.fn().mockResolvedValue(undefined);
    const panel = new ReaderPanel(callbacks, createTexts());
    panel.setHighlights(createHighlights());

    const root = panel.element.shadowRoot ?? panel.element;
    const commentRow = root.querySelectorAll<HTMLElement>('.aiob-reader-highlight-item__comment')[0];
    commentRow?.click();

    expect(panel.isEditing()).toBe(true);
    const textarea = root.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    if (!textarea) {
      throw new Error('textarea missing');
    }

    textarea.value = 'Changed note';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const saveBtn = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Save');
    saveBtn?.click();

    await vi.waitFor(() => {
      expect(callbacks.onSubmitHighlightEdit).toHaveBeenCalledWith('h-1', 'Changed note');
    });

    panel.stopEditing();
    expect(panel.isEditing()).toBe(false);
    panel.destroy();
  });

  it('collapses expanded state on outside pointer down and removes itself on destroy', async () => {
    const panel = new ReaderPanel(createCallbacks(), createTexts());
    panel.setHighlights(createHighlights());

    const root = panel.element.shadowRoot ?? panel.element;
    const excerpt = root.querySelector<HTMLElement>('.aiob-reader-highlight-item__excerpt');
    excerpt?.click();
    expect(root.querySelector('.aiob-reader-highlight-item--expanded')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    expect(root.querySelector('.aiob-reader-highlight-item--expanded')).toBeFalsy();

    panel.destroy();
    expect(document.body.contains(panel.element)).toBe(false);
  });
});
