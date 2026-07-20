/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleAutoSelectionClip,
  handlePrimaryMouseDown
} from '@content/runtime/autoSelectionTrigger';
import { wireDomEvents } from '@content/runtime/domEvents';
import {
  __resetContentSessionRegistryForTests,
  clearVideoSession,
  registerVideoSession
} from '@content/runtime/contentSessionRegistry';
import { SelectionModifierTrigger } from '@content/clipper/services/selectionModifierTrigger';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';
import type { FragmentSelectionTriggerMode } from '@shared/types/options';

function createRuntimeState(mode: FragmentSelectionTriggerMode): ContentRuntimeState {
  let autoSelectionInFlight = false;
  let clipMode: 'full' | 'selection' = 'full';
  const selectionTrigger = new SelectionModifierTrigger();

  return {
    getClipMode: () => clipMode,
    setClipMode: (nextMode) => {
      clipMode = nextMode;
    },
    getFragmentClipperConfig: () => ({
      useFootnoteFormat: false,
      captureContext: false,
      contextLength: 200,
      contextMode: 'chars',
      selectionTriggerMode: mode,
      selectionModifierKeys: ['shift'],
      keyboardShortcutsEnabled: false
    }),
    getAutoSelectionInFlight: () => autoSelectionInFlight,
    setAutoSelectionInFlight: (value) => {
      autoSelectionInFlight = value;
    },
    getSelectionModifierTrigger: () => selectionTrigger,
    getLastSelectionSnapshot: () => null,
    setLastSelectionSnapshot: vi.fn(),
    resetSelectionTracking: () => selectionTrigger.reset(),
    startOptionsLifecycle: vi.fn(),
    stopOptionsLifecycle: vi.fn(),
    refreshFragmentConfig: vi.fn(async () => undefined)
  };
}

function createTracker(options: { insideUi?: boolean } = {}) {
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    toString: () => 'auto selection'
  } as Selection;
  return {
    resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
    isSelectionInsideUi: vi.fn(() => Boolean(options.insideUi)),
    isSelectionEditable: vi.fn(() => false),
    handleSelectionChange: vi.fn(),
    handleSelectStart: vi.fn()
  };
}

describe('production auto selection trigger', () => {
  beforeEach(() => {
    __resetContentSessionRegistryForTests(document);
    vi.restoreAllMocks();
  });

  it('supports direct mode without a modifier', async () => {
    const runtimeState = createRuntimeState('direct');
    const runClip = vi.fn().mockResolvedValue(undefined);
    const event = new MouseEvent('mouseup', { button: 0 });

    handlePrimaryMouseDown(runtimeState, new MouseEvent('mousedown', { button: 0 }));
    handleAutoSelectionClip(document, runtimeState, createTracker() as never, runClip, event);

    await vi.waitFor(() => expect(runClip).toHaveBeenCalledTimes(1));
    expect(runtimeState.getClipMode()).toBe('selection');
    expect(runtimeState.getAutoSelectionInFlight()).toBe(false);
  });

  it('keeps disabled mode closed even for valid selections', () => {
    const runtimeState = createRuntimeState('disabled');
    const runClip = vi.fn().mockResolvedValue(undefined);
    const tracker = createTracker();

    handlePrimaryMouseDown(runtimeState, new MouseEvent('mousedown', { button: 0 }));
    handleAutoSelectionClip(
      document,
      runtimeState,
      tracker as never,
      runClip,
      new MouseEvent('mouseup', { button: 0, shiftKey: true })
    );

    expect(runClip).not.toHaveBeenCalled();
    expect(tracker.resolveActiveSelection).not.toHaveBeenCalled();
  });

  it('requires and latches the configured modifier in modifier mode', async () => {
    const runtimeState = createRuntimeState('modifier');
    const runClip = vi.fn().mockResolvedValue(undefined);

    handlePrimaryMouseDown(runtimeState, new MouseEvent('mousedown', { button: 0 }));
    handleAutoSelectionClip(
      document,
      runtimeState,
      createTracker() as never,
      runClip,
      new MouseEvent('mouseup', { button: 0 })
    );
    expect(runClip).not.toHaveBeenCalled();

    handlePrimaryMouseDown(
      runtimeState,
      new MouseEvent('mousedown', { button: 0, shiftKey: true })
    );
    handleAutoSelectionClip(
      document,
      runtimeState,
      createTracker() as never,
      runClip,
      new MouseEvent('mouseup', { button: 0 })
    );
    await vi.waitFor(() => expect(runClip).toHaveBeenCalledTimes(1));
  });

  it('lets the active video session own selection capture', () => {
    const runtimeState = createRuntimeState('direct');
    const runClip = vi.fn().mockResolvedValue(undefined);
    const videoSession = {};
    registerVideoSession(videoSession, document);

    handlePrimaryMouseDown(runtimeState, new MouseEvent('mousedown', { button: 0 }));
    handleAutoSelectionClip(
      document,
      runtimeState,
      createTracker() as never,
      runClip,
      new MouseEvent('mouseup', { button: 0 })
    );

    expect(runClip).not.toHaveBeenCalled();
    clearVideoSession(videoSession, document);
  });

  it('ignores selections owned by Zendio UI', () => {
    const runtimeState = createRuntimeState('direct');
    const runClip = vi.fn().mockResolvedValue(undefined);

    handlePrimaryMouseDown(runtimeState, new MouseEvent('mousedown', { button: 0 }));
    handleAutoSelectionClip(
      document,
      runtimeState,
      createTracker({ insideUi: true }) as never,
      runClip,
      new MouseEvent('mouseup', { button: 0 })
    );

    expect(runClip).not.toHaveBeenCalled();
  });

  it('wires and removes the production DOM event set', () => {
    const handlers = {
      handleModifierKey: vi.fn(),
      handleWindowBlur: vi.fn(),
      handlePrimaryMouseDown: vi.fn(),
      handleAutoSelectionClip: vi.fn(),
      handleSelectionChange: vi.fn(),
      handleSelectStart: vi.fn()
    };
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');

    const disposer = wireDomEvents({ document, window, handlers });
    disposer.dispose();

    expect(removeDocumentListener).toHaveBeenCalledWith('mouseup', expect.any(Function), true);
    expect(removeDocumentListener).toHaveBeenCalledWith('selectstart', expect.any(Function), true);
    expect(removeWindowListener).toHaveBeenCalledWith('blur', expect.any(Function), true);
  });
});
