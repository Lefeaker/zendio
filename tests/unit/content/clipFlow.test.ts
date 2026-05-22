/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initClipFlow } from '@content/runtime/clipFlow';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';
import type { ContentSelectionTracker } from '@content/runtime/contentSelectionTracker';

function createRuntimeState(mode: 'full' | 'selection'): ContentRuntimeState {
  let clipMode = mode;
  return {
    getClipMode: () => clipMode,
    setClipMode: (next) => {
      clipMode = next;
    },
    getFragmentClipperConfig: () => ({
      useFootnoteFormat: false,
      captureContext: false,
      contextLength: 0,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: [],
      keyboardShortcutsEnabled: false
    }),
    getAutoSelectionInFlight: () => false,
    setAutoSelectionInFlight: vi.fn(),
    getModifierState: vi.fn() as never,
    isSelectionModifierActive: () => false,
    setSelectionModifierActive: vi.fn(),
    getLastSelectionSnapshot: () => null,
    setLastSelectionSnapshot: vi.fn(),
    resetSelectionTracking: vi.fn(),
    startOptionsLifecycle: vi.fn(),
    stopOptionsLifecycle: vi.fn(),
    refreshFragmentConfig: vi.fn(async () => undefined)
  };
}

function createSelectionTracker(selection: Selection): ContentSelectionTracker {
  return {
    resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
    restoreSelectionFromSnapshot: vi.fn(() => null),
    getLastSelectionSnapshot: vi.fn(() => null),
    setLastSelectionSnapshot: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleSelectStart: vi.fn(),
    captureSelectionSnapshot: vi.fn(),
    findActiveSelection: vi.fn(),
    isSelectionInsideUi: vi.fn(() => false),
    isSelectionEditable: vi.fn(() => false)
  } as never;
}

function createSelection(): Selection {
  return {
    rangeCount: 1,
    isCollapsed: false,
    toString: () => 'selected text'
  } as Selection;
}

describe('clipFlow support progress', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article>selected text</article>';
    window.history.replaceState(null, '', '/article');
  });

  it('does not show support progress while the selection dialog is only open or cancelled', async () => {
    const showSupportProgress = vi.fn();
    const flow = initClipFlow({
      document,
      messaging: { send: vi.fn() },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(async () => null),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract: vi.fn() } as never,
      showSupportProgress
    });

    await flow.handleClip();

    expect(showSupportProgress).not.toHaveBeenCalled();
  });

  it('shows support progress only after a selection clip is confirmed', async () => {
    const showSupportProgress = vi.fn();
    const send = vi.fn(async () => undefined);
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(async () => ({
          markdown: '# selected',
          type: 'clipper'
        })),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract: vi.fn() } as never,
      showSupportProgress
    });

    await flow.handleClip();

    expect(showSupportProgress).toHaveBeenCalledWith({
      value: 16,
      label: '正在发送选区剪藏'
    });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# selected', type: 'clipper' }
    });
  });

  it('dispatches full-page clips through the extractor registry and messaging service', async () => {
    const send = vi.fn(async () => undefined);
    const extract = vi.fn(async () => ({
      markdown: '# article',
      type: 'article'
    }));
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('full'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract } as never
    });

    await flow.handleClip();

    expect(extract).toHaveBeenCalledWith({ url: location.href, document });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# article', type: 'article' }
    });
  });
});
