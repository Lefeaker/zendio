/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShadowSelectionBridge } from '@content/video/shadowSelectionBridge';
import type { PendingSelectionTracker } from '@content/video/pendingSelectionTracker';
import { asType, selection as mkSelection } from '../../../utils/typeHelpers';

type PendingSelectionMock = {
  capture: ReturnType<typeof vi.fn>;
  consume: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  hasActiveRange: ReturnType<typeof vi.fn>;
  scheduleClear: ReturnType<typeof vi.fn>;
};

function createPendingSelectionMock(): PendingSelectionMock {
  return {
    capture: vi.fn(),
    consume: vi.fn((): Range | null => null),
    reset: vi.fn(),
    hasActiveRange: vi.fn(() => false),
    scheduleClear: vi.fn()
  };
}

function createHarness() {
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host');
  if (!(host instanceof HTMLDivElement)) {
    throw new Error('missing host');
  }

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<span id="copy">Hello world</span>';

  let currentSelection: Selection | null = null;
  Object.defineProperty(root, 'getSelection', {
    configurable: true,
    value: () => currentSelection
  });

  const pendingSelection = createPendingSelectionMock();
  const activatePendingSelection = vi.fn();
  let selectionTriggerConfigured = true;
  const bridge = new ShadowSelectionBridge({
    suppressSelectionCapture: () => false,
    isSelectionTriggerConfigured: () => selectionTriggerConfigured,
    getDocumentSelection: () => currentSelection,
    isRangeInsideUi: () => false,
    pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
    activatePendingSelection
  });

  const setActiveSelection = () => {
    const textNode = root.querySelector('#copy')?.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('missing shadow text node');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    currentSelection = mkSelection({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range
    });
    return currentSelection;
  };

  return {
    root,
    pendingSelection,
    activatePendingSelection,
    bridge,
    setSelectionTriggerConfigured: (configured: boolean) => {
      selectionTriggerConfigured = configured;
    },
    setActiveSelection
  };
}

describe('ShadowSelectionBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not add duplicate listeners when the same root is registered twice', () => {
    const { bridge, root, pendingSelection, setActiveSelection } = createHarness();

    setActiveSelection();
    bridge.register(root);
    bridge.register(root);

    root.dispatchEvent(new Event('selectionchange', { bubbles: true }));

    expect(pendingSelection.capture).toHaveBeenCalledTimes(1);
  });

  it('unregisters one owned root, cancels late work, and allows the same root to register again', async () => {
    const { bridge, root, pendingSelection, activatePendingSelection, setActiveSelection } =
      createHarness();
    const removeSpy = vi.spyOn(root, 'removeEventListener');

    bridge.register(root);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    bridge.unregister(root);
    await vi.runAllTimersAsync();

    expect(removeSpy).toHaveBeenCalledWith('selectionchange', expect.any(Function), true);
    expect(activatePendingSelection).not.toHaveBeenCalled();

    setActiveSelection();
    bridge.register(root);
    root.dispatchEvent(new Event('selectionchange', { bubbles: true }));

    expect(pendingSelection.capture).toHaveBeenCalledTimes(1);
  });

  it('removes registered root listeners on reset and stops post-reset activation', async () => {
    const { bridge, root, activatePendingSelection } = createHarness();
    const removeSpy = vi.spyOn(root, 'removeEventListener');

    bridge.register(root);
    bridge.reset();

    expect(removeSpy).toHaveBeenCalledWith('selectionchange', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function), true);

    root.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 12,
        clientY: 18
      })
    );
    await vi.runAllTimersAsync();

    expect(activatePendingSelection).not.toHaveBeenCalled();
  });

  it('cancels queued activation callbacks when reset runs after mouseup but before timers flush', async () => {
    const { bridge, root, activatePendingSelection } = createHarness();

    bridge.register(root);
    root.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 12,
        clientY: 18
      })
    );

    bridge.reset();
    await vi.runAllTimersAsync();

    expect(activatePendingSelection).not.toHaveBeenCalled();
  });

  it('allows a root to be registered again after reset with one active listener set', () => {
    const { bridge, root, pendingSelection, setActiveSelection } = createHarness();

    setActiveSelection();
    bridge.register(root);
    bridge.reset();
    pendingSelection.capture.mockClear();

    bridge.register(root);
    root.dispatchEvent(new Event('selectionchange', { bubbles: true }));

    expect(pendingSelection.capture).toHaveBeenCalledTimes(1);
  });

  it('passes the owning shadow selection to activation so accepted captures can clear it', async () => {
    const { bridge, root, activatePendingSelection, setActiveSelection } = createHarness();
    const sourceSelection = setActiveSelection();

    bridge.register(root);
    root.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10
      })
    );
    root.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 10,
        shiftKey: true
      })
    );
    await vi.runAllTimersAsync();

    expect(activatePendingSelection).toHaveBeenCalledWith(
      expect.any(Event),
      expect.objectContaining({
        allowEventFallback: true,
        sourceSelection
      })
    );
  });

  it('does not retain or activate shadow selections while auto-trigger is disabled', async () => {
    const {
      bridge,
      root,
      pendingSelection,
      activatePendingSelection,
      setActiveSelection,
      setSelectionTriggerConfigured
    } = createHarness();
    setActiveSelection();
    setSelectionTriggerConfigured(false);
    bridge.register(root);

    root.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    root.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })
    );
    root.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 40, clientY: 10 })
    );
    await vi.runAllTimersAsync();

    expect(pendingSelection.capture).not.toHaveBeenCalled();
    expect(pendingSelection.reset).toHaveBeenCalled();
    expect(activatePendingSelection).not.toHaveBeenCalled();
  });
});
