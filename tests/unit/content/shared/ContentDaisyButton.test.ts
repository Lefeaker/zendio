import { describe, expect, it, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { UiButton } from '../../../../src/ui/primitives/button';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('ContentDaisyButton', () => {
  it('renders aligned variants and loading semantics', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const host = document.createElement('div');
      document.body.append(host);

      const element = new UiButton(host).render({
        label: 'Delete',
        variant: 'danger',
        loading: true
      });

      expect(element.className).toContain('btn');
      expect(element.className).toContain('btn-error');
      expect(element.classList.contains('loading')).toBe(true);
      expect(element.getAttribute('aria-busy')).toBe('true');
      expect(element.disabled).toBe(true);
    });
  });

  it('preserves click handlers and data attributes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const host = document.createElement('div');
      document.body.append(host);
      const onClick = vi.fn();

      const element = new UiButton(host).render({
        label: 'Open',
        variant: 'outline',
        dataRole: 'open-button',
        dataAttributes: { testid: 'content-open' },
        onClick
      });

      element.click();
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(element.dataset.role).toBe('open-button');
      expect(element.dataset.testid).toBe('content-open');
      expect(element.className).toContain('btn-outline');
    });
  });
});
