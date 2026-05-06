/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { VideoFragmentSelectionController } from '@content/video/videoFragmentSelectionController';
import type { VideoPlatformAdapter } from '@content/video/platforms';
import type { PendingSelectionTracker } from '@content/video/pendingSelectionTracker';
import { selection as mkSelection, asType } from '../../../utils/typeHelpers';
import type { FragmentClipperOptions } from '@shared/types/options';

function createRangeAndSelection(text = 'Selected text'): {
  range: Range;
  selection: Selection;
  removeAllRanges: ReturnType<typeof vi.fn>;
} {
  document.body.innerHTML = `<p id="text">${text}</p>`;
  const textNode = document.getElementById('text')?.firstChild;
  if (!(textNode instanceof Text)) throw new Error('missing text node');
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, text.length);
  const removeAllRanges = vi.fn();
  const selection = mkSelection({
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range,
    toString: () => text,
    removeAllRanges
  });
  return { range, selection, removeAllRanges };
}

function createConfig(overrides: Partial<FragmentClipperOptions> = {}): FragmentClipperOptions {
  return {
    useFootnoteFormat: false,
    captureContext: true,
    contextLength: 100,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: [],
    keyboardShortcutsEnabled: true,
    ...overrides
  };
}

describe('VideoFragmentSelectionController', () => {
  it('accepts resolved platform selections when modifiers are not required', () => {
    const { range, selection, removeAllRanges } = createRangeAndSelection();
    const onSelectionAccepted = vi.fn();
    const controller = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>({
          reset: vi.fn()
        } as Partial<PendingSelectionTracker>),
        getFragmentConfig: () => createConfig(),
        getPlatformAdapter: () =>
          asType<VideoPlatformAdapter>({
            resolveSelection: vi.fn(() => ({
              text: 'Normalized',
              html: '<p>Normalized</p>',
              range
            }))
          })
      },
      { onSelectionAccepted }
    );

    controller.processActivatedSelection({
      range,
      selection,
      event: new MouseEvent('mouseup', { bubbles: true, button: 0 })
    });

    const acceptedCalls = onSelectionAccepted.mock.calls as Array<
      [{ selectedHtml: string; selectedText: string; range: Range }]
    >;
    const accepted = acceptedCalls[0]?.[0];
    expect(accepted).toMatchObject({
      selectedHtml: '<p>Normalized</p>',
      selectedText: 'Normalized'
    });
    expect(accepted?.range).toBeInstanceOf(Range);
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('ignores selections rejected by the platform adapter', () => {
    const { range, selection, removeAllRanges } = createRangeAndSelection();
    const controller = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>({
          reset: vi.fn()
        } as Partial<PendingSelectionTracker>),
        getFragmentConfig: () => createConfig(),
        getPlatformAdapter: () =>
          asType<VideoPlatformAdapter>({ resolveSelection: vi.fn(() => null) })
      },
      { onSelectionAccepted: vi.fn() }
    );

    controller.processActivatedSelection({
      range,
      selection,
      event: new MouseEvent('mouseup', { bubbles: true, button: 0 })
    });

    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('requires configured modifier keys before accepting a selection', () => {
    const { range, selection } = createRangeAndSelection();
    const onSelectionAccepted = vi.fn();
    const controller = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>({
          reset: vi.fn()
        } as Partial<PendingSelectionTracker>),
        getFragmentConfig: () =>
          createConfig({
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift'] as const
          }),
        getPlatformAdapter: () =>
          asType<VideoPlatformAdapter>({
            resolveSelection: vi.fn(() => ({
              text: 'Normalized',
              html: '<p>Normalized</p>',
              range
            }))
          })
      },
      { onSelectionAccepted }
    );

    controller.handleMouseDown(new MouseEvent('mousedown', { button: 0 }));
    controller.processActivatedSelection({
      range,
      selection,
      event: new MouseEvent('mouseup', { bubbles: true, button: 0 })
    });
    expect(onSelectionAccepted).not.toHaveBeenCalled();

    controller.handleMouseDown(new MouseEvent('mousedown', { button: 0, shiftKey: true }));
    controller.processActivatedSelection({
      range,
      selection,
      event: new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true })
    });
    expect(onSelectionAccepted).toHaveBeenCalledTimes(1);
  });

  it('reports selection tracking only while configured modifiers are active', () => {
    const controller = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>({
          reset: vi.fn()
        } as Partial<PendingSelectionTracker>),
        getFragmentConfig: () =>
          createConfig({
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift'] as const
          }),
        getPlatformAdapter: () => null
      },
      { onSelectionAccepted: vi.fn() }
    );

    expect(controller.shouldTrackSelection()).toBe(false);
    controller.handleKeyDown(new KeyboardEvent('keydown', { shiftKey: true }));
    expect(controller.shouldTrackSelection()).toBe(true);
  });

  it('resets modifier state and pending selection on window blur', () => {
    const pendingSelection = { reset: vi.fn() };
    const controller = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
        getFragmentConfig: () =>
          createConfig({
            selectionModifierEnabled: true,
            selectionModifierKeys: ['ctrl'] as const
          }),
        getPlatformAdapter: () => null
      },
      { onSelectionAccepted: vi.fn() }
    );

    controller.handleMouseDown(new MouseEvent('mousedown', { button: 0, ctrlKey: true }));
    controller.handleWindowBlur();

    expect(pendingSelection.reset).toHaveBeenCalled();
  });
});
