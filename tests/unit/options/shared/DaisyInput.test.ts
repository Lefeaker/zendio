import { describe, it, expect, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { DaisyInput } from '@options/components/shared/DaisyInput';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyInput', () => {
  it('renders DaisyUI classes for variant and size', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const input = new DaisyInput(container);
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

      const input = new DaisyInput(container);
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
      const input = new DaisyInput(container);
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
      const input = new DaisyInput(container);
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

      const input = new DaisyInput(container);
      const element = input.render({
        disabled: true,
        required: true
      });

      expect(element.disabled).toBe(true);
      expect(element.required).toBe(true);
    });
  });
});
