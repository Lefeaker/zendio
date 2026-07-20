/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { SelectionModifierTrigger } from '@content/clipper/services/selectionModifierTrigger';
import type { FragmentClipperOptions } from '@shared/types/options';

type TriggerConfig = Pick<FragmentClipperOptions, 'selectionTriggerMode' | 'selectionModifierKeys'>;

const disabled: TriggerConfig = {
  selectionTriggerMode: 'disabled',
  selectionModifierKeys: ['shift']
};
const direct: TriggerConfig = {
  selectionTriggerMode: 'direct',
  selectionModifierKeys: ['shift']
};
const modifier: TriggerConfig = {
  selectionTriggerMode: 'modifier',
  selectionModifierKeys: ['shift']
};

describe('SelectionModifierTrigger', () => {
  it('keeps disabled mode closed even when modifier event flags are present', () => {
    const trigger = new SelectionModifierTrigger();

    expect(
      trigger.beginPointerGesture(disabled, new MouseEvent('mousedown', { shiftKey: true }))
    ).toBe(false);
    expect(trigger.canTrigger(disabled, new MouseEvent('mouseup', { shiftKey: true }))).toBe(false);
    expect(trigger.shouldTrackSelection(disabled)).toBe(false);
  });

  it('allows direct mode without a modifier while still requiring a primary pointer gesture', () => {
    const trigger = new SelectionModifierTrigger();

    expect(trigger.beginPointerGesture(direct, new MouseEvent('mousedown', { button: 0 }))).toBe(
      true
    );
    expect(trigger.canTrigger(direct, new MouseEvent('mouseup', { button: 0 }))).toBe(true);

    trigger.completePointerGesture();
    expect(trigger.beginPointerGesture(direct, new MouseEvent('mousedown', { button: 1 }))).toBe(
      false
    );
  });

  it('requires the configured modifier and latches it for the complete pointer gesture', () => {
    const trigger = new SelectionModifierTrigger();

    expect(trigger.beginPointerGesture(modifier, new MouseEvent('mousedown', { button: 0 }))).toBe(
      false
    );
    expect(trigger.canTrigger(modifier, new MouseEvent('mouseup', { button: 0 }))).toBe(false);

    expect(
      trigger.beginPointerGesture(
        modifier,
        new MouseEvent('mousedown', { button: 0, shiftKey: true })
      )
    ).toBe(true);
    trigger.updateModifierState(new KeyboardEvent('keyup', { shiftKey: false }));
    expect(trigger.canTrigger(modifier, new MouseEvent('mouseup', { button: 0 }))).toBe(true);

    trigger.completePointerGesture();
    expect(trigger.canTrigger(modifier, new MouseEvent('mouseup', { button: 0 }))).toBe(false);
  });

  it('rejects modifier mode when the key configuration is empty', () => {
    const trigger = new SelectionModifierTrigger();
    const invalid: TriggerConfig = {
      selectionTriggerMode: 'modifier',
      selectionModifierKeys: []
    };

    expect(
      trigger.beginPointerGesture(invalid, new MouseEvent('mousedown', { shiftKey: true }))
    ).toBe(false);
    expect(trigger.canTrigger(invalid, new MouseEvent('mouseup', { shiftKey: true }))).toBe(false);
  });

  it('resets held keys and an armed gesture after window blur', () => {
    const trigger = new SelectionModifierTrigger();

    trigger.beginPointerGesture(
      modifier,
      new MouseEvent('mousedown', { button: 0, shiftKey: true })
    );
    trigger.reset();

    expect(trigger.shouldTrackSelection(modifier)).toBe(false);
    expect(trigger.canTrigger(modifier, new MouseEvent('mouseup', { button: 0 }))).toBe(false);
  });
});
