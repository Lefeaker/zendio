import { describe, expect, it, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { UiTextarea } from '../../../../src/ui/primitives/textarea';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyTextarea', () => {
  it('renders configured textarea attributes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const element = new UiTextarea(container).render({
        id: 'note',
        rows: 6,
        value: 'hello',
        placeholder: 'Write note',
        ariaLabel: 'Note field',
        disabled: true,
        dataAttributes: { scope: 'reader' },
        className: 'custom-textarea'
      });

      expect(element.id).toBe('note');
      expect(element.rows).toBe(6);
      expect(element.value).toBe('hello');
      expect(element.placeholder).toBe('Write note');
      expect(element.getAttribute('aria-label')).toBe('Note field');
      expect(element.disabled).toBe(true);
      expect(element.dataset.scope).toBe('reader');
      expect(element.className).toContain('custom-textarea');
    });
  });

  it('emits input and blur callbacks', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document, window }) => {
      const container = document.createElement('div');
      document.body.append(container);
      const onChange = vi.fn();
      const onBlur = vi.fn();

      const element = new UiTextarea(container).render({
        onChange,
        onBlur
      });

      element.value = 'updated';
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('blur', { bubbles: true }));

      expect(onChange).toHaveBeenCalledWith('updated', expect.any(Event));
      expect(onBlur).toHaveBeenCalledWith('updated', expect.any(Event));
    });
  });
});
