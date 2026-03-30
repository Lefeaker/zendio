/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentClipOrchestrator } from '@content/runtime/contentClipOrchestrator';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';
import type { SelectionSnapshot } from '@content/runtime/contentSelectionTracker';
import { ErrorHandler, registerErrorHandler } from '@shared/errors/errorHandler';

function createRuntimeState(): ContentRuntimeState {
  let clipMode: 'full' | 'selection' = 'selection';
  let snapshot = ({ id: 'saved' } as unknown) as SelectionSnapshot | null;

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
    getAutoSelectionInFlight: () => false,
    setAutoSelectionInFlight: vi.fn(),
    getModifierState: vi.fn() as never,
    isSelectionModifierActive: () => false,
    setSelectionModifierActive: vi.fn(),
    getLastSelectionSnapshot: () => snapshot,
    setLastSelectionSnapshot: (next) => {
      snapshot = next;
    },
    resetSelectionTracking: vi.fn(),
    startOptionsLifecycle: vi.fn(),
    stopOptionsLifecycle: vi.fn(),
    refreshFragmentConfig: vi.fn(async () => undefined)
  };
}

describe('contentClipOrchestrator', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article><p id="content">hello selection</p></article>';
    registerErrorHandler(() => new ErrorHandler());
    vi.restoreAllMocks();
  });

  it('dispatches selection clip results and resets runtime state', async () => {
    const runtimeState = createRuntimeState();
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => 'hello selection'
    } as Selection;
    const messaging = { send: vi.fn().mockResolvedValue(undefined) };
    const selectionController = {
      handleSelectionClip: vi.fn().mockResolvedValue({ markdown: '# hello', type: 'selection' }),
      handleVideoSelectionClip: vi.fn(),
      handleVideoSelectionClipFromData: vi.fn()
    };
    const orchestrator = createContentClipOrchestrator({
      document,
      messaging,
      runtimeState,
      selectionTracker: {
        resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
        restoreSelectionFromSnapshot: vi.fn(() => null),
        getLastSelectionSnapshot: vi.fn(),
        setLastSelectionSnapshot: vi.fn(),
        handleSelectionChange: vi.fn(),
        handleSelectStart: vi.fn(),
        captureSelectionSnapshot: vi.fn(),
        findActiveSelection: vi.fn(),
        isSelectionInsideUi: vi.fn(() => false),
        isSelectionEditable: vi.fn(() => false)
      } as never,
      selectionController: selectionController as never,
      extractorRegistry: { extract: vi.fn() },
      isVideoSessionActive: vi.fn(() => false)
    });

    await orchestrator.runClip();

    expect(selectionController.handleSelectionClip).toHaveBeenCalledWith(document, location.href, selection);
    expect(messaging.send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# hello', type: 'selection' }
    });
    expect(runtimeState.getClipMode()).toBe('full');
    expect(runtimeState.getLastSelectionSnapshot()).toBeNull();
  });

  it('emits clip errors when selection clipping fails', async () => {
    const runtimeState = createRuntimeState();
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => 'hello selection'
    } as Selection;
    const messaging = { send: vi.fn().mockResolvedValue(undefined) };
    const orchestrator = createContentClipOrchestrator({
      document,
      messaging,
      runtimeState,
      selectionTracker: {
        resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
        restoreSelectionFromSnapshot: vi.fn(() => null),
        getLastSelectionSnapshot: vi.fn(),
        setLastSelectionSnapshot: vi.fn(),
        handleSelectionChange: vi.fn(),
        handleSelectStart: vi.fn(),
        captureSelectionSnapshot: vi.fn(),
        findActiveSelection: vi.fn(),
        isSelectionInsideUi: vi.fn(() => false),
        isSelectionEditable: vi.fn(() => false)
      } as never,
      selectionController: {
        handleSelectionClip: vi.fn().mockRejectedValue(new Error('boom')),
        handleVideoSelectionClip: vi.fn(),
        handleVideoSelectionClipFromData: vi.fn()
      } as never,
      extractorRegistry: { extract: vi.fn() },
      isVideoSessionActive: vi.fn(() => false)
    });

    await orchestrator.runClip();

    expect(messaging.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLIP_ERROR',
        error: expect.objectContaining({
          code: 'CONTENT_CLIP_FAILURE',
          domain: 'content'
        })
      })
    );
  });
});
