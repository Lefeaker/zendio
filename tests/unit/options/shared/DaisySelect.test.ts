import { describe, expect, it, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { UiSelect } from '../../../../src/ui/primitives/select';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisySelect', () => {
  it('renders options with current value and custom classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const select = new UiSelect(container).render({
        id: 'routing-type',
        value: 'keyword',
        className: 'routing-rule-type min-h-[32px]',
        options: [
          { value: 'domain', label: '域名' },
          { value: 'keyword', label: '关键词' }
        ]
      });

      expect(select.id).toBe('routing-type');
      expect(select.value).toBe('keyword');
      expect(select.className).toContain('routing-rule-type');
      expect(select.className).toContain('min-h-[32px]');
    });
  });

  it('emits selected value on change', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const onChange = vi.fn();
      const select = new UiSelect(container).render({
        options: [
          { value: 'domain', label: '域名' },
          { value: 'keyword', label: '关键词' }
        ],
        onChange
      });

      select.value = 'keyword';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onChange).toHaveBeenCalledWith('keyword', expect.any(Event));
    });
  });

  it('applies validation semantics', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);
      const select = new UiSelect(container).render({
        options: [{ value: 'domain', label: '域名' }],
        validationState: 'error',
        ariaDescribedBy: 'select-error'
      });

      expect(select.className).toContain('select-error');
      expect(select.getAttribute('aria-invalid')).toBe('true');
      expect(select.getAttribute('aria-describedby')).toBe('select-error');
    });
  });
});
