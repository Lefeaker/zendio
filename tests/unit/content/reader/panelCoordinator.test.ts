/* @vitest-environment jsdom */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';
import type {
  ReaderPanelEditingSnapshot,
  ReaderPanelRenderOptions,
  ReaderSessionView
} from '@content/reader/application/readerSessionView';
import type { ReaderSessionViewFactory } from '@content/reader/application/readerSessionView';
import { ReaderPanelCoordinator } from '@content/reader/panelCoordinator';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import type { ReaderHighlightRecord } from '@content/reader/services/highlightManager';

class FakeReaderView implements ReaderSessionView {
  readonly element = document.createElement('div');
  lastCount = 0;
  lastHint = '';
  lastTexts: ReaderPanelTexts | null = null;
  lastHighlights: ReaderPanelHighlight[] = [];
  lastRenderOptions: ReaderPanelRenderOptions = {};
  currentDrafts: Record<string, string> = {};
  editingSnapshot: ReaderPanelEditingSnapshot = {
    editingHighlightId: null,
    pendingNoteFocusHighlightId: null
  };
  editing = false;
  destroyed = false;

  updateCount(count: number): void {
    this.lastCount = count;
  }

  updateHint(message: string): void {
    this.lastHint = message;
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.lastTexts = texts;
  }

  setHighlights(highlights: ReaderPanelHighlight[], options: ReaderPanelRenderOptions = {}): void {
    this.lastHighlights = highlights;
    this.lastRenderOptions = options;
  }

  snapshotCommentDrafts(): Record<string, string> {
    return { ...this.currentDrafts };
  }

  hydrateCommentDrafts(drafts: Record<string, string>): void {
    this.currentDrafts = { ...drafts };
  }

  clearCommentDraft(id: string): void {
    const remainingDrafts = { ...this.currentDrafts };
    delete remainingDrafts[id];
    this.currentDrafts = remainingDrafts;
  }

  restoreCommentDraft(id: string, draft: string | undefined): void {
    if (draft === undefined) {
      this.clearCommentDraft(id);
      return;
    }
    this.currentDrafts = { ...this.currentDrafts, [id]: draft };
  }

  snapshotEditingState(): ReaderPanelEditingSnapshot {
    return { ...this.editingSnapshot };
  }

  restoreEditingState(snapshot: ReaderPanelEditingSnapshot): void {
    this.editingSnapshot = { ...snapshot };
    this.editing = snapshot.editingHighlightId !== null;
  }

  finishEditing(): void {
    this.editingSnapshot = {
      editingHighlightId: null,
      pendingNoteFocusHighlightId: null
    };
    this.editing = false;
  }

  stopEditing(): void {
    this.editing = false;
  }

  isEditing(): boolean {
    return this.editing;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createHighlight(id: string, comment: string, text: string): ReaderHighlightRecord {
  return {
    id,
    selectedHtml: `<p>${text}</p>`,
    selectedText: text,
    comment,
    fragmentUrl: `https://example.com#${id}`,
    wrapper: document.createElement('mark'),
    wrapperSegments: [],
    createdAt: Date.now()
  };
}

describe('ReaderPanelCoordinator', () => {
  let callbacks: ReaderPanelCallbacks;
  let viewFactory: ReaderSessionViewFactory;
  let createViewSpy: Mock<(...args: []) => FakeReaderView>;
  let view: FakeReaderView;

  beforeEach(() => {
    callbacks = {
      onFinish: vi.fn(),
      onCancel: vi.fn(),
      onDeleteHighlight: vi.fn(),
      onSubmitHighlightEdit: vi.fn(),
      onFocusHighlight: vi.fn()
    };
    view = new FakeReaderView();
    createViewSpy = vi.fn(() => view);
    viewFactory = {
      createView: createViewSpy as unknown as ReaderSessionViewFactory['createView']
    };
  });

  it('mounts view and applies initial hint', () => {
    const coordinator = new ReaderPanelCoordinator({
      viewFactory,
      callbacks,
      reconstructText: (highlight) => highlight.selectedText
    });

    coordinator.mount(DEFAULT_SESSION_MESSAGES);
    expect(createViewSpy).toHaveBeenCalledTimes(1);
    expect(view.lastHint).toBe(DEFAULT_SESSION_MESSAGES.hintNoHighlights);
    expect(view.lastCount).toBe(0);
  });

  it('updates messages and highlights', () => {
    const coordinator = new ReaderPanelCoordinator({
      viewFactory,
      callbacks,
      reconstructText: (highlight) => highlight.selectedText
    });

    coordinator.mount(DEFAULT_SESSION_MESSAGES);
    const nextMessages = {
      ...DEFAULT_SESSION_MESSAGES,
      panel: {
        ...DEFAULT_SESSION_MESSAGES.panel,
        title: 'Custom'
      }
    };
    const highlights = [createHighlight('a', 'first', 'Example text')];

    coordinator.updateMessages(nextMessages, highlights);
    expect(view.lastTexts?.title).toBe('Custom');
    expect(view.lastHighlights).toHaveLength(1);
    expect(view.lastHighlights[0].commentPreview).toBe('first');
  });

  it('updates hint state and stops editing', () => {
    const coordinator = new ReaderPanelCoordinator({
      viewFactory,
      callbacks,
      reconstructText: (highlight) => highlight.selectedText
    });

    coordinator.mount(DEFAULT_SESSION_MESSAGES);
    view.editing = true;
    coordinator.updateHighlights([createHighlight('a', 'note', 'Content')]);
    coordinator.applyHint('panel', 1);
    expect(view.lastHint).toBe(DEFAULT_SESSION_MESSAGES.panel.hint);
    coordinator.stopEditing();
    expect(view.editing).toBe(false);
  });

  it('forwards the requested highlight focus target through presenter rendering', () => {
    const coordinator = new ReaderPanelCoordinator({
      viewFactory,
      callbacks,
      reconstructText: (highlight) => highlight.selectedText
    });

    coordinator.mount(DEFAULT_SESSION_MESSAGES);
    coordinator.updateHighlights([createHighlight('a', 'note', 'Content')], {
      focusHighlightId: 'a'
    });

    expect(view.lastRenderOptions).toEqual({ focusHighlightId: 'a' });
  });

  it('forwards comment draft snapshot and hydrate operations to the view', () => {
    const coordinator = new ReaderPanelCoordinator({
      viewFactory,
      callbacks,
      reconstructText: (highlight) => highlight.selectedText
    });

    coordinator.mount(DEFAULT_SESSION_MESSAGES);
    coordinator.hydrateCommentDrafts({
      a: 'restored draft'
    });

    expect(view.currentDrafts).toEqual({
      a: 'restored draft'
    });
    expect(coordinator.snapshotCommentDrafts()).toEqual({
      a: 'restored draft'
    });
  });
});
