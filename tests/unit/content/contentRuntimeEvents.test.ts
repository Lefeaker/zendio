/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentRuntimeEvents } from '@content/runtime/contentRuntimeEvents';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';

function createRuntimeState(): ContentRuntimeState {
  let autoSelectionInFlight = false;
  let clipMode: 'full' | 'selection' = 'full';
  let selectionModifierActive = true;
  const modifierState = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  return {
    getClipMode: () => clipMode,
    setClipMode: (mode) => {
      clipMode = mode;
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
    getAutoSelectionInFlight: () => autoSelectionInFlight,
    setAutoSelectionInFlight: (value) => {
      autoSelectionInFlight = value;
    },
    getModifierState: () => modifierState as never,
    isSelectionModifierActive: () => selectionModifierActive,
    setSelectionModifierActive: (value) => {
      selectionModifierActive = value;
    },
    getLastSelectionSnapshot: () => null,
    setLastSelectionSnapshot: vi.fn(),
    resetSelectionTracking: vi.fn(),
    startOptionsLifecycle: vi.fn(),
    stopOptionsLifecycle: vi.fn(),
    refreshFragmentConfig: vi.fn(async () => undefined)
  };
}

describe('contentRuntimeEvents', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="content">auto selection</p>';
    vi.restoreAllMocks();
  });

  it('triggers clip orchestration for valid auto selections and resets state after completion', async () => {
    const runtimeState = createRuntimeState();
    const runClip = vi.fn().mockResolvedValue(undefined);
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => 'auto selection'
    } as Selection;
    const tracker = {
      resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
      isSelectionInsideUi: vi.fn(() => false),
      isSelectionEditable: vi.fn(() => false),
      handleSelectionChange: vi.fn(),
      handleSelectStart: vi.fn()
    };

    const detach = createContentRuntimeEvents({
      document,
      window,
      runtimeState,
      selectionTracker: tracker as never,
      isReaderSessionActive: vi.fn(() => false),
      runClip
    }).attach();

    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    await vi.waitFor(() => {
      expect(runClip).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(runtimeState.getAutoSelectionInFlight()).toBe(false);
    });
    expect(runtimeState.getClipMode()).toBe('selection');
    expect(runtimeState.isSelectionModifierActive()).toBe(false);

    detach();
  });

  it('ignores auto selections inside UI containers', () => {
    const runtimeState = createRuntimeState();
    const runClip = vi.fn().mockResolvedValue(undefined);
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => 'auto selection'
    } as Selection;

    const detach = createContentRuntimeEvents({
      document,
      window,
      runtimeState,
      selectionTracker: {
        resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
        isSelectionInsideUi: vi.fn(() => true),
        isSelectionEditable: vi.fn(() => false),
        handleSelectionChange: vi.fn(),
        handleSelectStart: vi.fn()
      } as never,
      isReaderSessionActive: vi.fn(() => false),
      runClip
    }).attach();

    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

    expect(runClip).not.toHaveBeenCalled();
    expect(runtimeState.isSelectionModifierActive()).toBe(false);

    detach();
  });

  it('removes registered runtime listeners on teardown', () => {
    const runtimeState = createRuntimeState();
    const addDocumentListener = vi.spyOn(document, 'addEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');

    const detach = createContentRuntimeEvents({
      document,
      window,
      runtimeState,
      selectionTracker: {
        resolveActiveSelection: vi.fn(),
        isSelectionInsideUi: vi.fn(),
        isSelectionEditable: vi.fn(),
        handleSelectionChange: vi.fn(),
        handleSelectStart: vi.fn()
      } as never,
      isReaderSessionActive: vi.fn(() => false),
      runClip: vi.fn()
    }).attach();

    detach();

    expect(addDocumentListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(addDocumentListener).toHaveBeenCalledWith('selectstart', expect.any(Function), true);
    expect(addWindowListener).toHaveBeenCalledWith('blur', expect.any(Function), true);
    expect(removeDocumentListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(removeDocumentListener).toHaveBeenCalledWith('selectstart', expect.any(Function), true);
    expect(removeWindowListener).toHaveBeenCalledWith('blur', expect.any(Function), true);
  });
});
