/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionCaptureController } from '@content/video/selectionCaptureController';
import { selection as mkSelection } from '../../../utils/typeHelpers';

function createSelection(
  range: Range,
  collapsed = false
): { selection: Selection; removeAllRanges: ReturnType<typeof vi.fn> } {
  const removeAllRanges = vi.fn();
  return {
    selection: mkSelection({
      rangeCount: collapsed ? 0 : 1,
      isCollapsed: collapsed,
      getRangeAt: () => range,
      removeAllRanges
    }),
    removeAllRanges
  };
}

describe('SelectionCaptureController', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="copy">Hello world</p>';
  });

  it('captures active ranges on selectionchange and activates them on mouseup', () => {
    const textNode = document.getElementById('copy')?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('missing text node');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn((): Range | null => null),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => false),
      scheduleClear: vi.fn()
    };
    const { selection } = createSelection(range);
    const onSelectionActivated = vi.fn();
    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: pendingSelection as any,
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => false,
      getDocumentSelection: () => selection,
      onSelectionActivated
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(pendingSelection.capture).toHaveBeenCalled();
    expect(pendingSelection.reset).toHaveBeenCalled();
    const activationCalls = onSelectionActivated.mock.calls as Array<[{ range: Range }]>;
    const activation = activationCalls[0]?.[0];
    expect(activation).toBeTruthy();
    expect(activation?.range).toBeInstanceOf(Range);
  });

  it('does not capture pending ranges while video selection tracking is inactive', () => {
    const textNode = document.getElementById('copy')?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('missing text node');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn((): Range | null => range),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => false),
      scheduleClear: vi.fn()
    };
    const { selection } = createSelection(range);
    const onSelectionActivated = vi.fn();
    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: pendingSelection as any,
      shouldTrackSelection: () => false,
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => false,
      getDocumentSelection: () => selection,
      onSelectionActivated
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(pendingSelection.capture).not.toHaveBeenCalled();
    expect(onSelectionActivated).not.toHaveBeenCalled();
  });

  it('clears pending selection when the active range is inside UI', () => {
    const textNode = document.getElementById('copy')?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('missing text node');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const { selection, removeAllRanges } = createSelection(range);
    const onSelectionCleared = vi.fn();
    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn(() => range),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => false),
      scheduleClear: vi.fn()
    };

    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: pendingSelection as any,
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => true,
      getDocumentSelection: () => selection,
      onSelectionActivated: vi.fn(),
      onSelectionCleared
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(pendingSelection.reset).toHaveBeenCalled();
    expect(onSelectionCleared).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('schedules clear when selection collapses after an active range exists', () => {
    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn((): Range | null => null),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => true),
      scheduleClear: vi.fn()
    };
    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: pendingSelection as any,
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => false,
      getDocumentSelection: () => createSelection(document.createRange(), true).selection,
      onSelectionActivated: vi.fn()
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));

    expect(pendingSelection.scheduleClear).toHaveBeenCalled();
  });
});
