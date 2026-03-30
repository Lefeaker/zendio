import { describe, it, expect, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { UiInput } from '../../../../src/ui/primitives/input';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyInput', () => {
  it('renders DaisyUI classes for variant and size', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const input = new UiInput(container);
      const element = input.render({
        variant: 'ghost',
        size: 'lg'
      });

      expect(element.className).toContain('input');
      expect(element.className).toContain('input-ghost');
      expect(element.className).toContain('input-lg');
    });
  });

  it('supports different input types', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const input = new UiInput(container);
      const element = input.render({
        type: 'email'
      });

      expect(element.type).toBe('email');
    });
  });

  it('emits onChange events with value payload', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document, window }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const handleChange = vi.fn();
      const input = new UiInput(container);
      const element = input.render({
        onChange: handleChange
      });

      element.value = 'hello';
      element.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(handleChange).toHaveBeenCalledWith('hello', expect.any(Event));
    });
  });

  it('emits onBlur events with value payload', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document, window }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const handleBlur = vi.fn();
      const input = new UiInput(container);
      const element = input.render({
        onBlur: handleBlur
      });

      element.value = 'world';
      element.dispatchEvent(new window.Event('blur', { bubbles: true }));

      expect(handleBlur).toHaveBeenCalledWith('world', expect.any(Event));
    });
  });

  it('respects disabled and required states', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const input = new UiInput(container);
      const element = input.render({
        disabled: true,
        required: true
      });

      expect(element.disabled).toBe(true);
      expect(element.required).toBe(true);
    });
  });

  it('applies validation state and aria metadata', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const input = new UiInput(container);
      const element = input.render({
        validationState: 'error',
        ariaDescribedBy: 'field-error'
      });

      expect(element.className).toContain('input-error');
      expect(element.getAttribute('aria-invalid')).toBe('true');
      expect(element.getAttribute('aria-describedby')).toBe('field-error');
    });
  });
});
