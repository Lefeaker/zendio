/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createInputElement } from '../../../../src/ui/primitives/input';
import { createSelectElement } from '../../../../src/ui/primitives/select';
import { createTextareaElement } from '../../../../src/ui/primitives/textarea';
import { createToggleElement } from '../../../../src/ui/primitives/toggle';

describe('ui form-control primitives', () => {
  it('input exposes validation and described-by contract', () => {
    const input = createInputElement({
      value: 'oops',
      validationState: 'error',
      ariaDescribedBy: 'input-help',
      dataAttributes: { role: 'input' }
    });

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('input-help');
    expect(input.dataset.role).toBe('input');
  });

  it('select exposes options and validation contract', () => {
    const onChange = vi.fn();
    const select = createSelectElement({
      value: 'b',
      validationState: 'error',
      ariaDescribedBy: 'select-help',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta', dataAttributes: { slot: 'beta' } }
      ],
      onChange
    });

    select.value = 'a';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe('select-help');
    expect(select.options[1]?.dataset.slot).toBe('beta');
    expect(onChange).toHaveBeenCalledWith('a', expect.any(Event));
  });

  it('textarea and toggle preserve value/checked contracts', () => {
    const onTextareaChange = vi.fn();
    const textarea = createTextareaElement({
      value: 'hello',
      rows: 4,
      ariaLabel: 'Notes',
      onChange: onTextareaChange
    });
    textarea.value = 'updated';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const onToggleChange = vi.fn();
    const toggle = createToggleElement({
      checked: true,
      ariaLabel: 'Dark mode',
      onChange: onToggleChange
    });
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(textarea.rows).toBe(4);
    expect(textarea.getAttribute('aria-label')).toBe('Notes');
    expect(onTextareaChange).toHaveBeenCalledWith('updated', expect.any(Event));
    expect(toggle.checked).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Dark mode');
    expect(onToggleChange).toHaveBeenCalledWith(false, expect.any(Event));
  });

  it('preserves native input, textarea and disabled toggle semantics', () => {
    const input = createInputElement({ value: '1', readOnly: true, min: 0, max: 2, step: 1 });
    const textarea = createTextareaElement({ value: 'notes', disabled: true, readOnly: true });
    const toggle = createToggleElement({ checked: true, disabled: true });

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.readOnly).toBe(true);
    expect(input.max).toBe('2');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    expect(textarea.disabled).toBe(true);
    expect(toggle.disabled).toBe(true);
  });
});
