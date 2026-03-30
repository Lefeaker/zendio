import { describe, expect, it, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { UiCheckbox } from '../../../../src/ui/primitives/checkbox';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyCheckbox', () => {
  it('renders optional label text and custom classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const checkbox = new UiCheckbox(container);
      const input = checkbox.render({
        id: 'feature-toggle',
        label: '启用功能',
        inputClassName: 'feature-checkbox',
        labelClassName: 'feature-label'
      });

      expect(input.id).toBe('feature-toggle');
      expect(input.className).toContain('feature-checkbox');
      expect(container.querySelector('label')?.className).toContain('feature-label');
      expect(container.textContent).toContain('启用功能');
    });
  });

  it('supports checkbox-only rendering and change events', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const onChange = vi.fn();
      const checkbox = new UiCheckbox(container);
      const input = checkbox.render({
        ariaLabel: '仅复选框',
        onChange
      });

      expect(container.textContent).toBe('');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onChange).toHaveBeenCalledWith(true, expect.any(Event));
    });
  });

  it('exposes validation state through classes and aria', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const checkbox = new UiCheckbox(container);
      const input = checkbox.render({
        validationState: 'error',
        ariaDescribedBy: 'checkbox-error'
      });

      expect(input.className).toContain('checkbox-error');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('checkbox-error');
    });
  });
});
