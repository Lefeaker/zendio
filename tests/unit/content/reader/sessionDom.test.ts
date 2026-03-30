/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { handleReaderKeydown, isNodeInsideReaderUi } from '@content/reader/sessionDom';

describe('reader sessionDom helpers', () => {
  it('handles escape and modifier-enter keyboard flows', () => {
    const onCancel = vi.fn();
    const onFinish = vi.fn();
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    const preventEscape = vi.spyOn(escapeEvent, 'preventDefault');

    handleReaderKeydown(escapeEvent, {
      isPanelEditing: () => false,
      onCancel,
      onFinish
    });
    expect(preventEscape).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const editingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    const preventEditingEscape = vi.spyOn(editingEscape, 'preventDefault');
    handleReaderKeydown(editingEscape, {
      isPanelEditing: () => true,
      onCancel,
      onFinish
    });
    expect(preventEditingEscape).not.toHaveBeenCalled();

    const finishEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    const preventFinish = vi.spyOn(finishEvent, 'preventDefault');
    handleReaderKeydown(finishEvent, {
      isPanelEditing: () => false,
      onCancel,
      onFinish
    });
    expect(preventFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('detects nodes rendered inside the reader panel or clipper dialog', () => {
    const panel = document.createElement('div');
    const panelChild = document.createElement('span');
    panel.append(panelChild);
    document.body.append(panel);

    const dialog = document.createElement('div');
    dialog.id = 'obsidian-clipper-dialog';
    const dialogChild = document.createElement('span');
    dialog.append(dialogChild);
    document.body.append(dialog);

    const textNode = document.createTextNode('inside panel');
    panelChild.append(textNode);

    expect(isNodeInsideReaderUi(null, panel, document)).toBe(false);
    expect(isNodeInsideReaderUi(panelChild, panel, document)).toBe(true);
    expect(isNodeInsideReaderUi(textNode, panel, document)).toBe(true);
    expect(isNodeInsideReaderUi(dialogChild, null, document)).toBe(true);
    expect(isNodeInsideReaderUi(document.createElement('section'), panel, document)).toBe(false);
  });
});
