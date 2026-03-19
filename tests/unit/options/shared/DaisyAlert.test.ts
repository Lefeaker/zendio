import { describe, it, expect, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { DaisyAlert } from '@options/components/shared/DaisyAlert';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyAlert', () => {
  it('applies type classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const alert = new DaisyAlert(document.body);
      const element = alert.render({ type: 'success', message: 'Saved' });

      expect(element.className).toContain('alert');
      expect(element.className).toContain('alert-success');
    });
  });

  it('renders message and description', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const alert = new DaisyAlert(document.body);
      const element = alert.render({
        type: 'info',
        message: 'Heads up',
        description: 'More context'
      });

      expect(element.textContent).toContain('Heads up');
      expect(element.textContent).toContain('More context');
    });
  });

  it('includes icon by default', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const alert = new DaisyAlert(document.body);
      const element = alert.render({ type: 'warning', message: 'Careful' });

      expect(element.querySelector('svg')).not.toBeNull();
    });
  });

  it('supports dismissible alerts', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const onDismiss = vi.fn();
      const container = document.createElement('div');
      document.body.append(container);

      const alert = new DaisyAlert(container);
      const element = alert.render({
        type: 'error',
        message: 'Oops',
        dismissible: true,
        onDismiss
      });

      const button = element.querySelector('button');
      expect(button).not.toBeNull();

      button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(container.children.length).toBe(0);
    });
  });
});
