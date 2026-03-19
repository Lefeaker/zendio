import { describe, it, expect, vi } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { DaisyButton } from '@options/components/shared/DaisyButton';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyButton', () => {
  it('renders with DaisyUI classes for variant and size', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const button = new DaisyButton(container);
      const element = button.render({
        label: 'Test',
        variant: 'secondary',
        size: 'sm'
      });

      expect(element.className).toContain('btn');
      expect(element.className).toContain('btn-secondary');
      expect(element.className).toContain('btn-sm');
    });
  });

  it('handles click events', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const onClick = vi.fn();
      const button = new DaisyButton(container);
      const element = button.render({
        label: 'Action',
        onClick
      });

      element.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  it('renders icon when iconName provided', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const button = new DaisyButton(container);
      const element = button.render({
        label: 'Save',
        iconName: 'Activity'
      });

      expect(element.querySelector('svg')).not.toBeNull();
    });
  });

  it('applies disabled state', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const button = new DaisyButton(container);
      const element = button.render({
        label: 'Disabled',
        disabled: true
      });

      expect(element.disabled).toBe(true);
      expect(element.getAttribute('aria-disabled')).toBe('true');
    });
  });

  it('sets aria-label when provided', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const button = new DaisyButton(container);
      const element = button.render({
        label: 'Save',
        ariaLabel: 'Save changes'
      });

      expect(element.getAttribute('aria-label')).toBe('Save changes');
    });
  });
});
