/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderSelectionController } from '@content/reader/services/selectionController';
import type { FragmentClipperOptions } from '@shared/types/options';

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

function installSelection(text = 'Hello world'): { selection: Selection; removeAllRanges: ReturnType<typeof vi.fn> } {
  document.body.innerHTML = `<p id="source">${text}</p>`;
  const node = document.getElementById('source')?.firstChild;
  if (!(node instanceof Text)) throw new Error('missing source text');
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, text.length);
  const removeAllRanges = vi.fn();
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: node,
    focusNode: node,
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges
  } as unknown as Selection;
  vi.spyOn(window, 'getSelection').mockReturnValue(selection);
  return { selection, removeAllRanges };
}

describe('ReaderSelectionController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits ready payload for normal selections and clears browser selection', () => {
    const { removeAllRanges } = installSelection('Important quote');
    const onSelectionReady = vi.fn();
    const controller = new ReaderSelectionController({
      doc: document,
      fragmentConfig: createConfig(),
      canHandleSelection: () => true,
      isNodeInsideUi: () => false,
      onSelectionReady
    });

    controller.start();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(onSelectionReady).toHaveBeenCalledWith(expect.objectContaining({ selectedText: 'Important quote' }));
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('clears selections inside UI instead of emitting payloads', () => {
    const { removeAllRanges } = installSelection('Inside UI');
    const onSelectionCleared = vi.fn();
    const controller = new ReaderSelectionController({
      doc: document,
      fragmentConfig: createConfig(),
      canHandleSelection: () => true,
      isNodeInsideUi: () => true,
      onSelectionReady: vi.fn(),
      onSelectionCleared
    });

    controller.start();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(removeAllRanges).toHaveBeenCalled();
    expect(onSelectionCleared).toHaveBeenCalled();
  });

  it('requires configured modifier keys and resets them when config is updated or window blurs', () => {
    installSelection('Modifier text');
    const onSelectionReady = vi.fn();
    const controller = new ReaderSelectionController({
      doc: document,
      fragmentConfig: createConfig({ selectionModifierEnabled: true, selectionModifierKeys: ['shift'] as never }),
      canHandleSelection: () => true,
      isNodeInsideUi: () => false,
      onSelectionReady
    });

    controller.start();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(onSelectionReady).not.toHaveBeenCalled();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true }));
    expect(onSelectionReady).toHaveBeenCalledTimes(1);

    controller.updateFragmentConfig(createConfig({ selectionModifierEnabled: false }));
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(onSelectionReady).toHaveBeenCalledTimes(2);
  });
});
