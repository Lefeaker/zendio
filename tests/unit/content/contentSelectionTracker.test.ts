/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createContentSelectionTracker,
  type SelectionSnapshot
} from '@content/runtime/contentSelectionTracker';

describe('contentSelectionTracker', () => {
  let lastSelectionSnapshot: SelectionSnapshot | null;

  beforeEach(() => {
    document.body.innerHTML = '';
    lastSelectionSnapshot = null;
    vi.restoreAllMocks();
  });

  function createTracker(enablePlatformShadowSelection = true) {
    return createContentSelectionTracker({
      document,
      window,
      enablePlatformShadowSelection,
      getLastSelectionSnapshot: () => lastSelectionSnapshot,
      setLastSelectionSnapshot: (snapshot) => {
        lastSelectionSnapshot = snapshot;
      }
    });
  }

  it('restores a shadow-root selection from the saved snapshot', () => {
    const host = document.createElement('bili-comment-renderer');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p id="copy">tracked selection</p>';
    const target = shadow.getElementById('copy');
    if (!target?.firstChild) {
      throw new Error('Expected selection target');
    }

    const range = document.createRange();
    range.setStart(target.firstChild, 0);
    range.setEnd(target.firstChild, 'tracked selection'.length);
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: target.firstChild,
      focusNode: target.firstChild,
      getRangeAt: vi.fn(() => range),
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      toString: vi.fn(() => 'tracked selection')
    } as unknown as Selection;
    Object.assign(shadow, {
      getSelection: () => selection
    });
    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    vi.spyOn(window, 'getSelection').mockReturnValue(null);

    const tracker = createTracker();
    const snapshot = tracker.captureSelectionSnapshot({
      selection,
      root: shadow
    });

    const restored = tracker.restoreSelectionFromSnapshot(snapshot);

    expect(selection.removeAllRanges).toHaveBeenCalledTimes(1);
    expect(selection.addRange).toHaveBeenCalledTimes(1);
    expect(restored).toEqual({ selection, root: shadow });
  });

  it('finds active selections inside configured shadow roots', () => {
    const host = document.createElement('bili-comment-renderer');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span id="shadow-text">shadow selection</span>';

    const target = shadow.getElementById('shadow-text');
    if (!target?.firstChild) {
      throw new Error('Expected shadow selection target');
    }

    const range = document.createRange();
    range.setStart(target.firstChild, 0);
    range.setEnd(target.firstChild, 'shadow selection'.length);
    const shadowSelection = {
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: target.firstChild,
      focusNode: target.firstChild,
      getRangeAt: vi.fn(() => range),
      toString: vi.fn(() => 'shadow selection')
    } as unknown as Selection;

    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    Object.assign(shadow, {
      getSelection: () => shadowSelection
    });

    const tracker = createTracker();
    const active = tracker.findActiveSelection();

    expect(active).toEqual({ selection: shadowSelection, root: shadow });
  });

  it('does not query Bilibili shadow selectors when platform shadow scanning is disabled', () => {
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    const tracker = createContentSelectionTracker({
      document,
      window,
      enablePlatformShadowSelection: false,
      getLastSelectionSnapshot: () => null,
      setLastSelectionSnapshot: vi.fn()
    });

    tracker.findActiveSelection();

    expect(querySelectorAll).not.toHaveBeenCalledWith('bili-comment-thread-renderer');
  });

  it('ignores UI-owned selections when selectionchange fires', () => {
    document.body.innerHTML =
      '<div id="obsidian-clipper-dialog"><span id="inside">ui text</span></div>';
    const target = document.getElementById('inside');
    if (!target?.firstChild) {
      throw new Error('Expected ui selection target');
    }

    const tracker = createTracker();
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Expected window selection');
    }
    const range = document.createRange();
    range.setStart(target.firstChild, 0);
    range.setEnd(target.firstChild, 'ui text'.length);
    selection.removeAllRanges();
    selection.addRange(range);

    tracker.handleSelectionChange();

    expect(lastSelectionSnapshot).toBeNull();
  });

  it('ignores editable selections when selectionchange fires', () => {
    document.body.innerHTML = '<div contenteditable="true" id="editor">editable text</div>';
    const target = document.getElementById('editor');
    if (!target?.firstChild) {
      throw new Error('Expected editable selection target');
    }

    const tracker = createTracker();
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Expected window selection');
    }
    const range = document.createRange();
    range.setStart(target.firstChild, 0);
    range.setEnd(target.firstChild, 'editable text'.length);
    selection.removeAllRanges();
    selection.addRange(range);

    tracker.handleSelectionChange();

    expect(lastSelectionSnapshot).toBeNull();
  });
});
